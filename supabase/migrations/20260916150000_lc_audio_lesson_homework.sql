-- ============================================================================
-- LC 음원: 수업음원 · 숙제음원 구분, 한 강에 파일 여러 개, 반마다 시작 강 번호
-- (2026-09-16 Alan 요청)
--
--  * 650 교재에는 수업시간 음원과 숙제 음원이 따로 있다. 학생 화면에서 나눠 보여준다.
--    숙제 음원은 지금 650 에만 있지만 나중에 다른 레벨에도 생길 수 있어 레벨로 막지 않는다.
--  * 한 강에 파일이 여러 개인 경우가 실제로 있다
--    (650A 3강 = 교과서 현재진행형 + 영국발음, 650A 9강 = 9강 + 10강, 750A 9강 = 팟3 + 음성).
--    그래서 unique(book_id, day) 를 풀고 같은 칸에 여러 파일을 담을 수 있게 한다.
--  * 반마다 강 번호가 다르게 시작한다 — 650A 는 1강부터, 650B 는 11강부터다.
--    Day 1~9 는 그대로 두고 교재에 시작 번호를 두어 화면에서 "11강" 으로 보이게 한다.
-- ============================================================================

-- ─── 1. 교재: 시작 강 번호 ─────────────────────────────────────────────────
alter table public.lc_books
  add column lesson_offset int not null default 0
    check (lesson_offset >= 0 and lesson_offset <= 200);

comment on column public.lc_books.lesson_offset is
  '이 교재의 첫 강 번호 - 1. Day n 은 (lesson_offset + n)강으로 보인다. 650B 는 11강부터라 10';

-- 650B = 11강~19강 (2026-09-16 Alan 확인). 나머지는 1강부터라 0 그대로
update public.lc_books set lesson_offset = 10 where level = 650 and book_set = 'B';

-- 화면에서 고칠 수 있어야 한다 — lc_books 는 컬럼 단위 update 권한을 쓴다
grant update (lesson_offset) on public.lc_books to authenticated;

-- ─── 2. 음원: 수업 / 숙제 구분과 한 칸 여러 파일 ───────────────────────────
alter table public.lc_audio_tracks
  add column kind text not null default 'lesson'
    check (kind in ('lesson', 'homework')),
  add column label text
    check (label is null or char_length(btrim(label)) between 1 and 40),
  add column sort_order int not null default 0
    check (sort_order >= 0 and sort_order <= 99);

comment on column public.lc_audio_tracks.kind is 'lesson(수업시간 음원) | homework(숙제 음원)';
comment on column public.lc_audio_tracks.label is '같은 강에 파일이 여러 개일 때 구분하는 이름 (예: 영국발음, 팟3). 비우면 강 이름만 보인다';
comment on column public.lc_audio_tracks.sort_order is '같은 강 안에서의 순서';

-- 한 강에 파일이 여러 개 올 수 있다 (같은 파일 두 번 올리는 것은 file_path unique 가 막는다)
alter table public.lc_audio_tracks drop constraint lc_audio_tracks_book_id_day_key;

create index lc_audio_tracks_book_kind_day_idx
  on public.lc_audio_tracks (book_id, kind, day, sort_order, id);

comment on table public.lc_audio_tracks is
  'LC 음원. 교재 × 종류(수업/숙제) × Day 1~9, 한 칸에 파일 여러 개 가능';
