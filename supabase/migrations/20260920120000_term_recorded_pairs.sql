-- ============================================================================
-- 인강 반 ↔ 오전 짝을 화면이 읽는 길 (2026-09-20 Alan)
--
--   Alan: "저녁 화목금은 인강이잖아? 인강이라는 말이 녹화된 방송을 본다는 말이야.
--          즉 다시보기라는 말이야. 실시간은 아니고"
--
-- 그래서 **인강 반 학생에게는 다시보기가 수업 그 자체다.** 그런데 그 영상은 인강 반이 아니라
-- **오전 짝 반**에 올라가야 보인다 (`private.recorded_source_section` → `private.has_recorded_replay_access`,
-- 마이그레이션 20260918153000). 오전 반에 녹화본이 없으면 저녁 인강 학생은 볼 것이 없다.
--
-- 그동안 다시보기 등록 화면은 "오전 반에 올려 주세요" 라고만 했지 **어느 반인지 말해 주지 못했다** —
-- 짝을 찾는 함수가 `private` 스키마라 PostgREST 로 못 부르기 때문이다.
-- 여기서 공개 창구를 하나 낸다 (`public.term_section_includes` 와 같은 방식).
--
-- **짝 규칙은 여기서 새로 만들지 않는다** — `private.recorded_source_section` 을 그대로 부른다.
-- 규칙을 바꿀 일이 있으면 그 함수 한 곳만 고친다 (화면에서 따로 계산하지 말 것, 도메인 규칙 1 "반 권한").
-- ============================================================================

create or replace function public.term_recorded_pairs(p_term_id bigint)
returns table (recorded_id bigint, source_id bigint)
language sql
stable
security invoker          -- 반 목록은 RLS 가 정하는 대로만 본다 (draft 는 스태프만)
set search_path = ''
as $$
  select e.id, private.recorded_source_section(e.id)
  from public.class_sections e
  where e.term_id = p_term_id
    and e.recorded
    and private.recorded_source_section(e.id) is not null
  order by e.id
$$;

comment on function public.term_recorded_pairs(bigint) is
  '그 기수의 인강 반 → 녹화본을 올릴 오전 짝 반. 다시보기 등록 화면이 "어디에 올려야 하나" 를 말해 주는 데 쓴다';

revoke all on function public.term_recorded_pairs(bigint) from public, anon;
grant execute on function public.term_recorded_pairs(bigint) to authenticated, service_role;
