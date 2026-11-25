-- 반 표 검사 규칙이 강사 · 관리자 · 서버의 반 넣기 · 고치기를 모두 막던 것 (2026-11-25 Alan — "12월 반이 왜 없어? … 자동으로 계산해서 열려야지" ·
-- 새 반 개설을 눌러 보니 "권한이 없다고 나와… 내가 관리자 권한인데 말이안되잖아").
--
-- 20261105100000(방학달 통짜 반의 두 교시)이 class_sections 에 뒤 교시 시작 검사를 더하면서 private.time_block_start · time_block_end 를 불렀다.
-- 검사 규칙 안의 함수는 **넣는 사람의 권한으로** 돈다 — 그런데 두 함수는 실행 권한이 없다
-- (20260919150000 이 authenticated 에서 거두었고, private 스키마 새 함수는 기본으로 아무에게도 열지 않는다 — 서버(service_role)도 없다).
-- 그래서 11/5 부터 강사 · 관리자 세션과 서버가 class_sections 에 넣거나 고치는 것이 전부 `permission denied for function time_block_start`(42501)로 실패했다:
-- 평달 자동 세팅(달력 저장 · 10분 확인 — 화면에는 "이 계정(테스트 등급)으로는 열 수 없었어요") · 새 반 개설 · 하나씩 만들기 · 반 수정 · 담당 강사 지정.
-- 12월은 그날 뒤 처음 여는 달이라 반이 하나도 생기지 않았고 받아 둔 12월 수강증이 반을 기다린 채 남았다. 재생 DB 로 재현 · 확인.
--
-- 고침: 같은 뜻을 함수 없이 적는다 (시간대 라벨이 `HH:MM~HH:MM` 이 아니면 예전처럼 통과 — 함수가 null 을 돌려 검사가 통과했다).
-- 실행 권한을 넓히지 않는다. 반영되면 10분 확인(month-auto-open)이 12월 반을 저절로 열고 받아 둔 12월 수강증을 배정한다.

alter table public.class_sections drop constraint if exists class_sections_second_start_check;
alter table public.class_sections add constraint class_sections_second_start_check
  check (
    case
      when second_start is null or time_block is null then true
      when time_block ~ '^\d{2}:\d{2}~\d{2}:\d{2}$'
        then second_start > split_part(time_block, '~', 1)::time and second_start < split_part(time_block, '~', 2)::time
      else true
    end
  );
