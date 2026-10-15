-- ============================================================================
-- 특강 신청 — 종류 여덟 · 특강마다 신청 조건 · 안내 글 (2026-10-15 Alan — "지금 받고있는 특강에서 RC특강과 모의고사 특강이 두 개 있는데
--   이거 구분해서 받아야해. 그래서 1. RC특강 (현강신청)/ RC 특강(녹화영상신청) 2. LC특강 (현강신청)/ LC 특강(녹화영상신청)
--   3. 1차 모의고사 (현강신청)/ 1차 모의고사 (시험지 수령 신청) 4. 2차 모의고사 (현강신청)/ 2차 모의고사 (시험지 수령 신청) 이렇게 총 8개로
--   구성되어있어야해. 그리고 특강마다 신청조건을 선택할 수 있으면 좋겠어. 1. 수업후기작성 2. 이미지참고 3. 조건없음 그리고 특강신청에서
--   강사님들이 안내문구를 쓸 수 있는 공간이 있으면 좋겠어. 안내문쓰는 공간은 수업자료실에서 사용하는 그 해당 포멧을 그대로 가져오면 좋겠어")
--
--  1) 종류 여덟 — 지금 값 rc · lc · mock1 · mock2 가 그대로 **현강신청**이고, 녹화영상 · 시험지 수령 신청을 더한다:
--       rc(RC특강 현강) · rc_video(RC특강 녹화영상) · lc(LC특강 현강) · lc_video(LC특강 녹화영상)
--       mock1(1차 모의고사 현강) · mock1_paper(1차 시험지 수령) · mock2(2차 모의고사 현강) · mock2_paper(2차 시험지 수령)
--     **특강 하나 = 종류 하나** ("구분해서 받아야해") — 같은 날 RC특강 현강 · 녹화영상은 특강 두 개다. 신청 · 정원 · 조건 · 안내가 따로다.
--     앱 LECTURE_KINDS(src/lib/utils.ts)와 같은 값 · 같은 순서 — 바꾸면 둘 다 (lecture.test.ts 가 이 파일의 check 를 읽어 본다).
--  2) 이미 종류를 둘 이상 고른 특강(예: 10/24 RC특강 + 2차 모의고사)은 **종류마다 한 줄로 나눈다** — 첫 종류(rc · lc · mock1 · mock2 순)는 그 줄에
--     남고 나머지는 새 줄(날짜 · 강사 · 내용 · 신청 설정 그대로). **그 특강의 신청자도 새 줄마다 옮겨 적는다** — 그 학생들은 둘을 함께 신청한 것이다
--     (신청 시각 · 후기 링크 그대로, 신청 수는 트리거가 센다). 옮겨 적는 동안만 신청 검사 트리거 둘(과목 · 후기)을 끈다 — 지난달 신청은 후기 링크
--     조건이 생기기 전에 들어와 링크가 없고, 단과 규칙(10-12)도 그 뒤에 생겼다. 학생이 새로 넣는 신청은 그대로 다 검사한다.
--  3) 신청 조건(special_lectures.signup_condition) — review(YBM 수강후기 작성) · sns(유튜브 구독 · 인스타그램 팔로우 — Alan 이 보낸 그림의
--     "역전토익 유튜브 구독 · 역전토익 인스타그램 팔로우 (기존 팔로우는 기존으로 표기)") · none(조건 없음). 앱 LECTURE_CONDITIONS 와 같은 값.
--     2026-10-08 의 "3주차 모의고사 = 후기 링크" 는 날짜로 저절로 정했는데(private.lecture_needs_review) 이제 강사가 특강마다 고른다 —
--     **있던 특강은 그 규칙대로 채우고**(나눈 줄은 종류마다 다시 본다 — 10/24 RC특강은 조건 없음 · 2차 모의고사는 후기) 그 함수는 지운다.
--     새로 만드는 특강은 조건 없음으로 시작한다 (특강 신청 화면에서 고른다).
--  4) 안내(special_lectures.notice) — 수업자료실 안내와 같은 서식 글(꺾쇠 태그 — note-format.ts), 5만 자. 학생 특강 카드에 보인다.
--  5) 신청의 인스타그램 팔로우(lecture_signups.sns_follow) — new(새로 팔로우) · existing(기존 팔로우). sns 조건 특강만 받는다.
--     유튜브 구독은 학생이 체크해야 신청되고 따로 적지 않는다 — 이 사이트가 확인할 길이 없어 학생이 한 것을 믿는다 (그림의 댓글 신청과 같다).
--  6) 신청을 넣을 때 트리거(lecture_signups_review_check — 이름 그대로, 과목 검사 lecture_signups_eligible_subject 다음에 돈다)가 조건을 본다:
--     review → 링크 없으면 review_link_required (한 번만 쓰는 규칙 20261008130000 그대로) · sns → 팔로우 없으면 sns_follow_required.
--     조건이 아닌 칸은 저장하지 않는다(비운다). 단과 학생은 제 과목 특강만 — 녹화영상도 그 과목이다 (rc_video = RC · lc_video = LC).
-- ============================================================================

