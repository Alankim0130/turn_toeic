-- 영수증번호를 지운다 (2026-09-18 Alan: "영수증번호는 없어. 전부 다 삭제해줘")
--
-- 수강증은 YBM 앱·홈페이지의 **화면 캡처**이고 그 화면에는 영수증번호가 없다 (2026-09-16 샘플로 확인).
-- 맨 위 `현재시간` 은 캡처한 시각이지 번호가 아니다. 실제로 채워진 행도 없었다 (적용 전 확인: 0건).
--
-- 그래서 게이트 G4(영수증 1건 = 1계정)는 폐기한다. 중복 등업·다중 계정 방지는
-- **이름 · 전화번호와 계정 통합**으로 다시 만든다 (CLAUDE.md 미확정 10).

drop index if exists public.enrollment_verifications_receipt_no_approved_key;

alter table public.enrollment_verifications
  drop column if exists receipt_no;
