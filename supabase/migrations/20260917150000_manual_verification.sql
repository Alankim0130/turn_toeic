-- 수동 등업신청 (2026-09-17 Alan 요청)
--
-- "만약 시스템오류라면 해당 수동등업신청을 눌러서 본인이 신청한 반을 기입해서 제출할 수 있도록 해줘.
--  수강증 업로드 + 레벨 / 요일 / 시간대"
--
-- 학생이 고른 반을 검증 기록에 남겨 두면 스태프가 승인 화면에서 그대로 확인하고 한 번에 승인할 수 있다.
-- **학생이 고른 것은 신청일 뿐 확정이 아니다** — 수강증이 진짜인지는 스태프가 본다.
-- 승인된 배정은 지금처럼 enrollments 가 진실이고, 여기 값은 "학생이 이렇게 신청했다" 는 기록이다.

alter table public.enrollment_verifications
  add column if not exists source text not null default 'auto'
    check (source in ('auto', 'manual')),
  -- 학생이 고른 반. 주5일이면 월수금·화목금 두 개가 들어간다 (도메인 규칙 1)
  add column if not exists requested_section_ids int[] not null default '{}';

comment on column public.enrollment_verifications.source is
  'auto = 수강증만 올림 (OCR 판정) · manual = 학생이 레벨·요일·시간대를 직접 골라 신청';
comment on column public.enrollment_verifications.requested_section_ids is
  '수동 등업신청에서 학생이 고른 반 id. 신청 기록일 뿐 확정 배정이 아니다 (확정은 enrollments)';

-- 쓰기는 지금처럼 service_role 만 한다 (authenticated 의 insert 권한은 없다).
-- authenticated 에게는 select 가 이미 있고 정책 "verifications: 본인·스태프 조회" 가 범위를 정하므로
-- 새 컬럼도 같은 규칙을 그대로 따른다 — 정책을 손대지 않는다.
