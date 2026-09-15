-- ============================================================================
-- 특강 종류 · 월(기수) 구분 · 학생 시간표 연결 (2026-09-15 Alan 요청)
--
--  1) 특강에 종류를 고른다 — RC특강 / LC특강 / 1차 모의고사 / 2차 모의고사. 중복 선택 가능.
--     special_lectures.kinds text[] 로 담고, 내용(content)은 메모라서 선택 입력이 된다.
--     기존 행은 내용만 있으므로 "종류 또는 내용 중 하나는 있어야 한다" 로 제약을 건다.
--
--  2) 한 날짜는 한 기수(월)의 수업일에만 들어간다.
--     9월 기수가 10/1 을 수업일로 쓰고 있으면 10월 기수는 그 날짜를 쓸 수 없다.
--     같은 날짜가 두 기수에 잡히면 주5일 수강생의 회차가 겹쳐서 시간표가 어긋난다.
--
--  3) 그 달 수강생은 그 달 특강을 볼 수 있다 (내 시간표에 함께 표시).
--     지금까지 special_lectures 는 스태프만 조회할 수 있었다.
-- ============================================================================

-- ─── 1. 특강 종류 ──────────────────────────────────────────────────────────
alter table public.special_lectures
  add column kinds text[] not null default '{}';

comment on column public.special_lectures.kinds is
  '특강 종류 (중복 선택). rc | lc | mock1 | mock2 — src/lib/utils.ts 의 LECTURE_KINDS 와 같은 값';
comment on column public.special_lectures.content is
  '특강 메모 (선택). 종류만 고르고 비워 둘 수 있다';

alter table public.special_lectures
  alter column content drop not null;

-- 내용 제약을 "있으면 1~100자" 로 바꾼다 (인라인 check 의 기본 이름)
alter table public.special_lectures
  drop constraint if exists special_lectures_content_check;
alter table public.special_lectures
  add constraint special_lectures_content_check
  check (content is null or (content = btrim(content) and char_length(content) between 1 and 100));

alter table public.special_lectures
  add constraint special_lectures_kinds_check
  check (cardinality(kinds) <= 4 and kinds <@ array['rc', 'lc', 'mock1', 'mock2']::text[]);

-- 종류를 고르거나 내용을 적거나, 둘 중 하나는 있어야 한다 (기존 행은 내용이 있어 그대로 통과)
alter table public.special_lectures
  add constraint special_lectures_has_detail
  check (cardinality(kinds) > 0 or content is not null);

-- ─── 2. 그 달 수강생이 그 달 특강을 볼 수 있다 ─────────────────────────────
grant select on public.special_lectures to authenticated;

create policy "special_lectures: 수강생 조회" on public.special_lectures
  for select to authenticated
  using ((select private.is_term_enrollee(special_lectures.term_id)));

