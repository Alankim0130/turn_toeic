-- 학생이 직접 올리는 버킷(homework · study-checkins · avatars)의 그림 형식을 **사진 형식 목록**으로 좁힌다 (2026-10-09 Alan "전체적으로 보안 설계를 부탁해").
--
-- 예전 `image/*` 는 SVG(image/svg+xml)도 받았다. SVG 는 사진이 아니라 스크립트가 들어갈 수 있는 문서라, 저장소 서명 주소로 열면 그 자리(저장소 도메인)에서
-- 실행된다 — 우리 사이트 쿠키에는 닿지 않지만 학생 사진 자리에 둘 까닭이 없다. 수강증 버킷(receipts)은 처음부터 목록이었다.
-- 앱은 사진을 고를 때 `image/…` 로만 보고 휴대폰 · PC 가 보내는 사진 형식(jpeg · png · webp · gif · heic · heif · avif · bmp · tiff)은 모두 목록에 있으므로
-- 학생 화면은 그대로다. 막히는 것은 저장소 API 로 바로 올리는 길뿐이다. 숙제의 음성 파일(audio/*)은 그대로.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/tiff', 'audio/*']
where id = 'homework';

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/tiff']
where id in ('study-checkins', 'avatars');
