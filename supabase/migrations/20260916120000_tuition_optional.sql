-- 수강료를 선택 항목으로 (2026-09-16 Alan)
--
-- "수강료는 없어도 상관없어. 어차피 YBM에서 등록을 하고 우리 홈페이지는 학생들 관리용이기 때문이야."
-- 결제·수강신청은 YBM 공식 사이트에서만 이뤄지므로(작업 원칙 3) 이 사이트가 금액을 들고 있을 이유가 없다.
-- 컬럼은 남긴다 — 값을 넣으면 수강증 OCR 후보 대조에서 계속 기준선으로 쓸 수 있다.
--
-- check (tuition >= 0) 는 그대로 둔다. null 이면 검사식이 null 로 평가돼 통과한다.

alter table public.class_sections
  alter column tuition drop not null;

comment on column public.class_sections.tuition is
  '현장 수강료. 비워 둘 수 있다 (2026-09-16 Alan — 등록은 YBM 에서 한다). 값이 있으면 수강증 OCR 후보 대조의 기준선으로 쓴다';
