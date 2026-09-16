-- ============================================================================
-- 강사의 담당 과목 (2026-09-16 Alan 요청)
--
--  "자동으로 LC 이혜영, RC 이영수 자동으로 넣어주면 안될까"
--
--  강사는 과목으로 고정돼 있다 — **이혜영 = LC · 이영수 = RC**. 그 값을 계정에 적어 두면
--  반의 과목만 알면 담당 강사가 저절로 정해진다.
--
--  반의 과목은 이미 데이터에 있다: **`class_sections.book_set` 은 LC 교재**라서
--  값이 있으면 그 시간은 LC, 없으면 RC 다 (도메인 규칙 1 "LC 교재"). 묶음 반(120분·140분)과
--  스파르타 반은 두 과목을 이어 듣기 때문에 담당이 한 명으로 정해지지 않는다 — 비워 둔다.
--
--  subject 는 authenticated 에 update 권한을 주지 않는다 (아래 grant 목록에 없다).
--  본인이 자기 과목을 바꿔 강사 행세를 하는 길을 막는다 — 바꿀 일이 있으면 SQL 로 한다.
-- ============================================================================

alter table public.profiles
  add column if not exists subject text
    check (subject is null or subject in ('lc', 'rc'));

comment on column public.profiles.subject is
  '강사의 담당 과목 lc | rc (2026-09-16 Alan: 이혜영 LC · 이영수 RC). 강사가 아니면 null. '
  '담당 강사 자동 지정이 이 값과 class_sections.book_set 을 맞춰 본다';

-- 예약된 강사 이름에 과목도 같이 적어 둔다 — 가입하는 순간 과목까지 들어간다
alter table private.reserved_staff
  add column if not exists subject text
    check (subject is null or subject in ('lc', 'rc'));

update private.reserved_staff set subject = 'lc' where name = '이혜영';
update private.reserved_staff set subject = 'rc' where name = '이영수';

-- 이미 가입한 강사에게도 넣는다
update public.profiles p
   set subject = r.subject
  from private.reserved_staff r
 where btrim(p.name) = r.name
   and r.subject is not null
   and p.subject is distinct from r.subject;

-- ─── 가입 트리거: 예약된 이름이면 등급과 과목을 함께 준다 ──────────────────
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name    text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), '');
  v_role    public.user_role;
  v_subject text;
begin
  -- 예약된 강사 이름이면 그 등급·과목을 준다. 잡는 즉시 잠기므로 한 사람만 받는다
  if v_name <> '' then
    update private.reserved_staff r
       set claimed_by = new.id, claimed_at = now()
     where r.name = v_name
       and r.claimed_by is null
    returning r.role, r.subject into v_role, v_subject;
  end if;

  insert into public.profiles (id, name, phone, role, subject, university, department, gender)
  values (
    new.id,
    v_name,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    coalesce(v_role, 'member'),
    v_subject,
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
  '가입하면 profiles 를 만든다. private.reserved_staff 에 예약된 이름이면 그 등급·과목으로 시작한다 (2026-09-16)';
