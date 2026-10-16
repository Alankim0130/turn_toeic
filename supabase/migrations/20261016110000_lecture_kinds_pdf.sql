-- ============================================================================
-- 특강 종류 — 모의고사 'PDF 수령 신청' 을 더한다 (2026-10-16 Alan — "모의고사에서 'pdf수령' 신청이 하나 더 추가되면 좋겠어!!")
--
--  1차 · 2차 모의고사가 현강신청 · 시험지 수령 신청에 더해 **PDF 수령 신청**을 받는다 — 종류 여덟 → 열:
--    rc · rc_video · lc · lc_video · mock1 · mock1_paper · mock1_pdf · mock2 · mock2_paper · mock2_pdf
--  특강 하나 = 종류 하나는 그대로다 (20261015130000) — 같은 날 2차 모의고사 시험지 수령과 PDF 수령은 특강 두 개이고 신청 · 정원 · 조건 · 안내가 따로다.
--  앱 LECTURE_KINDS(src/lib/utils.ts)와 같은 값 · 같은 순서 — 바꾸면 둘 다 (lecture.test.ts 가 마지막 정의를 읽어 본다).
--
--  바꾸는 것은 셋뿐이다 — 값 목록이 적힌 곳:
--   1) private.lecture_kinds — 종류 정리 순서 (반 편성 달력 저장이 쓴다)
--   2) special_lectures_kinds_check — 표의 check
--   3) public.save_term_schedule — 반 편성 달력 저장의 종류 검사 (20261015130000 의 정의 그대로에 두 값만 더했다)
--  과목(private.lecture_kind_subject)은 손대지 않는다 — 모의고사는 과목이 없어(null) 누구나 신청하고, 새 두 값도 그 함수의 else(null)로 간다.
--  이미 있는 특강 · 신청은 바뀌지 않는다 (값을 더하기만 한다).
-- ============================================================================

-- ─── 1. 종류 정리 순서 ───────────────────────────────────────────────────────
create or replace function private.lecture_kinds(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_agg(x.k order by array_position(array['rc', 'rc_video', 'lc', 'lc_video', 'mock1', 'mock1_paper', 'mock1_pdf', 'mock2', 'mock2_paper', 'mock2_pdf'], x.k)),
    '{}')
  from (select distinct jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) as k) as x
$$;
grant execute on function private.lecture_kinds(jsonb) to authenticated, service_role;

-- ─── 2. 표의 check — 특강 하나에 하나, 값은 열 가지 ───────────────────────────
alter table public.special_lectures drop constraint if exists special_lectures_kinds_check;
alter table public.special_lectures
  add constraint special_lectures_kinds_check
  check (
    cardinality(kinds) <= 1
    and kinds <@ array['rc', 'rc_video', 'lc', 'lc_video', 'mock1', 'mock1_paper', 'mock1_pdf', 'mock2', 'mock2_paper', 'mock2_pdf']::text[]
  );
comment on column public.special_lectures.kinds is
  '특강 종류 — 하나만 (2026-10-15). rc · rc_video · lc · lc_video · mock1 · mock1_paper · mock1_pdf · mock2 · mock2_paper · mock2_pdf (현강신청 · 녹화영상신청 · 시험지 수령 신청 · PDF 수령 신청 — PDF 는 2026-10-16). 비우면 내용(content)만 있는 특강. src/lib/utils.ts 의 LECTURE_KINDS 와 같은 값';

