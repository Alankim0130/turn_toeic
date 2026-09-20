-- 수강증 원본 보관 기간 — 2개월 (2026-09-20 Alan "수강증보관은 두달동안해줘", 미확정 6 해결)
--
-- 판정이 끝나고 2개월이 지나면 저장소의 원본 파일만 지우고 기록은 남긴다.
-- 지운 뒤 file_path 는 그대로 두는데, 그 값이 살아 있는 파일을 가리키는지 아닌지를
-- 화면이 알아야 하므로 지운 시각을 따로 적는다.
--
-- file_path 를 비우지 않는 까닭: not null 이라 못 비우고, 무엇이 있었는지도 기록이다.
-- 대신 이 컬럼이 차 있으면 승인 화면이 "보관 기간이 지나 지웠다" 고 정확히 말한다
-- (안 그러면 "파일을 불러올 수 없습니다" 로 보여 스태프가 고장으로 오해한다).
--
-- 실제로 지우는 일은 /api/cron/purge-receipts (Vercel Cron) 가 한다 — pg_cron 이 아니다.
-- storage.objects 행만 지우면 실제 파일은 S3 에 남아 떠돌기 때문에, 스토리지 API 를 거쳐야 한다.

alter table public.enrollment_verifications
  add column if not exists file_deleted_at timestamptz;

comment on column public.enrollment_verifications.file_deleted_at is
  '수강증 원본 파일을 보관 기간(2개월)이 지나 지운 시각. null 이면 파일이 살아 있다. 기록(ocr_raw·parsed·result)은 지우지 않는다';

-- authenticated 의 select · update 는 표 단위 grant 라 새 컬럼도 따라온다 (20260915045115)
-- RLS 정책도 표 단위라 손댈 것이 없다
