-- ============================================================================
-- 강사 계정 고정 (2026-09-16 Alan 요청)
--
--  "강사는 고정이야. 이혜영을 강사로 고정시켜줘. 그리고 아직 가입은 안했지만 나중에
--   이영수 강사님이 가입을 할거야. 학생들에게 배포를 아직 안했으니 다른사람 가입할 걱정은 없어"
--
--  역전토익 강사는 **이혜영(LC) · 이영수(RC) 둘로 고정**이다. 이름을 미리 예약해 두고,
--  그 이름으로 가입하면 가입 트리거가 처음부터 강사 등급을 준다.
--
--  ※ 이름으로 등급을 주는 것이라 **한 번 쓰면 잠근다** — 같은 이름으로 또 가입해도
--    두 번째부터는 평범한 회원이다. 지금은 학생에게 주소를 알리기 전이라 안전하지만,
--    배포 뒤에는 이 표를 비워 두는 편이 낫다 (아래 "쓰는 법" 참고).
-- ============================================================================

create table if not exists private.reserved_staff (
  name       text primary key,
  role       public.user_role not null,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz
);

comment on table private.reserved_staff is
  '가입하면 그 등급으로 시작하는 이름. 강사 이혜영·이영수 전용이고 한 번 쓰면 잠긴다 (2026-09-16 Alan). '
  '쓰는 법 — 추가: insert into private.reserved_staff(name, role) values (''홍길동'', ''instructor''); '
  '다시 열기: update private.reserved_staff set claimed_by = null, claimed_at = null where name = ''…''; '
  '끄기: delete from private.reserved_staff;';

-- private 스키마라 클라이언트는 손댈 수 없다 (트리거는 security definer 로 읽는다)
revoke all on private.reserved_staff from public, anon, authenticated;

insert into private.reserved_staff (name, role) values
  ('이혜영', 'instructor'),
  ('이영수', 'instructor')
on conflict (name) do nothing;

-- ─── 이미 가입한 이혜영 계정을 강사로 ──────────────────────────────────────
-- 지금은 관리자로 올려 둔 상태다. 강사 권한 = 관리자 권한(20260916240000)이라 잃는 것은 없다.
-- 마지막 관리자면 그대로 둔다 — 알런이 관리자로 남아 있으므로 실제로는 바뀐다.
update public.profiles p
   set role = 'instructor'
 where btrim(p.name) = '이혜영'
   and p.role <> 'instructor'
   and (
     p.role <> 'admin'
     or exists (select 1 from public.profiles a where a.role = 'admin' and a.id <> p.id)
   );

-- 이미 계정이 있는 이름은 예약을 써 버린 것으로 잠근다 (같은 이름의 두 번째 가입을 막는다)
update private.reserved_staff r
   set claimed_by = p.id, claimed_at = now()
  from public.profiles p
 where r.claimed_by is null
   and btrim(p.name) = r.name;

-- ─── 가입 트리거: 예약된 이름이면 그 등급으로 시작한다 ─────────────────────
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), '');
  v_role public.user_role;
begin
  -- 예약된 강사 이름이면 그 등급을 준다. 잡는 즉시 잠기므로 한 사람만 받는다
  if v_name <> '' then
    update private.reserved_staff r
       set claimed_by = new.id, claimed_at = now()
     where r.name = v_name
       and r.claimed_by is null
    returning r.role into v_role;
  end if;

  insert into public.profiles (id, name, phone, role, university, department, gender)
  values (
    new.id,
    v_name,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    coalesce(v_role, 'member'),
    nullif(btrim(new.raw_user_meta_data ->> 'university'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'department'), ''),
    case
      when new.raw_user_meta_data ->> 'gender' in ('male', 'female', 'other', 'undisclosed')
        then new.raw_user_meta_data ->> 'gender'
      else null
    end
  );
  return new;
end;
$$;

comment on function private.handle_new_user() is
  '가입하면 profiles 를 만든다. private.reserved_staff 에 예약된 이름이면 그 등급으로 시작한다 (2026-09-16)';
