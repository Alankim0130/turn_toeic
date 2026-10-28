-- 수강생 설문 (2026-10-28 Alan — OT 첫날 나눠 주던 종이 설문을 웹으로: "회원가입하고 등업신청하고 난 뒤에, 웹에서 바로 설문조사까지 마무리하고 싶어"
-- → "등업직후 바로 진행. 다 작성해야지 진행할 수 있도록 해줘. 설문조사는 처음 한번만 진행. 볼 수 있는사람은 관리자, 강사만").
--
-- 질문은 종이에서 가입 · 등업신청이 이미 받는 것(이름 · 전화번호 · 학교 · 등록반 · 등록시간대)을 뺀 나머지다:
--   신분(+ 직장명, 선택) · 지금 토익 점수(+ LC · RC, 선택) · 목표 점수 · 목표 기간 · 공부 이유 · 공부 이력(+ 어디서 무슨 수업) ·
--   다음 달 수강 예정(들을 반은 클릭만 — 글자로 남긴다 / 안 들으면 이유) · 관리 방식 · 수강 계기(+ 지인 이름, 선택 · 이야기).
-- 나이는 받지 않는다 — 다 써야 넘어가는 설문이라, 수업에 필요 없는 정보를 주지 않는다고 막으면 개인정보 보호법 제16조 제3항에 걸린다.
--
-- 1. public.student_surveys — 학생 한 명에 한 줄(처음 한 번). 설문 답은 바뀌지 않고, 지금 점수 · 목표(now_*)만 학생이 마이페이지에서 고친다
--    (Alan "현재점수와 목표점수는 … 수정이 가능하도록"). 처음 now_* 는 설문 답과 같다 — 강사 · 관리자는 설문 때 점수와 지금 점수를 함께 본다.
--    조회 = 강사 · 관리자 · 본인. **조교 갈래를 넣지 말 것** — 학생 정보는 이름만 (CLAUDE.md 등급 체계 9-2). 넣기는 아래 함수로만(직접 insert 권한 없음).
-- 2. public.submit_student_survey(jsonb) — 내 설문 한 줄을 넣고, 관리 방식을 숙제 미제출 알림 스위치로 옮긴다 (Alan "관리방식은 기존의 숙제알림을
--    받을 수 있는 시스템이랑 연동"): 빡센 관리(strict) = 알림 받기 → homework_missing_optouts 의 내 줄을 지운다, 알아서(self) = 안 받기 → 내 줄을 넣는다.
--    한 트랜잭션이라 설문만 들어가고 스위치가 안 바뀌는 일이 없다. 두 번째는 already_done. 강사 · 관리자 · 조교 계정은 내지 않는다(미리 보기만).
-- 3. 계정을 합치면 설문도 남길 계정으로 — 남길 계정에 설문이 없을 때만 (있으면 옛 계정 것은 옛 계정에 남는다). 직원 게시판과 같은 길(profiles.merged_into 트리거).

-- ─── 1. 표 ────────────────────────────────────────────────────────────────
create table public.student_surveys (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- 설문할 때 학생이 듣던 마지막 달 (다음 달 = 이 달의 다음 달)
  term_id bigint references public.terms (id) on delete set null,

  occupation text not null check (occupation in ('student', 'jobseeker', 'worker', 'leave', 'other')),
  workplace text check (workplace is null or char_length(workplace) between 1 and 60),

  -- 설문 때 점수 — 총점이 비면 아직 시험 전. LC · RC 는 둘 다 있거나 둘 다 없다
  score_total int check (score_total is null or (score_total between 10 and 990 and score_total % 5 = 0)),
  score_lc int check (score_lc is null or (score_lc between 5 and 495 and score_lc % 5 = 0)),
  score_rc int check (score_rc is null or (score_rc between 5 and 495 and score_rc % 5 = 0)),
  target_score int not null check (target_score between 10 and 990 and target_score % 5 = 0),
  -- 목표를 이룰 기간 — 6 = 6개월 이상
  goal_months smallint not null check (goal_months between 1 and 6),

  reasons text[] not null check (cardinality(reasons) between 1 and 7 and reasons <@ array['job', 'promotion', 'self', 'transfer', 'peet', 'katusa', 'other']::text[]),
  reason_other text check (reason_other is null or char_length(reason_other) between 1 and 40),

  history text[] not null check (cardinality(history) between 1 and 6 and history <@ array['quit', 'break2y', 'basic', 'c750', 'c850', 'first']::text[]),
  history_where text check (history_where is null or char_length(history_where) between 1 and 100),

  -- 다음 달 = 물어본 달 (학생이 듣던 마지막 달의 다음 달)
  next_year int check (next_year is null or next_year between 2020 and 2100),
  next_month smallint check (next_month is null or next_month between 1 and 12),
  next_plan text not null check (next_plan in ('yes', 'no', 'unsure')),
  -- 들을 반 — 반이 아직 없어서 글자로 남긴다 ({courseId, course, level, program, kind, track, timeBlock, minutes, label})
  next_class jsonb,
  next_reason text check (next_reason is null or char_length(next_reason) between 1 and 200),

  manage_style text not null check (manage_style in ('strict', 'self')),

  sources text[] not null check (
    cardinality(sources) between 1 and 12
    and sources <@ array['referral', 'naver', 'blog', 'kin', 'cafe', 'instagram', 'youtube', 'ybm', 'visit', 'brochure', 'counsel', 'other']::text[]
  ),
  referrer_name text check (referrer_name is null or char_length(referrer_name) between 1 and 20),
  source_story text not null check (char_length(btrim(source_story)) between 2 and 1000),

  -- 지금 점수 · 목표 — 학생이 마이페이지에서 고친다 (처음엔 설문 답)
  now_total int check (now_total is null or (now_total between 10 and 990 and now_total % 5 = 0)),
  now_lc int check (now_lc is null or (now_lc between 5 and 495 and now_lc % 5 = 0)),
  now_rc int check (now_rc is null or (now_rc between 5 and 495 and now_rc % 5 = 0)),
  now_target int not null check (now_target between 10 and 990 and now_target % 5 = 0),
  now_updated_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  -- 서로 묶인 칸
  constraint student_surveys_workplace check (workplace is null or occupation = 'worker'),
  constraint student_surveys_score_pair check (
    (score_lc is null) = (score_rc is null) and (score_lc is null or (score_total is not null and score_total = score_lc + score_rc))
  ),
  constraint student_surveys_now_pair check (
    (now_lc is null) = (now_rc is null) and (now_lc is null or (now_total is not null and now_total = now_lc + now_rc))
  ),
  constraint student_surveys_reason_other check ((reason_other is not null) = ('other' = any (reasons))),
  constraint student_surveys_history check (
    not ('first' = any (history) and history && array['basic', 'c750', 'c850']::text[])
    and (history_where is not null) = (history && array['basic', 'c750', 'c850']::text[])
  ),
  constraint student_surveys_next check (
    (next_class is not null) = (next_plan = 'yes')
    and (next_reason is not null) = (next_plan = 'no')
    and (next_class is null or (jsonb_typeof(next_class) = 'object' and jsonb_typeof(next_class -> 'label') = 'string'))
  ),
  constraint student_surveys_referrer check (referrer_name is null or 'referral' = any (sources))
);

comment on table public.student_surveys is
  '수강생 설문 (2026-10-28) — 학생 한 명에 한 줄(처음 한 번). 설문 답 + 지금 점수 · 목표(now_*, 학생이 고친다). 강사 · 관리자 · 본인만 본다 (조교 아님). 넣기는 submit_student_survey 로만.';

alter table public.student_surveys enable row level security;

grant all on public.student_surveys to service_role;
grant select on public.student_surveys to authenticated;
-- 학생이 고칠 수 있는 칸은 지금 점수 · 목표뿐 — 설문 답은 바뀌지 않는다
grant update (now_total, now_lc, now_rc, now_target, now_updated_at) on public.student_surveys to authenticated;

-- 조회 — 스태프 확인이 먼저 (CLAUDE.md 보안 점검 · 화면 전환 속도 4). is_staff = 강사 · 관리자 (조교 아님)
create policy "student_surveys: 강사·관리자·본인 조회" on public.student_surveys
  for select to authenticated
  using ((select private.is_staff()) or user_id = (select auth.uid()));

create policy "student_surveys: 본인 점수 수정" on public.student_surveys
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── 2. 내기 — 설문 한 줄 + 관리 방식을 숙제 미제출 알림 스위치로 (한 트랜잭션) ─────────────
create or replace function public.submit_student_survey(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_rows int;
  v_next_class jsonb := case when jsonb_typeof(p -> 'next_class') = 'object' then p -> 'next_class' else null end;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null or v_profile.merged_into is not null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- 강사 · 관리자 · 조교 계정은 내지 않는다 (진짜 등급 — 테스트 등급을 켜도). 설문 화면은 미리 보기만 한다
  if v_profile.role in ('instructor', 'admin', 'assistant') then
    raise exception 'staff_account' using errcode = '42501';
  end if;

  insert into public.student_surveys (
    user_id, term_id, occupation, workplace,
    score_total, score_lc, score_rc, target_score, goal_months,
    reasons, reason_other, history, history_where,
    next_year, next_month, next_plan, next_class, next_reason,
    manage_style, sources, referrer_name, source_story,
    now_total, now_lc, now_rc, now_target, now_updated_at
  )
  values (
    v_uid,
    (p ->> 'term_id')::bigint,
    p ->> 'occupation',
    nullif(p ->> 'workplace', ''),
    (p ->> 'score_total')::int,
    (p ->> 'score_lc')::int,
    (p ->> 'score_rc')::int,
    (p ->> 'target_score')::int,
    (p ->> 'goal_months')::smallint,
    array(select jsonb_array_elements_text(p -> 'reasons')),
    nullif(p ->> 'reason_other', ''),
    array(select jsonb_array_elements_text(p -> 'history')),
    nullif(p ->> 'history_where', ''),
    (p ->> 'next_year')::int,
    (p ->> 'next_month')::smallint,
    p ->> 'next_plan',
    v_next_class,
    nullif(p ->> 'next_reason', ''),
    p ->> 'manage_style',
    array(select jsonb_array_elements_text(p -> 'sources')),
    nullif(p ->> 'referrer_name', ''),
    p ->> 'source_story',
    (p ->> 'score_total')::int,
    (p ->> 'score_lc')::int,
    (p ->> 'score_rc')::int,
    (p ->> 'target_score')::int,
    now()
  )
  on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'already_done' using errcode = '23505';
  end if;

  -- 관리 방식 = 숙제 미제출 알림 스위치 (숙제제출 화면의 스위치와 같은 줄)
  if p ->> 'manage_style' = 'self' then
    insert into public.homework_missing_optouts (user_id) values (v_uid) on conflict (user_id) do nothing;
  else
    delete from public.homework_missing_optouts where user_id = v_uid;
  end if;
end;
$$;

comment on function public.submit_student_survey(jsonb) is
  '수강생 설문 내기 (2026-10-28) — 내 줄 하나(처음 한 번, 두 번째는 already_done) + 관리 방식을 숙제 미제출 알림 스위치로. auth.uid() 로만. 강사 · 관리자 · 조교 계정은 staff_account.';

revoke execute on function public.submit_student_survey(jsonb) from public, anon;
grant execute on function public.submit_student_survey(jsonb) to authenticated;

-- ─── 3. 계정을 합치면 설문도 남길 계정으로 (남길 계정에 없을 때만) ─────────────────────
create or replace function private.tg_student_surveys_follow_merge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.student_surveys s
     set user_id = new.merged_into
   where s.user_id = new.id
     and not exists (select 1 from public.student_surveys t where t.user_id = new.merged_into);
  return null;
end;
$$;

revoke execute on function private.tg_student_surveys_follow_merge() from public, anon, authenticated;

drop trigger if exists profiles_student_surveys_follow_merge on public.profiles;
create trigger profiles_student_surveys_follow_merge
  after update of merged_into on public.profiles
  for each row
  when (old.merged_into is null and new.merged_into is not null)
  execute function private.tg_student_surveys_follow_merge();
