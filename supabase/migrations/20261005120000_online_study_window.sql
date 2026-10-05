-- ============================================================================
-- 비대면 스터디 — 개강일부터 3일 동안만 신청, 4일째부터 시작 (2026-10-05 Alan — "비대면 스터디는 개강후 3일동안만 신청받고
-- 4일째부터 시작! 자료 올리는 날짜를 바꿔야 할꺼 같아. 개강은 강사가 지정한 날짜로 시작해줘." · 고른 것 "개강일부터 달력 3일")
--
--  * 개강일 = 강사가 반 편성 달력에서 정한 그 달 개강일(terms.enrollment_opens_at). 첫 수업일이 아니다.
--  * 신청 기간 = 개강일 · +1 · +2 (달력 날짜 — 주말도 센다). 예) 10/6(화) 개강 → 10/6 · 10/7 · 10/8 신청, 10/9(금)부터 시작.
--  * 1회차 = 개강일+3 이후 첫 수업일(월수금 + 화목금 합쳐 날짜순, 종강일까지). 그 앞 수업일에는 비대면 자료가 없다.
--    그전(20260922124700)에는 1회차가 개강일 뒤 첫 수업일이었다.
--  * 대면 · 단어 스터디는 그대로다 — 신청 받는 중(open)이면 그 달 수강생이 언제든 신청 · 변경 · 취소한다.
--
-- 신청 · 시간대 변경 · 본인 취소 정책이 private.study_signup_open(스터디) 를 본다 (상태 open + 비대면이면 신청 기간 안).
-- 신청 기간이 지나면 학생은 취소도 못 하고 스태프·조교가 명단에서 취소한다 — "본인 취소는 신청 받는 중일 때만" 과 같은 규칙.
-- 앱의 onlineStudyWindow(src/lib/study-rounds.ts, study-rounds.test.ts)와 같은 규칙이다 — **바꾸면 둘 다.**
-- ============================================================================

-- 비대면 스터디가 시작하는 날 = 개강일 + 3 (개강일이 없으면 null — 그 달은 반도 열 수 없다)
create or replace function private.online_study_starts_on(p_term_id bigint)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select t.enrollment_opens_at + 3 from public.terms t where t.id = p_term_id
$$;
comment on function private.online_study_starts_on(bigint) is
  '비대면 스터디 시작일 = 개강일 + 3 (개강일 · +1 · +2 는 신청 기간). 앱 onlineStudyWindow 와 같은 규칙 (2026-10-05 Alan)';

revoke all on function private.online_study_starts_on(bigint) from public, anon;
grant execute on function private.online_study_starts_on(bigint) to authenticated, service_role;

-- 지금 이 스터디에 신청 · 변경 · 본인 취소를 받는가 — 상태가 open 이고, 비대면이면 개강일 ~ 개강일+2 (KST)
create or replace function private.study_signup_open(p_study_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.status = 'open'
       and (
         s.kind <> 'online'
         or (t.enrollment_opens_at is not null
             and private.today_kst() between t.enrollment_opens_at and t.enrollment_opens_at + 2)
       )
      from public.studies s
      join public.terms t on t.id = s.term_id
     where s.id = p_study_id
  ), false)
$$;
comment on function private.study_signup_open(bigint) is
  '신청 받는 중인가 — 상태 open, 비대면은 개강일부터 달력 3일(개강일 ~ +2, KST)만. 대면 · 단어는 open 이면 언제나 (2026-10-05 Alan)';

revoke all on function private.study_signup_open(bigint) from public, anon;
grant execute on function private.study_signup_open(bigint) to authenticated, service_role;

-- 비대면 회차 = 개강일+3 ~ 종강일 안의 수업일 순서 (월수금 + 화목금 합집합). term_class_days 는 개강일부터라 그대로 두고 따로 둔다
create or replace function private.online_study_days(p_term_id bigint)
returns table (seq int, date date)
language sql
stable
security definer
set search_path = ''
as $$
  select (row_number() over (order by d.date))::int, d.date
    from (
      select distinct c.date
        from public.term_class_dates c
        join public.terms t on t.id = c.term_id
       where c.term_id = p_term_id
         and t.enrollment_opens_at is not null
         and c.date >= t.enrollment_opens_at + 3
         and (t.closes_at is null or c.date <= t.closes_at)
    ) d