-- ─── 3. 저장: 종류 + 기수(월) 구분 ─────────────────────────────────────────
-- 2차 수정: p_lectures 의 각 항목에 "kinds": ["rc","mock1"] 를 받는다.
--           수업일이 다른 기수와 겹치면 date_in_other_term 으로 저장 전체를 거부한다.
create or replace function public.save_term_schedule(
  p_year      int,
  p_month     int,
  p_opens     date,
  p_closes    date,
  p_mwf       date[],
  p_ttf       date[],
  p_lectures  jsonb,
  p_parts     text[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_term_id     bigint;
  v_first       date;
  v_last        date;
  v_from        date;   -- 찍을 수 있는 가장 이른 날 (그 달 −1개월)
  v_to          date;   -- 찍을 수 있는 가장 늦은 날 (그 달 +1개월)
  v_mwf         date[] := coalesce(p_mwf, '{}');
  v_ttf         date[] := coalesce(p_ttf, '{}');
  v_lectures    jsonb  := coalesce(p_lectures, '[]'::jsonb);
  v_parts       text[] := coalesce(p_parts, array['dates', 'mwf', 'ttf', 'lectures']);
  v_do_dates    boolean;
  v_do_mwf      boolean;
  v_do_ttf      boolean;
  v_do_lectures boolean;
  v_bad         text;
  v_sections    int;
begin
  if not (select private.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_year is null or p_month is null or p_year not between 2020 and 2100 or p_month not between 1 and 12 then
    raise exception 'invalid_term' using errcode = '22023';
  end if;

  -- ─── 저장할 항목 고르기 ──────────────────────────────────────────────────
  if 'all' = any(v_parts) then
    v_parts := array['dates', 'mwf', 'ttf', 'lectures'];
  end if;
  if exists (select 1 from unnest(v_parts) as p where p is null or p not in ('dates', 'mwf', 'ttf', 'lectures')) then
    raise exception 'invalid_parts' using errcode = '22023';
  end if;
  v_do_dates    := 'dates'    = any(v_parts);
  v_do_mwf      := 'mwf'      = any(v_parts);
  v_do_ttf      := 'ttf'      = any(v_parts);
  v_do_lectures := 'lectures' = any(v_parts);
  if not (v_do_dates or v_do_mwf or v_do_ttf or v_do_lectures) then
    raise exception 'invalid_parts' using errcode = '22023';
  end if;

  -- 개강일·종강일은 그 항목을 저장할 때만 검사한다
  if v_do_dates then
    if p_opens is null or p_closes is null then
      raise exception 'dates_required' using errcode = '22023';
    end if;
    if p_closes < p_opens then
      raise exception 'closes_before_opens' using errcode = '22023';
    end if;
  end if;

  -- 수업일·특강을 찍을 수 있는 범위: 지난달 1일 ~ 다음달 말일 (달력에 함께 보이는 앞뒤 달을 덮는다)
  v_first := make_date(p_year, p_month, 1);
  v_last  := (v_first + interval '1 month')::date - 1;
  v_from  := (v_first - interval '1 month')::date;
  v_to    := (v_first + interval '2 months')::date - 1;

  -- ─── 수업일: 그 달 ± 1개월 안, 한 날짜는 한 트랙만 ──────────────────────
  if v_do_mwf and exists (select 1 from unnest(v_mwf) as d where d is null or d < v_from or d > v_to) then
    raise exception 'class_date_out_of_range' using errcode = '22023';
  end if;
  if v_do_ttf and exists (select 1 from unnest(v_ttf) as d where d is null or d < v_from or d > v_to) then
    raise exception 'class_date_out_of_range' using errcode = '22023';
  end if;
  if v_do_mwf and v_do_ttf then
    select string_agg(to_char(x.d, 'YYYY-MM-DD'), ',' order by x.d) into v_bad
    from (select unnest(v_mwf) as d intersect select unnest(v_ttf)) as x;
    if v_bad is not null then
      raise exception 'track_overlap' using errcode = '22023', detail = v_bad;
    end if;
  end if;

  -- ─── 특강: 그 달 ± 1개월 안, 강사 지정, 종류(1~4개) 또는 내용(1~100자) ──
  if v_do_lectures then
    if jsonb_typeof(v_lectures) <> 'array' or jsonb_array_length(v_lectures) > 100 then
      raise exception 'invalid_lectures' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_lectures) as e
      where jsonb_typeof(e) <> 'object'
         or e ->> 'date' is null
         or e ->> 'lecturer_id' is null
         or (e ->> 'date')::date not between v_from and v_to
         or (e -> 'kinds' is not null and jsonb_typeof(e -> 'kinds') <> 'array')
         or coalesce(jsonb_array_length(e -> 'kinds'), 0) > 4
         or exists (
              select 1 from jsonb_array_elements_text(coalesce(e -> 'kinds', '[]'::jsonb)) as k
              where k not in ('rc', 'lc', 'mock1', 'mock2')
            )
         -- 종류도 내용도 없으면 무엇을 하는 특강인지 알 수 없다
         or (coalesce(jsonb_array_length(e -> 'kinds'), 0) = 0
             and char_length(btrim(coalesce(e ->> 'content', ''))) = 0)
         or char_length(btrim(coalesce(e ->> 'content', ''))) > 100
    ) then
      raise exception 'invalid_lectures' using errcode = '22023';
    end if;
  end if;

  -- ─── 기수 행 ─────────────────────────────────────────────────────────────
  insert into public.terms (year, month) values (p_year, p_month)
  on conflict (year, month) do nothing;
  select t.id into v_term_id from public.terms t where t.year = p_year and t.month = p_month;

  -- ─── 월(기수) 구분: 같은 날짜를 다른 기수가 이미 수업일로 쓰고 있으면 거부 ──
  select string_agg(distinct to_char(d.date, 'YYYY-MM-DD') || '@' || t.year || '-' || lpad(t.month::text, 2, '0'), ',')
    into v_bad
  from public.term_class_dates d
  join public.terms t on t.id = d.term_id
  where d.term_id <> v_term_id
    and d.date = any(
      case
        when v_do_mwf and v_do_ttf then v_mwf || v_ttf
        when v_do_mwf then v_mwf
        when v_do_ttf then v_ttf
        else '{}'::date[]
      end
    );
  if v_bad is not null then
    raise exception 'date_in_other_term' using errcode = '22023', detail = v_bad;
  end if;

  if v_do_dates then
    update public.terms
    set enrollment_opens_at = p_opens,
        closes_at = p_closes
    where id = v_term_id;
  end if;

  -- ─── 수업일: 저장하는 트랙만 갈아 끼운다 ────────────────────────────────
  -- 저장하는 트랙의 날짜는 반대 트랙에서도 빼서 "한 날짜 = 한 트랙" 을 지킨다
  if v_do_mwf then
    delete from public.term_class_dates
    where term_id = v_term_id and (track = 'mwf' or date = any(v_mwf));
  end if;
  if v_do_ttf then
    delete from public.term_class_dates
    where term_id = v_term_id and (track = 'ttf' or date = any(v_ttf));
  end if;
  if v_do_mwf then
    insert into public.term_class_dates (term_id, date, track)
    select v_term_id, m.d, 'mwf' from (select distinct unnest(v_mwf) as d) as m;
  end if;
  if v_do_ttf then
    insert into public.term_class_dates (term_id, date, track)
    select v_term_id, t.d, 'ttf' from (select distinct unnest(v_ttf) as d) as t;
  end if;

  -- ─── 특강 ────────────────────────────────────────────────────────────────
  if v_do_lectures then
    delete from public.special_lectures where term_id = v_term_id;
    insert into public.special_lectures (term_id, date, lecturer_id, content, kinds)
    select
      v_term_id,
      (l.e ->> 'date')::date,
      (l.e ->> 'lecturer_id')::bigint,
      nullif(btrim(coalesce(l.e ->> 'content', '')), ''),
      coalesce(
        (select array_agg(k.v order by k.ord)
         from (
           select distinct on (v) v, ord
           from jsonb_array_elements_text(coalesce(l.e -> 'kinds', '[]'::jsonb)) with ordinality as x(v, ord)
           order by v, ord
         ) as k(v, ord)),
        '{}'
      )
    from jsonb_array_elements(v_lectures) with ordinality as l(e, ord)
    order by l.ord;
  end if;

  v_sections := private.sync_term_sections(v_term_id);

  return jsonb_build_object(
    'term_id',  v_term_id,
    'parts',    to_jsonb(v_parts),
    'mwf',      (select count(*) from public.term_class_dates where term_id = v_term_id and track = 'mwf'),
    'ttf',      (select count(*) from public.term_class_dates where term_id = v_term_id and track = 'ttf'),
    'lectures', (select count(*) from public.special_lectures where term_id = v_term_id),
    'sections', v_sections
  );
end;
$$;

comment on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) is
  '반 편성 달력 저장. p_parts 로 개강·종강(dates) / 월수금(mwf) / 화목금(ttf) / 특강(lectures) 중 저장할 항목만 고른다. null 이면 전부. 수업일·특강은 그 달 ±1개월까지, 수업일은 다른 기수와 겹칠 수 없다. 특강은 kinds(rc|lc|mock1|mock2) 중복 선택';

revoke all on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) from public, anon;
grant execute on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) to authenticated, service_role;
