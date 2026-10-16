-- ============================================================================
-- 강사 · 관리자의 시험 신청은 특강 신청 수에 세지 않는다 (2026-10-16 Alan — "강사가 테스트로 특강신청을 눌러본거는 집계에서 빼줘. 이혜영, 이영수, 알런")
--
--  1) lecture_signups.staff_test — 신청한 사람의 **진짜 등급**(profiles.role — 테스트 등급이 아니다)이 강사 · 관리자면 참.
--     이름이 아니라 등급으로 본다 — 학생명단 · 숙제 미제출 · 출석 명단과 같은 규칙(src/lib/roster-accounts.ts — 강사 · 관리자는 빼고 조교는 센다).
--     신청을 넣을 때 트리거(lecture_signups_check_way)가 정하고 화면 · API 가 보낸 값은 믿지 않는다 (학생은 이 칸을 쓸 권한도 없다).
--     신청할 때 정해 두므로 나중에 등급이 바뀌거나 계정을 지워도 신청 수가 어긋나지 않는다 (지울 때 등급을 다시 묻지 않는다).
--  2) 신청 수(special_lecture_ways · special_lectures 의 applied_count) · 정원에 세지 않는다 — 시험 신청은 자리를 차지하지 않는다.
--     그래서 특강 신청 화면의 종류 · 방식 숫자 · 특강 설정 · 반 편성 달력의 '신청 N명' · 학생 특강 신청 화면의 신청 수와 정원 마감이 모두 학생만 센다.
--     지금까지 들어온 시험 신청에도 표시를 하고 신청 수를 다시 센다.
--  3) '신청자가 있으면' 막던 두 곳도 시험 신청은 신청자로 치지 않는다 — 특강 종류 바꾸기(lecture_kind_signup_block) · 반 편성 달력에서 빼기(lecture_signup_block).
--     그때 그 특강의 시험 신청은 함께 지운다 (옛 특강을 눌러 본 것이다 — 남겨 두면 신청 방식 줄 · 특강을 지울 수 없다).
--     반 편성 달력이 '신청 N명'(학생만)으로 잠그므로 화면과 DB 가 같은 말을 한다.
--  4) 후기 링크 한 번만(review_link_taken · review_link_reused)도 시험 신청 줄은 보지 않는다 — 강사가 학생의 후기 링크로 시험해 봐도 그 학생이 막히지 않게.
--     시험 신청을 넣을 때의 검사는 학생과 같다 (강사가 학생이 보는 오류를 그대로 시험해 본다).
--  5) 시험 신청은 지우지 않는다 — 특강 신청 화면에 '강사 · 관리자 시험 신청' 으로 따로 보이고 거기서 취소한다.
-- ============================================================================

-- ─── 1. 시험 신청 칸 ─────────────────────────────────────────────────────────
-- 칸을 더하는 순간 신청 표가 잠긴다(ACCESS EXCLUSIVE, 이 마이그레이션이 끝날 때까지) — 그동안 들어오는 신청 · 취소는 끝날 때까지 기다린다.
-- 그래서 아래에서 다시 센 수와 어긋나지 않는다
alter table public.lecture_signups add column if not exists staff_test boolean not null default false;
comment on column public.lecture_signups.staff_test is
  '강사 · 관리자(진짜 등급)가 넣은 시험 신청 (2026-10-16) — 신청 수 · 정원에 세지 않고, 특강 종류를 바꾸거나 달력에서 빼도 막지 않는다(함께 지운다). 신청을 넣을 때 트리거 lecture_signups_check_way 가 정한다';

-- 지금까지 들어온 신청 — 지금 등급으로 표시한다
update public.lecture_signups s
   set staff_test = true
  from public.profiles p
 where p.id = s.user_id
   and p.role in ('instructor', 'admin')
   and not s.staff_test;

-- ─── 2. 트리거 · 함수 ────────────────────────────────────────────────────────
-- 신청 수 · 정원 — 방식마다. applied_count 를 조건부로 올려서 마지막 한 자리에 동시에 신청해도 넘지 않는다.
-- 강사 · 관리자 시험 신청(staff_test)은 세지 않는다 — 들어올 때 올리지 않고 지울 때 내리지 않는다 (2026-10-16)
create or replace function private.lecture_signups_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.staff_test then
      return old;  -- 시험 신청은 센 적이 없다
    end if;
    update public.special_lecture_ways
       set applied_count = greatest(applied_count - 1, 0)
     where lecture_id = old.lecture_id and way = old.way;
    update public.special_lectures
       set applied_count = greatest(applied_count - 1, 0)
     where id = old.lecture_id;
    return old;
  end if;

  if new.staff_test then
    return new;  -- 강사 · 관리자 시험 신청은 자리를 차지하지 않는다 (정원이 찼어도 들어간다)
  end if;

  update public.special_lecture_ways
     set applied_count = applied_count + 1
   where lecture_id = new.lecture_id
     and way = new.way
     and (capacity is null or applied_count < capacity);
  if not found then
    raise exception 'lecture_full' using errcode = 'P0001', detail = '이 신청 방식은 정원이 찼습니다.';
  end if;
  update public.special_lectures
     set applied_count = applied_count + 1
   where id = new.lecture_id;
  return new;
