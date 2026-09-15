-- ============================================================================
-- 반 편성 달력 2차 (2026-09-15 Alan 요청)
--
--  1) 수업일·특강이 그 달을 넘어갈 수 있다.
--     한 기수(월)의 강의가 다음 달까지 이어지는 달이 있어서, 달력에 함께 보이는
--     앞뒤 달 날짜도 그 기수의 수업일로 찍을 수 있게 창을 넓힌다.
--     (그 달 ± 1개월. 달력이 보여 주는 6주 범위를 넉넉히 덮는다)
--
--  2) 항목별로 따로 저장한다.
--     save_term_schedule(p_parts) 에 'dates' | 'mwf' | 'ttf' | 'lectures' 중 저장할 것만 넘기면
--     그 항목만 바뀌고 나머지는 건드리지 않는다. p_parts 가 null 이면 예전처럼 전부 저장한다.
--     한 트랙을 저장하면 그 날짜는 다른 트랙에서 빠진다 (한 날짜 = 한 트랙 규칙).
--
--  기존 7-인자 함수는 지우고 p_parts 를 기본값으로 붙인 함수로 바꾼다.
--  인자에 기본값이 있어 예전 호출(7개 인자)도 그대로 동작한다.
-- ============================================================================

drop function if exists public.save_term_schedule(int, int, date, date, date[], date[], jsonb);

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

  -- ─── 특강: 그 달 ± 1개월 안, 강사 지정, 내용 1~100자 ────────────────────
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
         or char_length(btrim(coalesce(e ->> 'content', ''))) not between 1 and 100
    ) then
      raise exception 'invalid_lectures' using errcode = '22023';
    end if;
  end if;

  -- ─── 기수 행 ─────────────────────────────────────────────────────────────
  insert into public.terms (year, month) values (p_year, p_month)
  on conflict (year, month) do nothing;
  select t.id into v_term_id from public.terms t where t.year = p_year and t.month = p_month;

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
    insert into public.special_lectures (term_id, date, lecturer_id, content)
    select v_term_id, (l.e ->> 'date')::date, (l.e ->> 'lecturer_id')::bigint, btrim(l.e ->> 'content')
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
  '반 편성 달력 저장. p_parts 로 개강·종강(dates) / 월수금(mwf) / 화목금(ttf) / 특강(lectures) 중 저장할 항목만 고른다. null 이면 전부. 수업일·특강은 그 달 ±1개월까지 허용한다';

revoke all on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) from public, anon;
grant execute on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) to authenticated, service_role;
