-- ============================================================================
-- 숙제업로드 정리 (1단계 20260916223000 이 배포된 뒤 실행)
--
--  자료(study_materials) 연결 컬럼을 지우고 레벨·과목을 필수로 만든다.
--  material_id 를 지우면 FK · unique(material_id, user_id) · homework_submissions_target_check 도 함께 사라진다.
-- ============================================================================

alter table public.homework_submissions drop column material_id;

alter table public.homework_submissions
  alter column level   set not null,
  alter column subject set not null;

comment on table public.homework_submissions is
  '숙제 제출. 레벨 × 과목(rc|lc) 단위로 사진 최대 10장 + 질문(선택). 같은 레벨·과목에 여러 번 제출할 수 있다';