end;
$$;
revoke execute on function private.lecture_signups_sync() from public, anon, authenticated;

-- 신청을 넣을 때 맨 먼저 — 시험 신청인지 정하고(2026-10-16), 방식이 비었으면(배포 사이 옛 앱) 그 특강의 첫 받는 방식으로, 그리고 **한 학생 한 특강에 한 방식**.
-- 이름이 c 로 시작해 과목(e) · 조건(r) 검사보다 먼저 돈다 (BEFORE 트리거는 이름 순이다). 본인 줄만 본다 — 남이 신청했는지 엿보는 길이 되지 않게
create or replace function private.lecture_signups_check_way()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 강사 · 관리자(진짜 등급 — 테스트 등급이 아니다)가 넣은 신청은 시험 신청이다 — 신청 수 · 정원에 세지 않는다 (2026-10-16 Alan).
  -- 넣는 쪽이 보낸 값은 믿지 않고 늘 여기서 정한다. 학생명단 · 숙제 미제출 · 출석 명단과 같은 등급 (src/lib/roster-accounts.ts)
  new.staff_test := exists (
    select 1 from public.profiles p
     where p.id = new.user_id and p.role in ('instructor', 'admin')
  );

  if new.way is null then
    select w.way into new.way
      from public.special_lecture_ways w
     where w.lecture_id = new.lecture_id and w.enabled
     order by array_position(array['onsite', 'video', 'paper', 'pdf'], w.way)
     limit 1;
  end if;

  if new.user_id = (select auth.uid()) then
    -- 닫힌 특강 · 받지 않는 방식이면 조건(후기 · 팔로우)을 묻기 전에 그렇다고 말한다 — 정책(lecture_way_open)이 한 번 더 막는다
    if not private.lecture_way_open(new.lecture_id, new.way) then
      raise exception 'lecture_signup_closed'
        using errcode = 'P0001', detail = '지금은 이 방식으로 신청을 받지 않습니다.';
    end if;
    -- 같은 학생이 두 방식을 동시에 눌러도 하나만 — 학생 · 특강마다 줄을 세운다
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lecture_signup:' || new.lecture_id || ':' || new.user_id, 0));
    if exists (select 1 from public.lecture_signups s where s.lecture_id = new.lecture_id and s.user_id = new.user_id) then
      raise exception 'lecture_already_signed'
        using errcode = 'P0001', detail = '이미 신청한 특강입니다. 방식을 바꾸려면 신청을 취소하고 다시 신청해 주세요.';
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function private.lecture_signups_check_way() from public, anon, authenticated;

-- 신청을 넣을 때 — 그 **방식의** 신청 조건 (후기 링크 · 유튜브 구독 · 인스타그램 팔로우).
-- 후기 링크 한 번만은 시험 신청 줄을 보지 않는다 — 강사가 학생의 링크로 시험해 봐도 그 학생이 막히지 않게 (2026-10-16)
create or replace function private.lecture_signups_review_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_condition text;
  v_key text;
begin
  select w.signup_condition into v_condition
    from public.special_lecture_ways w
   where w.lecture_id = new.lecture_id and w.way = new.way;

  -- 조건이 아닌 칸은 저장하지 않는다 — 다른 방식에 딸려 온 값을 남기지 않는다
  if v_condition is distinct from 'review' then
    new.review_url := null;
  end if;
  if v_condition is distinct from 'sns' then
    new.sns_follow := null;
  end if;

  if v_condition = 'sns' then
    if new.sns_follow is null then
      raise exception 'sns_follow_required'
        using errcode = 'P0001', detail = '이 신청 방식은 역전토익 유튜브 구독 · 인스타그램 팔로우를 하고 신청할 수 있습니다.';
    end if;
    return new;
  end if;

  if v_condition is distinct from 'review' then
    return new;
  end if;

  if new.review_url is null then
    raise exception 'review_link_required'
      using errcode = 'P0001', detail = '이 신청 방식은 YBM 수강후기 링크를 올려야 신청할 수 있습니다.';
  end if;

  v_key := private.review_link_key(new.review_url);
  if v_key is null then
    return new; -- 링크의 꼴은 표의 check 제약(20261008110000)이 본다
  end if;

  -- 같은 링크로 동시에 둘이 신청해도 하나만 — 링크마다 줄을 세운다. 앞 사람이 끝난 뒤 아래 조회가 그 줄을 본다
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lecture_review_link:' || v_key, 0));

  if exists (
    select 1
      from public.lecture_signups s
     where s.review_url is not null
       and not s.staff_test
       and s.user_id <> new.user_id
       and private.review_link_key(s.review_url) = v_key
  ) then
    raise exception 'review_link_taken'
      using errcode = 'P0001', detail = '다른 학생이 이미 특강 신청에 쓴 YBM 수강후기 링크입니다.';
  end if;

  if exists (
    select 1
      from public.lecture_signups s
      join public.special_lectures l on l.id = s.lecture_id
      join public.special_lectures n on n.id = new.lecture_id
     where s.review_url is not null
       and not s.staff_test
       and s.user_id = new.user_id
       and l.term_id <> n.term_id
       and private.review_link_key(s.review_url) = v_key
  ) then
    raise exception 'review_link_reused'
      using errcode = 'P0001', detail = '다른 달 특강 신청에 쓴 YBM 수강후기 링크입니다. 그 달 후기를 새로 써야 합니다.';
  end if;

  return new;