-- ─── 1. 칸 ─────────────────────────────────────────────────────────────────
alter table public.special_lectures
  add column if not exists signup_condition text not null default 'none',
  add column if not exists notice text;

alter table public.special_lectures drop constraint if exists special_lectures_signup_condition_check;
alter table public.special_lectures
  add constraint special_lectures_signup_condition_check check (signup_condition in ('none', 'review', 'sns'));

alter table public.special_lectures drop constraint if exists special_lectures_notice_check;
alter table public.special_lectures
  add constraint special_lectures_notice_check check (notice is null or char_length(notice) <= 50000);

comment on column public.special_lectures.signup_condition is
  '신청 조건 (2026-10-15) — review(YBM 수강후기 링크) · sns(유튜브 구독 · 인스타그램 팔로우) · none(조건 없음). 강사가 특강 신청 화면에서 고른다. 앱 LECTURE_CONDITIONS 와 같은 값';
comment on column public.special_lectures.notice is
  '특강 안내 (2026-10-15) — 수업자료실 안내와 같은 서식 글(꺾쇠 태그), 5만 자. 학생 특강 카드에 보인다';

alter table public.lecture_signups add column if not exists sns_follow text;
alter table public.lecture_signups drop constraint if exists lecture_signups_sns_follow_check;
alter table public.lecture_signups
  add constraint lecture_signups_sns_follow_check check (sns_follow is null or sns_follow in ('new', 'existing'));
comment on column public.lecture_signups.sns_follow is
  '인스타그램 팔로우 (2026-10-15) — new(새로 팔로우) · existing(기존 팔로우). 신청 조건이 sns(유튜브 구독 · 인스타그램 팔로우)인 특강만. 그 밖은 비어 있다';

-- 강사·관리자가 특강 신청 화면에서 고친다 (정책 "special_lectures: 스태프 수정") · 학생이 신청하며 넣는다 (lecture_id · user_id · review_url 과 같은 칸 단위 grant)
grant update (signup_condition, notice) on public.special_lectures to authenticated;
grant insert (sns_follow) on public.lecture_signups to authenticated;

-- ─── 2. 종류 여덟 · 순서 ────────────────────────────────────────────────────
-- 특강 종류 배열 정리 — 중복을 없애고 정한 순서로 (save_term_schedule 이 쓴다). 지금은 한 특강에 하나뿐이다
create or replace function private.lecture_kinds(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_agg(x.k order by array_position(array['rc', 'rc_video', 'lc', 'lc_video', 'mock1', 'mock1_paper', 'mock2', 'mock2_paper'], x.k)),
    '{}')
  from (select distinct jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) as k) as x
$$;
grant execute on function private.lecture_kinds(jsonb) to authenticated, service_role;

