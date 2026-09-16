-- ============================================================================
-- 숙제업로드 정리 (1단계 20260916223000 이 배포된 뒤 실행)
--
--  자료(study_materials) 연결 컬럼을 지우고 레벨·과목을 필수로 만든다.
--  1단계 정책이 material_id 를 참조하므로(and material_id is null) 정책을 먼저 지우고 컬럼을 지운 뒤 다시 만든다.
--  material_id 를 지우면 FK · unique(material_id, user_id) · homework_submissions_target_check 도 함께 사라진다.
-- ============================================================================

drop policy "homework_submissions: 본인 제출" on public.homework_submissions;

alter table public.homework_submissions drop column material_id;

alter table public.homework_submissions
  alter column level   set not null,
  alter column subject set not null;

-- 제출 자격: 본인 + 점검 전 + 지금 수강 중(개강일~종강일). 레벨·과목은 not null 이 지킨다
create policy "homework_submissions: 본인 제출" on public.homework_submissions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'submitted'
    and (select private.has_term_access(null::bigint))
  );

comment on table public.homework_submissions is
  '숙제 제출. 레벨 × 과목(rc|lc) 단위로 사진 최대 10장 + 질문(선택). 같은 레벨·과목에 여러 번 제출할 수 있다';