end;
$$;
revoke execute on function private.lecture_signups_review_check() from public, anon, authenticated;
comment on function private.lecture_signups_review_check() is
  '특강 신청을 넣을 때 그 신청 방식의 조건을 본다 (2026-10-16 — 방식마다) — review: YBM 수강후기 링크(없으면 review_link_required · 다른 학생 링크 review_link_taken · 다른 달에 쓴 내 링크 review_link_reused) · sns: 인스타그램 팔로우(없으면 sns_follow_required). 조건이 아닌 칸은 비운다. 강사 · 관리자 시험 신청(staff_test) 줄은 링크 검사에서 보지 않는다 (2026-10-16)';


-- 무슨 특강이 정해지거나 바뀌면 신청 방식 줄을 맞춘다. 신청자가 있으면 무슨 특강을 바꾸지 못한다 (학생은 그 특강을 신청한 것이다).
-- 강사 · 관리자 시험 신청은 신청자로 치지 않고 종류가 바뀌면 함께 지운다 (2026-10-16)
create or replace function private.sync_lecture_ways()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ways text[] := private.lecture_ways_of(new.kinds[1]);
begin
  if tg_op = 'UPDATE' then
    if old.kinds is not distinct from new.kinds then
      return new;
    end if;
    if exists (select 1 from public.lecture_signups s where s.lecture_id = new.id and not s.staff_test) then
      raise exception 'lecture_kind_signup_block'
        using errcode = 'P0001', detail = to_char(new.date, 'YYYY-MM-DD');
    end if;
    -- 강사 · 관리자 시험 신청은 신청자로 치지 않는다 — 옛 특강을 눌러 본 것이라 종류가 바뀌면 함께 지운다 (2026-10-16)
    delete from public.lecture_signups s where s.lecture_id = new.id and s.staff_test;
  end if;

  delete from public.special_lecture_ways w
   where w.lecture_id = new.id and not (w.way = any (v_ways));
  insert into public.special_lecture_ways (lecture_id, way)
  select new.id, x.way from unnest(v_ways) as x(way)
  on conflict (lecture_id, way) do nothing;
  return new;
end;
$$;
revoke execute on function private.sync_lecture_ways() from public, anon, authenticated;
comment on function private.sync_lecture_ways() is
  '특강의 신청 방식 줄을 맞춘다 (2026-10-16) — 만들 때 · 무슨 특강이 바뀔 때. 새 방식은 받기 켬 · 조건 없음 · 정원 없음. 신청자가 있는 특강의 종류를 바꾸면 lecture_kind_signup_block — 강사 · 관리자 시험 신청(staff_test)은 신청자로 치지 않고 함께 지운다 (2026-10-16)';