-- 종류가 듣는 과목 — RC특강 현강 · 녹화영상 = rc, LC특강 = lc, 모의고사 = 없음. 앱 lectureKindSubject 와 같은 규칙
create or replace function private.lecture_kind_subject(p_kind text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_kind in ('rc', 'rc_video') then 'rc'
    when p_kind in ('lc', 'lc_video') then 'lc'
  end
$$;
comment on function private.lecture_kind_subject(text) is
  '특강 종류의 과목 — rc · rc_video = rc, lc · lc_video = lc, 모의고사는 null (2026-10-15). 앱 lectureKindSubject 와 같은 규칙';
revoke all on function private.lecture_kind_subject(text) from public, anon, authenticated;

-- ─── 3. 둘 이상 고른 특강을 종류마다 나눈다 ───────────────────────────────
-- 옮겨 적는 동안만 신청 검사 트리거를 끈다 (머리말 2). 신청 수(lecture_signups_sync)는 켜 둔다 — 새 줄의 applied_count 를 트리거가 센다
alter table public.lecture_signups disable trigger lecture_signups_eligible_subject;
alter table public.lecture_signups disable trigger lecture_signups_review_check;

do $$
declare
  r record;
  v_kinds text[];
  k text;
  v_new bigint;
  v_rows int := 0;
  v_signups int := 0;
  v_n int;
begin
  for r in
    select l.id, l.term_id, l.date, l.lecturer_id, l.content, l.kinds, l.signup, l.capacity, l.signup_opens_at
      from public.special_lectures l
     where cardinality(l.kinds) > 1
     order by l.date, l.id
  loop
    v_kinds := private.lecture_kinds(to_jsonb(r.kinds));
    update public.special_lectures set kinds = array[v_kinds[1]] where id = r.id;
    foreach k in array v_kinds[2:] loop
      insert into public.special_lectures (term_id, date, lecturer_id, content, kinds, signup, capacity, signup_opens_at)
      values (r.term_id, r.date, r.lecturer_id, r.content, array[k], r.signup, r.capacity, r.signup_opens_at)
      returning id into v_new;
      insert into public.lecture_signups (lecture_id, user_id, created_at, review_url)
      select v_new, s.user_id, s.created_at, s.review_url
        from public.lecture_signups s
       where s.lecture_id = r.id
       order by s.created_at, s.id;
      get diagnostics v_n = row_count;
      v_rows := v_rows + 1;
      v_signups := v_signups + v_n;
    end loop;
  end loop;
  raise notice '특강 나누기: 새 특강 %개 · 옮겨 적은 신청 %건', v_rows, v_signups;
end;
$$;

alter table public.lecture_signups enable trigger lecture_signups_eligible_subject;
alter table public.lecture_signups enable trigger lecture_signups_review_check;

-- 이제 특강 하나 = 종류 하나, 값은 여덟 가지
alter table public.special_lectures drop constraint if exists special_lectures_kinds_check;
alter table public.special_lectures
  add constraint special_lectures_kinds_check
  check (
    cardinality(kinds) <= 1
    and kinds <@ array['rc', 'rc_video', 'lc', 'lc_video', 'mock1', 'mock1_paper', 'mock2', 'mock2_paper']::text[]
  );
comment on column public.special_lectures.kinds is
  '특강 종류 — 하나만 (2026-10-15). rc · rc_video · lc · lc_video · mock1 · mock1_paper · mock2 · mock2_paper (현강신청 · 녹화영상신청 · 시험지 수령 신청). 비우면 내용(content)만 있는 특강. src/lib/utils.ts 의 LECTURE_KINDS 와 같은 값';

-- ─── 4. 신청 조건 — 있던 특강은 2026-10-08 규칙대로 (모의고사 현강이 든 3주차 = 후기) ───
-- 그 규칙의 주차: 그 주 월요일끼리 뺀 날수 / 7 + 1 (개강일이 든 주가 1주차) — private.lecture_needs_review 와 같은 식
update public.special_lectures l
   set signup_condition = 'review'
  from public.terms t
 where t.id = l.term_id
   and l.kinds && array['mock1', 'mock2']::text[]
   and t.enrollment_opens_at is not null
   and ((l.date - (extract(isodow from l.date)::int - 1))
        - (t.enrollment_opens_at - (extract(isodow from t.enrollment_opens_at)::int - 1))) / 7 + 1 = 3;

-- ─── 5. 신청을 넣을 때 — 단과 학생은 제 과목 특강만 (녹화영상도 그 과목) ─────
create or replace function private.lecture_signups_eligible_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kinds text[];
  v_subjects text[];
  v_missing text;
begin
  select l.kinds, private.lecture_subjects_of(new.user_id, l.term_id)
    into v_kinds, v_subjects
    from public.special_lectures l
   where l.id = new.lecture_id;

  -- 그 달 수강생이 아니면(과목이 없다) 여기서 가르지 않는다 — 정책 lecture_signup_open 이 막는다 (엉뚱한 까닭을 말하지 않게)
  if v_subjects is null or v_subjects = '{}'::text[] then
    return new;
  end if;

  select x.subject into v_missing
    from unnest(coalesce(v_kinds, '{}'::text[])) as k
    cross join lateral (select private.lecture_kind_subject(k) as subject) as x
   where x.subject is not null
     and not (x.subject = any (v_subjects))
   limit 1;

  if v_missing is not null then
    raise exception 'lecture_subject_mismatch'
      using errcode = 'P0001', detail = '내 수업 과목이 아닌 특강입니다. RC 단과는 RC 특강, LC 단과는 LC 특강만 신청할 수 있습니다.';
  end if;

  return new;
end;
$$;
revoke execute on function private.lecture_signups_eligible_subject() from public, anon, authenticated;

-- ─── 6. 신청을 넣을 때 — 신청 조건 (후기 링크 · 유튜브 구독 · 인스타그램 팔로우) ─────
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
  select l.signup_condition into v_condition
    from public.special_lectures l
   where l.id = new.lecture_id;

  -- 조건이 아닌 칸은 저장하지 않는다 — 다른 특강에 딸려 온 값을 남기지 않는다
  if v_condition is distinct from 'review' then
    new.review_url := null;
  end if;
  if v_condition is distinct from 'sns' then
    new.sns_follow := null;
  end if;

  if v_condition = 'sns' then
    if new.sns_follow is null then
      raise exception 'sns_follow_required'
        using errcode = 'P0001', detail = '이 특강은 역전토익 유튜브 구독 · 인스타그램 팔로우를 하고 신청할 수 있습니다.';
    end if;
    return new;
  end if;

  if v_condition is distinct from 'review' then
    return new;
  end if;

  if new.review_url is null then
    raise exception 'review_link_required'
      using errcode = 'P0001', detail = '이 특강은 YBM 수강후기 링크를 올려야 신청할 수 있습니다.';
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
  '특강 신청을 넣을 때 신청 조건을 본다 (2026-10-15) — review: YBM 수강후기 링크(없으면 review_link_required · 다른 학생 링크 review_link_taken · 다른 달에 쓴 내 링크 review_link_reused) · sns: 인스타그램 팔로우(없으면 sns_follow_required). 조건이 아닌 칸은 비운다';

-- 날짜로 정하던 후기 조건(2026-10-08) — 이제 signup_condition 칸이 정한다
drop function if exists private.lecture_needs_review(bigint);

comment on column public.lecture_signups.review_url is
  'YBM 수강후기 링크 (2026-10-08) — 신청 조건이 review(YBM 수강후기 작성)인 특강만 (2026-10-15 부터 강사가 특강마다 고른다). https://www.ybmedu.com/mypage/lessonView/<토큰> 꼴만. 그 밖의 특강은 비어 있다';

-- ─── 7. 반 편성 달력 저장 — 특강 하나 = 종류 하나, 종류 여덟 ────────────────
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
         -- 특강 하나 = 종류 하나 (2026-10-15 — 현강 · 녹화영상 · 시험지 수령을 따로 받는다)
         or coalesce(jsonb_array_length(e -> 'kinds'), 0) > 1
         or exists (
              select 1 from jsonb_array_elements_text(coalesce(e -> 'kinds', '[]'::jsonb)) as k
              where k not in ('rc', 'rc_video', 'lc', 'lc_video', 'mock1', 'mock1_paper', 'mock2', 'mock2_paper')
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
  '반 편성 달력 저장. p_parts 로 항목만 고른다. 수업일·특강은 그 달 ±1개월, 수업일은 다른 기수와 겹칠 수 없다. 특강은 id 로 유지되고(신청자가 있으면 삭제 거부) 종류는 하나(kinds — 여덟 가지 중 하나, 2026-10-15)와 신청 설정(signup·capacity·signup_opens_at)을 함께 받는다. 신청 조건 · 안내는 특강 신청 화면에서 정하고 여기서 건드리지 않는다';

revoke all on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) from public, anon;
grant execute on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) to authenticated, service_role;
