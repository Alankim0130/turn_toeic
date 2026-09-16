-- ============================================================================
-- 숙제업로드: 비대면 자료·날짜 단위 → 레벨(650·750·850) × 과목(RC·LC) 단위 (2026-09-16 Alan 요청)
--
--  1) 제출 1건 = 레벨 + 과목 + 사진(최대 10장) + 질문(선택). 같은 레벨·과목에 여러 번 제출할 수 있다.
--  2) 사진만 받는다 (버킷 mime 을 image/* 로 좁힌다). 저장 경로는 homework/{uid}/{레벨}-{과목}/{file} —
--     스토리지 정책은 첫 폴더(uid)만 보므로 그대로 둔다.
--  3) 자격 검사를 정책에 직접 적는다. 예전 정책은 "볼 수 있는 자료가 있는가"(study_materials 의 RLS)로
--     자격을 대신했는데, 자료와 떼어 내면 그 검사가 사라지므로 private.has_term_access(null) 을 명시한다.
--
--  1단계(추가형): material_id 를 nullable 로 두고 새 컬럼을 더한다. 코드 배포 뒤 정리 마이그레이션에서
--  material_id 를 지운다 — 두 단계로 나눠 배포 전후 어느 코드도 깨지지 않게 한다 (LC 정리 때와 같은 방식).
-- ============================================================================

alter table public.homework_submissions
  alter column material_id drop not null,
  add column level    int  references public.lc_levels (level),
  add column subject  text check (subject in ('rc', 'lc')),
  add column question text check (question is null or (question = btrim(question) and char_length(question) between 1 and 500));

-- 새 제출은 레벨·과목이 있어야 한다 (예전 행은 material_id 로 구분)
alter table public.homework_submissions
  add constraint homework_submissions_target_check
  check (material_id is not null or (level is not null and subject is not null));

comment on column public.homework_submissions.level    is '레벨 (lc_levels). 학생이 1단계에서 고른다';
comment on column public.homework_submissions.subject  is '과목 rc | lc — src/lib/homework.ts 의 HOMEWORK_SUBJECTS 와 같은 값';
comment on column public.homework_submissions.question is '강사에게 하는 질문 (선택, 500자)';

create index homework_submissions_level_subject_idx on public.homework_submissions (level, subject, created_at desc);
create index homework_submissions_user_created_idx  on public.homework_submissions (user_id, created_at desc);

-- insert 가 컬럼 단위 grant 라 새 컬럼을 열어 줘야 한다 (status 는 여전히 기본값만)
grant insert (level, subject, question) on public.homework_submissions to authenticated;
grant execute on function private.has_term_access(bigint) to authenticated, service_role;

-- 제출 자격: 본인 + 점검 전 + 레벨·과목 + 지금 수강 중(개강일~종강일). 자료 연결은 더 이상 보지 않는다
drop policy "homework_submissions: 본인 제출" on public.homework_submissions;
create policy "homework_submissions: 본인 제출" on public.homework_submissions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'submitted'
    and material_id is null          -- 1단계 기간에 옛 자료 id 를 끼워 넣지 못하게
    and level is not null
    and subject is not null
    and (select private.has_term_access(null::bigint))
  );

-- 사진만 받는다
update storage.buckets set allowed_mime_types = array['image/*'] where id = 'homework';