$$;
comment on function private.online_study_days(bigint) is
  '비대면 자료 회차 = 개강일+3 부터 종강일까지의 수업일 순서 (2026-10-05). 앱 classDayRounds(…, { opens: 시작일 }) 와 같은 규칙';

revoke all on function private.online_study_days(bigint) from public, anon, authenticated;

-- 20260930100000 의 함수에서 회차 날짜만 online_study_days 로 바꿨다 (나머지는 그대로)
create or replace function private.sync_online_materials()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select s.id as study_id, s.term_id
      from public.studies s
      join public.terms t on t.id = s.term_id
     where s.kind = 'online'
       and (t.closes_at is null or t.closes_at >= private.today_kst())   -- 끝난 달은 지난 기록이다
  loop
    insert into public.study_materials as m
      (study_id, seq, date, item_id, title, note, file_path, file_name, file_size, content_type, uploaded_by, updated_at)
    select r.study_id, d.seq, d.date, i.id, i.title, i.note, i.file_path, i.file_name, i.file_size, i.content_type, i.uploaded_by, now()
      from private.online_study_days(r.term_id) d
      join public.study_material_items i on i.seq = d.seq
    on conflict (study_id, seq) do update
       set date = excluded.date, item_id = excluded.item_id, title = excluded.title, note = excluded.note, file_path = excluded.file_path,
           file_name = excluded.file_name, file_size = excluded.file_size, content_type = excluded.content_type,
           uploaded_by = excluded.uploaded_by, updated_at = now()
     where (m.date, m.item_id, m.title, m.note, m.file_path, m.file_name, m.file_size, m.content_type)
           is distinct from
           (excluded.date, excluded.item_id, excluded.title, excluded.note, excluded.file_path, excluded.file_name, excluded.file_size, excluded.content_type);

    -- 더는 없는 회차(수업일이 줄었거나 자료를 지웠다)는 뺀다 — 인증이 붙은 행은 남긴다 (지우면 인증이 함께 지워진다)
    delete from public.study_materials m
     where m.study_id = r.study_id
       and not exists (
         select 1
           from private.online_study_days(r.term_id) d
           join public.study_material_items i on i.seq = d.seq
          where d.seq = m.seq)
       and not exists (select 1 from public.study_checkins c where c.material_id = m.id);
  end loop;
end;
$$;

revoke all on function private.sync_online_materials() from public, anon, authenticated;

-- 신청 · 변경 · 본인 취소
drop policy "study_signups: 수강생 신청" on public.study_signups;
create policy "study_signups: 수강생 신청" on public.study_signups
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.studies s
      where s.id = study_signups.study_id
        and private.study_signup_open(s.id)
        and private.is_term_enrollee(s.term_id)
    )
  );

drop policy "study_signups: 본인 시간대 변경" on public.study_signups;
create policy "study_signups: 본인 시간대 변경" on public.study_signups
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.studies s
      where s.id = study_signups.study_id
        and private.study_signup_open(s.id)
        and private.is_term_enrollee(s.term_id)
    )
  );

drop policy "study_signups: 본인 취소·스태프·조교 정리" on public.study_signups;
create policy "study_signups: 본인 취소·스태프·조교 정리" on public.study_signups
  for delete to authenticated
  using (
    (select private.is_crew())
    or (
      (select auth.uid()) = user_id
      and private.study_signup_open(study_signups.study_id)
    )
  );

-- 지금 열려 있는 달의 회차 날짜를 새 규칙으로 다시 붙인다 (끝난 달은 건드리지 않는다 · 인증이 붙은 회차는 남는다)
select private.sync_online_materials();