-- ─── 3. 반 편성 달력 저장 — 종류 검사에 두 값 ────────────────────────────────
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
  v_from        date;
  v_to          date;
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
  v_keep        bigint[];
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

  if v_do_dates then
    if p_opens is null or p_closes is null then
      raise exception 'dates_required' using errcode = '22023';
    end if;
    if p_closes < p_opens then
      raise exception 'closes_before_opens' using errcode = '22023';
    end if;
  end if;

  -- 수업일·특강을 찍을 수 있는 범위: 지난달 1일 ~ 다음달 말일
  v_first := make_date(p_year, p_month, 1);
  v_last  := (v_first + interval '1 month')::date - 1;
  v_from  := (v_first - interval '1 month')::date;
  v_to    := (v_first + interval '2 months')::date - 1;

  -- ─── 수업일 ──────────────────────────────────────────────────────────────
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

  -- ─── 특강 검증 ───────────────────────────────────────────────────────────
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
         -- 특강 하나 = 종류 하나 (2026-10-15 — 현강 · 녹화영상 · 시험지 수령을 따로 받는다 · 2026-10-16 PDF 수령도)
         or coalesce(jsonb_array_length(e -> 'kinds'), 0) > 1
         or exists (
              select 1 from jsonb_array_elements_text(coalesce(e -> 'kinds', '[]'::jsonb)) as k
              where k not in ('rc', 'rc_video', 'lc', 'lc_video', 'mock1', 'mock1_paper', 'mock1_pdf', 'mock2', 'mock2_paper', 'mock2_pdf')
            )
         or (coalesce(jsonb_array_length(e -> 'kinds'), 0) = 0
             and char_length(btrim(coalesce(e ->> 'content', ''))) = 0)
         or char_length(btrim(coalesce(e ->> 'content', ''))) > 100
         or ((e ->> 'capacity') is not null and (e ->> 'capacity')::int not between 1 and 1000)
    ) then
      raise exception 'invalid_lectures' using errcode = '22023';
    end if;
  end if;

  -- ─── 기수 행 ─────────────────────────────────────────────────────────────
  insert into public.terms (year, month) values (p_year, p_month)
  on conflict (year, month) do nothing;
  select t.id into v_term_id from public.terms t where t.year = p_year and t.month = p_month;

  -- ─── 월(기수) 구분: 같은 날짜를 다른 기수가 이미 수업일로 쓰면 거부 ─────
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

  -- ─── 특강: id 로 유지 (수정 / 추가 / 빠진 것 삭제) ──────────────────────
  if v_do_lectures then
    select coalesce(array_agg((e ->> 'id')::bigint), '{}')
      into v_keep
    from jsonb_array_elements(v_lectures) as e
    where e ->> 'id' is not null;

    -- 넘겨받은 id 가 이 기수 특강이 맞는지 (남의 기수 특강을 건드리지 못하게)
    if exists (
      select 1 from unnest(v_keep) as k
      where not exists (select 1 from public.special_lectures l where l.id = k and l.term_id = v_term_id)
    ) then
      raise exception 'invalid_lectures' using errcode = '22023';
    end if;

    -- 빠지는 특강에 신청자가 있으면 저장 전체를 되돌린다
    select string_agg(to_char(l.date, 'YYYY-MM-DD'), ',' order by l.date)
      into v_bad
    from public.special_lectures l
    where l.term_id = v_term_id
      and not (l.id = any(v_keep))
      and exists (select 1 from public.lecture_signups g where g.lecture_id = l.id);
    if v_bad is not null then
      raise exception 'lecture_signup_block' using errcode = 'P0001', detail = v_bad;
    end if;

    delete from public.special_lectures l
    where l.term_id = v_term_id and not (l.id = any(v_keep));

    -- 정원을 이미 신청한 인원보다 적게 줄일 수 없다
    select string_agg(to_char(l.date, 'YYYY-MM-DD'), ',' order by l.date)
      into v_bad
    from jsonb_array_elements(v_lectures) as e
    join public.special_lectures l on l.id = (e ->> 'id')::bigint
    where e ->> 'id' is not null
      and (e ->> 'capacity') is not null
      and (e ->> 'capacity')::int < l.applied_count;
    if v_bad is not null then
      raise exception 'lecture_capacity_below_applied' using errcode = '22023', detail = v_bad;
    end if;

    -- 수정. 신청 설정(signup·capacity·signup_opens_at)은 **넘어온 키만** 바꾼다 —
    -- 반 편성 달력은 신청 설정을 다루지 않으므로 그냥 두면 그대로 남아야 한다
    update public.special_lectures l
    set date            = (e.v ->> 'date')::date,
        lecturer_id     = (e.v ->> 'lecturer_id')::bigint,
        content         = nullif(btrim(coalesce(e.v ->> 'content', '')), ''),
        kinds           = private.lecture_kinds(e.v -> 'kinds'),
        signup          = case when e.v ? 'signup' then coalesce((e.v ->> 'signup')::boolean, false) else l.signup end,
        capacity        = case when e.v ? 'capacity' then (e.v ->> 'capacity')::int else l.capacity end,
        signup_opens_at = case when e.v ? 'signup_opens_at' then (e.v ->> 'signup_opens_at')::timestamptz else l.signup_opens_at end
    from jsonb_array_elements(v_lectures) as e(v)
    where e.v ->> 'id' is not null and l.id = (e.v ->> 'id')::bigint and l.term_id = v_term_id;

    -- 추가
    insert into public.special_lectures (term_id, date, lecturer_id, content, kinds, signup, capacity, signup_opens_at)
    select
      v_term_id,
      (e.v ->> 'date')::date,
      (e.v ->> 'lecturer_id')::bigint,
      nullif(btrim(coalesce(e.v ->> 'content', '')), ''),
      private.lecture_kinds(e.v -> 'kinds'),
      coalesce((e.v ->> 'signup')::boolean, false),
      (e.v ->> 'capacity')::int,
      (e.v ->> 'signup_opens_at')::timestamptz
    from jsonb_array_elements(v_lectures) with ordinality as e(v, ord)
    where e.v ->> 'id' is null
    order by e.ord;
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
  '반 편성 달력 저장. p_parts 로 항목만 고른다. 수업일·특강은 그 달 ±1개월, 수업일은 다른 기수와 겹칠 수 없다. 특강은 id 로 유지되고(신청자가 있으면 삭제 거부) 종류는 하나(kinds — 열 가지 중 하나, 2026-10-15 · 모의고사 PDF 수령 2026-10-16)와 신청 설정(signup·capacity·signup_opens_at)을 함께 받는다. 신청 조건 · 안내는 특강 신청 화면에서 정하고 여기서 건드리지 않는다';

revoke all on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) from public, anon;
grant execute on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) to authenticated, service_role;
