-- 수강증 위조·돌려쓰기 대응 1단계 (2026-09-18 Alan: "학생이 수강증을 임의로 만들어 OCR 허점을 쓰면?")
--
-- 이미지만 보고 위조를 가려낼 수는 없다 (AI 가 만든 캡처는 글자가 다 맞다). 그래서 지금 할 수 있는 것은
-- **같은 이미지를 여러 계정이 돌려 쓰는 것**을 잡는 것이다 — 파일 해시(SHA-256)를 남기고, 다른 계정에서 같은 해시가
-- 이미 올라왔으면 자동 승인하지 않고 스태프 검토로 보낸다. 근본 대책(YBM 등록 명단 대조)은 CLAUDE.md 미확정 11.

alter table public.enrollment_verifications
  add column if not exists file_hash text;

comment on column public.enrollment_verifications.file_hash is
  '업로드 파일의 SHA-256. 다른 계정이 같은 파일을 올렸는지 본다 (돌려쓰기). 수정한 이미지는 해시가 달라 못 잡는다';

create index if not exists enrollment_verifications_file_hash_idx
  on public.enrollment_verifications (file_hash)
  where file_hash is not null;
