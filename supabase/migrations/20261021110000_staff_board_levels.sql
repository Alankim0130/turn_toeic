-- ============================================================================
-- 직원 게시판 레벨 · 수업자료실과 옮기기 (2026-10-21 Alan — "이 게시물을 수업게시판으로 옮길 수 있으면 좋겠어. 반대로 수업게시물에 있는 내용을
--   다시 직원게시판으로 옮길 수 도 있어야해. 그리고 직원게시판도 학습자료실처럼 650,750,850구분이 다 되어있으면 좋겠어.")
--
--   * levels — 글의 레벨 (수업자료실 공지와 같은 꼴: 비우면 모든 레벨). 직원 게시판 화면은 650 · 750 · 850 탭이고(레벨은 lc_levels 에서 읽는다),
--     모든 레벨 글은 모든 탭에 선다. 값이 레벨 목록에 있는지는 앱이 본다 (공지와 같다).
--   * moved_from — 수업자료실에서 옮겨 온 글이면 원래 자리 (공지 {kind, levels, subjects} · 회차 자료 {kind, level, subject, set, seq}).
--     다시 수업자료실로 옮길 때 그 자리를 미리 골라 두고, 글 화면에 "어디에서 옮겨 온 글" 을 적는 데만 쓴다 — 권한과는 상관없다.
--     옮겨 올 때 한 번 넣고 고치지 않는다 (update grant 없음).
--   * 옮기기는 앱(서버 액션)이 로그인한 강사 · 관리자의 세션으로 한다 — 사진 · 파일을 저장소에서 복사 → 새 행 → 원래 행 지우기.
--     새 표 · 정책은 없다 (수업자료실 쓰기는 강사 · 관리자, 직원 글 지우기는 강사 · 관리자 — 이미 있는 정책 그대로).
--   * 고친 시각은 레벨이 바뀔 때도 오른다 (제목 · 본문 · 링크 · 레벨).
--   * 두 번 돌아도 된다 (add column if not exists · create or replace).
-- ============================================================================

alter table public.staff_posts add column if not exists levels int[] not null default '{}';
alter table public.staff_posts add column if not exists moved_from jsonb;

alter table public.staff_posts drop constraint if exists staff_posts_levels_check;
alter table public.staff_posts add constraint staff_posts_levels_check
  check (cardinality(levels) <= 20 and array_position(levels, null) is null);
alter table public.staff_posts drop constraint if exists staff_posts_moved_from_check;
alter table public.staff_posts add constraint staff_posts_moved_from_check
  check (moved_from is null or (jsonb_typeof(moved_from) = 'object' and moved_from ->> 'kind' in ('notice', 'material') and length(moved_from::text) <= 1000));

comment on column public.staff_posts.levels is '글의 레벨 (2026-10-21) — 비우면 모든 레벨. 직원 게시판의 650 · 750 · 850 탭이 이것으로 가른다';
comment on column public.staff_posts.moved_from is '수업자료실에서 옮겨 온 글의 원래 자리 (2026-10-21) — 다시 옮길 때 미리 골라 두는 데만 쓴다';

-- 넣을 때 레벨 · 옮겨 온 곳까지, 고칠 때는 레벨까지 (글쓴이 · 시각은 그대로 트리거가 채운다)
grant insert (title, body, links, levels, moved_from), update (title, body, links, levels) on public.staff_posts to authenticated;

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
     or new.levels is distinct from old.levels then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.tg_staff_posts_stamp() from public, anon, authenticated;
