-- 숙제점검 학생 이름 검색 (2026-10-30 Alan — "숙제점검에서 학생이름이 검색가능하도록 해줘!")
--
-- 숙제점검은 조교에게도 열린 화면이고 조교는 profiles 를 못 읽는다 (등급 체계 9-2 — 20261003110000).
-- 그래서 이름으로 찾는 일도 profile_names 처럼 **이름 · 등급만** 주는 함수로 한다. 전화번호 · 대학 · 학과 · 성별 · 사진은 주지 않는다.
--   - 강사 · 관리자 · 조교만 (is_crew — 테스트 등급을 켜면 학생으로 보아 막힌다)
--   - 빈칸을 빼고 대소문자 없이 이름의 일부로 찾는다 (`문라` → 문라경). 1 ~ 40자
--   - 합쳐진 옛 계정은 빼고, 숙제를 낸 적이 있거나 반에 배정된 적이 있는 사람만 — 가입만 한 회원 명단을 넘기지 않는다
--   - 50명까지, 이름순
create or replace function public.homework_student_search(p_q text)
returns table (user_id uuid, name text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(replace(btrim(coalesce(p_q, '')), ' ', ''));
begin
  if not private.is_crew() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if char_length(v_q) = 0 or char_length(v_q) > 40 then
    return;
  end if;

  return query
  select p.id, p.name, p.role::text
    from public.profiles p
   where p.merged_into is null
     and strpos(lower(replace(p.name, ' ', '')), v_q) > 0
     and (exists (select 1 from public.homework_submissions h where h.user_id = p.id)
          or exists (select 1 from public.enrollments e where e.student_id = p.id))
   order by p.name, p.id
   limit 50;
end;
$$;

revoke all on function public.homework_student_search(text) from public, anon;
grant execute on function public.homework_student_search(text) to authenticated;

comment on function public.homework_student_search(text) is
  '숙제점검 학생 이름 검색 (2026-10-30). 강사·관리자·조교만, 이름 · 등급만 준다 — 조교는 profiles 를 못 읽는다';
