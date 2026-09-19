-- ============================================================================
-- 숙제는 **수업 날짜**에 붙고, 강사가 코멘트를 달아 점검완료를 알린다 (2026-09-19 Alan)
--
--   "학생들 화면에는 내 시간표, 즉 달력이 나와서 해당 달력을 클릭해서 RC제출 / LC제출"
--   "강사들은 숙제점검 페이지에서 … 질문에 답변을 달아주거나 추가로 할말이 있다면 코멘트를 생성해서
--    다시 점검완료 메시지를 보낸다. 그럼 학생들은 숙제점검 완료 알림을 받고 확인을 할 수 있다"
--
-- **비대면 스터디 인증(study_checkins)과는 완전히 다른 것이다** — 이쪽은 정규 수업 숙제다.
-- 두 표는 서로를 참조하지 않는다 (도메인 규칙 6-2 / 7).
-- ============================================================================

alter table public.homework_submissions
  add column class_date date,
  add column feedback   text;

alter table public.homework_submissions
  add constraint homework_submissions_feedback_len
  check (feedback is null or char_length(feedback) <= 1000);

comment on column public.homework_submissions.class_date is
  '어느 수업일의 숙제인지 (KST). 학생이 달력에서 고른다. 달력 이전에 낸 옛 제출은 비어 있다';
comment on column public.homework_submissions.feedback is
  '강사 코멘트 · 질문 답변 (점검완료와 함께 저장, 1000자). 같은 글이 학생 알림함으로도 간다';

-- 강사 숙제점검은 과목 × 레벨로 훑고, 학생 화면은 날짜로 훑는다
create index homework_submissions_class_date_idx
  on public.homework_submissions (class_date desc, level, subject);

-- insert · update 는 **컬럼 단위 grant** 다 — 새 칸을 열어 주지 않으면 조용히 막힌다
grant insert (class_date) on public.homework_submissions to authenticated;
grant update (feedback)   on public.homework_submissions to authenticated;
-- 쓰는 사람은 정책이 가린다: "homework_submissions: 스태프 점검"(update, is_staff)

-- ─── 점검완료 알림 종류 ─────────────────────────────────────────────────────
-- kind 는 인라인 check 로 붙어 있어 이름이 확실하지 않다. **이름을 찍어 drop 하면
-- 이름이 다를 때 조용히 지나가고 새 제약만 늘어난다** (옛 제약이 그대로 막는다).
-- 그래서 student_messages 의 check 중 'study_checkin' 을 담은 것을 찾아 지운다.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace ns  on ns.oid  = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'student_messages'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%study_checkin%'
  loop
    execute format('alter table public.student_messages drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.student_messages
  add constraint student_messages_kind_check
  check (kind in ('general', 'study_checkin', 'homework_checked'));

comment on column public.student_messages.kind is
  'general(그냥 알림) | study_checkin(비대면 인증 독촉) | homework_checked(숙제 점검완료). 셋은 서로 다른 일이다';
