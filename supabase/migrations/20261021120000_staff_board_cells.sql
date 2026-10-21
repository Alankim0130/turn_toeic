-- ============================================================================
-- 직원 게시판 과목 · 과정 (2026-10-21 Alan — 수업자료실의 `RC A과정 · RC B과정 · LC A과정 · LC B과정` 줄을 보여 주며
--   "그리고 A, B과정 표시가 없어. 이렇게해줘").
--
--   * subject — 글의 과목 rc | lc, book_set — 글의 과정 A | B. 수업자료실 자료(class_materials)와 같은 이름 · 같은 값이다.
--     **비우면 둘 다**다 — 값이 둘뿐이라 "RC 와 LC 둘 다" 는 빈 값 하나로 적는다 (레벨처럼 배열을 두지 않는다).
--     직원 게시판 화면은 레벨 탭 아래 둘째 줄이 칸(과목 × 과정)이고, 칸 하나에는 그 칸 글과 과목 · 과정을 비운 글이 함께 선다
--     (레벨의 '모든 레벨' 글과 같은 규칙). 값이 맞는지는 아래 check 와 앱이 본다.
--   * 수업자료실에서 옮겨 온 글은 원래 자리(moved_from)로 채운다 — 회차 자료는 그 과목 · 과정, 공지는 과목이 하나일 때 그 과목.
--     채우기는 고친 시각 트리거를 바꾸기 **전에** 한다 (지금 트리거는 이 두 칸을 보지 않아 글에 '고침' 이 붙지 않는다).
--   * 넣을 때 · 고칠 때 둘 다 쓴다 (grant). 고친 시각은 과목 · 과정이 바뀔 때도 오른다 (제목 · 본문 · 링크 · 레벨 · 과목 · 과정).
--   * 다시 돌려도 오류가 나지 않는다 (add column if not exists · drop constraint if exists · create or replace · 채우기는 빈 칸만).
-- ============================================================================

alter table public.staff_posts add column if not exists subject text;
alter table public.staff_posts add column if not exists book_set text;

alter table public.staff_posts drop constraint if exists staff_posts_subject_check;
alter table public.staff_posts add constraint staff_posts_subject_check check (subject is null or subject in ('rc', 'lc'));
alter table public.staff_posts drop constraint if exists staff_posts_book_set_check;
alter table public.staff_posts add constraint staff_posts_book_set_check check (book_set is null or book_set in ('A', 'B'));

comment on column public.staff_posts.subject is '글의 과목 rc | lc (2026-10-21) — 비우면 두 과목. 직원 게시판 둘째 줄(RC A과정 …)이 이것과 book_set 으로 가른다';
comment on column public.staff_posts.book_set is '글의 과정 A | B (2026-10-21) — 비우면 두 과정. 수업자료실 자료의 book_set 과 같은 값';

-- 수업자료실에서 옮겨 온 글 — 원래 자리의 과목 · 과정으로 (빈 칸만)
update public.staff_posts
   set subject = moved_from ->> 'subject'
 where subject is null
   and moved_from ->> 'kind' = 'material'
   and moved_from ->> 'subject' in ('rc', 'lc');

update public.staff_posts
   set book_set = moved_from ->> 'set'
 where book_set is null
   and moved_from ->> 'kind' = 'material'
   and moved_from ->> 'set' in ('A', 'B');

update public.staff_posts
   set subject = moved_from -> 'subjects' ->> 0
 where subject is null
   and moved_from ->> 'kind' = 'notice'
   and jsonb_typeof(moved_from -> 'subjects') = 'array'
   and jsonb_array_length(moved_from -> 'subjects') = 1
   and moved_from -> 'subjects' ->> 0 in ('rc', 'lc');

-- 넣을 때 과목 · 과정까지, 고칠 때도 과목 · 과정까지 (글쓴이 · 시각은 그대로 트리거가 채운다 — 그 칸은 grant 가 없다)
grant insert (title, body, links, levels, moved_from, subject, book_set), update (title, body, links, levels, subject, book_set) on public.staff_posts to authenticated;

create or replace function private.tg_staff_posts_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := left(private.my_profile_name(), 40);
    new.created_at := now();
    new.updated_at := now();
  elsif new.title is distinct from old.title or new.body is distinct from old.body or new.links is distinct from old.links
     or new.levels is distinct from old.levels or new.subject is distinct from old.subject or new.book_set is distinct from old.book_set then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.tg_staff_posts_stamp() from public, anon, authenticated;