-- ─── 3. 반 편성 달력 저장 — 빼는 특강의 시험 신청은 신청자로 치지 않고 함께 지운다 (2026-10-16) ─────
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

  -- ─── 특강 검증 — 무슨 특강(넷 중 하나 또는 없음) · 메모(1~100자) ─────────────
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
         -- 특강 하나 = 무슨 특강 하나 (2026-10-16 — 현장 · 수업영상 · 시험지 · PDF 는 신청 방식이다)
         or coalesce(jsonb_array_length(e -> 'kinds'), 0) > 1
         or exists (
              select 1 from jsonb_array_elements_text(coalesce(e -> 'kinds', '[]'::jsonb)) as k
              where k not in ('rc', 'lc', 'mock1', 'mock2')
            )
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

    -- 빠지는 특강에 신청자가 있으면 저장 전체를 되돌린다 — 강사 · 관리자 시험 신청(staff_test)은 신청자로 치지 않는다 (2026-10-16)
    select string_agg(to_char(l.date, 'YYYY-MM-DD'), ',' order by l.date)
      into v_bad
    from public.special_lectures l
    where l.term_id = v_term_id
      and not (l.id = any(v_keep))
      and exists (select 1 from public.lecture_signups g where g.lecture_id = l.id and not g.staff_test);
    if v_bad is not null then
      raise exception 'lecture_signup_block' using errcode = 'P0001', detail = v_bad;
    end if;

    -- 그 특강의 시험 신청은 특강과 함께 지운다 (남겨 두면 특강 · 신청 방식 줄을 지울 수 없다)
    delete from public.lecture_signups g
     using public.special_lectures l
     where g.lecture_id = l.id
       and l.term_id = v_term_id
       and not (l.id = any(v_keep))
       and g.staff_test;

    delete from public.special_lectures l
    where l.term_id = v_term_id and not (l.id = any(v_keep));

    -- 수정 — 날 · 강사 · 메모 · 무슨 특강만. 신청 받기 · 신청 방식 · 조건 · 정원 · 안내는 특강 신청 화면에서 정하고 여기서 건드리지 않는다.
    -- 무슨 특강이 바뀌면 트리거(special_lectures_sync_ways)가 신청 방식 줄을 맞춘다 — 신청자가 있으면 lecture_kind_signup_block
    update public.special_lectures l
    set date        = (e.v ->> 'date')::date,
        lecturer_id = (e.v ->> 'lecturer_id')::bigint,
        content     = nullif(btrim(coalesce(e.v ->> 'content', '')), ''),
        kinds       = private.lecture_kinds(e.v -> 'kinds')
    from jsonb_array_elements(v_lectures) as e(v)
    where e.v ->> 'id' is not null and l.id = (e.v ->> 'id')::bigint and l.term_id = v_term_id;

    -- 추가 — 신청은 닫힌 채로 시작한다 (강사가 특강 신청에서 '신청 받기' 를 누른다). 신청 방식 줄은 트리거가 만든다
    insert into public.special_lectures (term_id, date, lecturer_id, content, kinds)
    select
      v_term_id,
      (e.v ->> 'date')::date,
      (e.v ->> 'lecturer_id')::bigint,
      nullif(btrim(coalesce(e.v ->> 'content', '')), ''),
      private.lecture_kinds(e.v -> 'kinds')
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
  '반 편성 달력 저장. p_parts 로 항목만 고른다. 수업일·특강은 그 달 ±1개월, 수업일은 다른 기수와 겹칠 수 없다. 특강은 id 로 유지되고(신청자가 있으면 삭제 거부 — 강사 · 관리자 시험 신청은 신청자로 치지 않고 함께 지운다, 2026-10-16) 무슨 특강(kinds — rc · lc · mock1 · mock2 중 하나, 2026-10-16) · 강사 · 메모만 받는다. 신청 받기 · 신청 방식 · 조건 · 정원 · 안내는 특강 신청 화면에서 정한다';

revoke all on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) from public, anon;
grant execute on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) to authenticated, service_role;

-- ─── 4. 신청 수 다시 세기 — 학생 신청만 ──────────────────────────────────────
-- 시험 신청을 빼면 수는 줄기만 한다. 혹시 세던 수가 어긋나 있어도 정원 check(capacity >= applied_count)에 걸리지 않게
-- 정원이 그보다 적은 줄은 그 수로 맞춘다 (20261016120000 과 같은 방법)
update public.special_lecture_ways w
   set applied_count = c.n,
       capacity = case when w.capacity is not null and w.capacity < c.n then least(c.n, 1000) else w.capacity end
  from (
    select w2.lecture_id, w2.way, count(s.id)::int as n
      from public.special_lecture_ways w2
      left join public.lecture_signups s
        on s.lecture_id = w2.lecture_id and s.way = w2.way and not s.staff_test
     group by w2.lecture_id, w2.way
  ) as c
 where c.lecture_id = w.lecture_id
   and c.way = w.way
   and w.applied_count <> c.n;

update public.special_lectures l
   set applied_count = c.n
  from (
    select l2.id, count(s.id)::int as n
      from public.special_lectures l2
      left join public.lecture_signups s on s.lecture_id = l2.id and not s.staff_test
     group by l2.id
  ) as c
 where c.id = l.id
   and l.applied_count <> c.n;

comment on column public.special_lecture_ways.applied_count is '이 방식의 신청 수 — 학생만 (강사 · 관리자 시험 신청은 세지 않는다, 2026-10-16). lecture_signups 트리거가 유지한다 (직접 고치지 않는다)';
comment on column public.special_lectures.applied_count is '신청 수 합계 (모든 방식, 학생만 — 강사 · 관리자 시험 신청은 세지 않는다, 2026-10-16) — lecture_signups 트리거가 유지한다';
