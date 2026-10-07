-- ============================================================================
-- 숙제에 음성 파일도 (2026-10-07 Alan — "학생들이 숙제제출할때 음성파일도 올릴수 있도록 부탁해!")
--
--   * homework 버킷이 사진(image/*)에 더해 **음성(audio/*)** 도 받는다. 2026-09-16 에 사진만 받도록 좁혔던 것을 넓힌다
--     (20260916223000 — 그때는 숙제가 풀이 사진뿐이었다).
--   * 크기 한도 20MB → **50MB** — 녹음은 사진보다 크다 (LC 음원 버킷 lc-audio 와 같은 한도).
--     버킷 한도는 형식마다 따로 둘 수 없어서 **사진 한 장 20MB 는 앱(폼 · 서버 액션)이 그대로 본다** —
--     src/lib/homework.ts 의 MAX_PHOTO_MB · MAX_AUDIO_MB (homework.test.ts 가 이 파일의 값과 맞춘다).
--   * 표(homework_submissions · homework_files)와 정책은 그대로다 — homework_files.content_type 에 형식 제약이 없고,
--     저장소 정책은 첫 폴더(uid)만 본다. 사진과 음성은 화면이 content_type 으로 가른다 (사진은 넘겨 보기, 음성은 플레이어).
-- ============================================================================

update storage.buckets
   set allowed_mime_types = array['image/*', 'audio/*'],
       file_size_limit    = 50 * 1024 * 1024
 where id = 'homework';
