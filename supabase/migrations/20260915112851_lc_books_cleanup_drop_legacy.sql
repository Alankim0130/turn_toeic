-- ============================================================================
-- 배포 후 정리 (2026-09-15)
--
--  * LC 교재(lc_books) 코드가 운영에 올라가(da8dc20) 이전 구조를 더 이상 읽지 않는다.
--      - 레벨별 이미지 묶음 lc_textbook_images 삭제 (행 0건 확인)
--      - lc_audio_tracks.level 삭제, book_id 필수 (교재 없는 음원 0건 확인)
--  * 비회원 자유 양식 스터디 신청 study_applications 도 9bf0348 이후 쓰지 않는다 (행 0건 확인).
-- ============================================================================

-- ─── 1. LC: 표지 파일 조회 정책을 교재 표지만 보도록 되돌리고 옛 테이블 삭제 ───────
drop policy "lc-textbooks: 수강생·스태프 조회" on storage.objects;
drop table public.lc_textbook_images;

create policy "lc-textbooks: 수강생·스태프 조회" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lc-textbooks'
    and (
      (select private.is_staff())
      or exists (select 1 from public.lc_books b where b.cover_path = objects.name)
    )
  );

-- ─── 2. LC: 음원은 반드시 교재에 속한다 ───────────────────────────────────────
alter table public.lc_audio_tracks drop column level;
alter table public.lc_audio_tracks alter column book_id set not null;

-- ─── 3. 구버전 스터디 신청 ─────────────────────────────────────────────────
drop table public.study_applications;
