-- ============================================================================
-- LC 교재·음원 구조 변경 (2026-09-16 Alan 요청)
--
--  * 교재는 레벨마다 A반 1권 + B반 1권. 레벨이 650·750·850 세 개라 전체 6권이다
--    (이전에는 반마다 2권씩 레벨당 4권이었다). "권"이 늘 1 이므로 volume 컬럼을 지우고
--    레벨 × 반이 곧 교재 한 권이 되게 한다.
--  * 음원은 교재마다 Day 1~9 아홉 칸이다. 자유 제목 대신 day 가 자리를 정하고
--    한 칸에 파일 하나만 들어간다 (unique(book_id, day)). 강사는 빈 칸을 채우거나 바꾼다.
--
--  표지·음원은 되돌릴 수 없으므로, 지워질 자리에 파일이 남아 있으면 지우지 않고 예외를 던진다.
-- ============================================================================

-- ─── 1. 2권 교재 정리 ──────────────────────────────────────────────────────
do $$
declare v_blocked text;
begin
  select string_agg(format('%s %s반 %s권', b.level, b.book_set, b.volume), ', ' order by b.level, b.book_set, b.volume)
  into v_blocked
  from public.lc_books b
  where b.volume > 1
    and (b.cover_path is not null or exists (select 1 from public.lc_audio_tracks t where t.book_id = b.id));

  if v_blocked is not null then
    raise exception 'LC 교재 2권에 표지나 음원이 남아 있어 지울 수 없습니다: %', v_blocked
      using hint = '/admin/lc-audio 에서 해당 교재의 표지·음원을 먼저 지운 뒤 다시 실행하세요.';
  end if;
end $$;

delete from public.lc_books where volume > 1;

-- 컬럼을 지우면 unique(level, book_set, volume) 도 함께 사라지므로 새 제약을 다시 건다
alter table public.lc_books drop column volume;
alter table public.lc_books add constraint lc_books_level_book_set_key unique (level, book_set);
comment on table public.lc_books is 'LC 교재. 레벨마다 A반(홀수달) 1권 + B반(짝수달) 1권';

-- 새 레벨 → 교재 칸 2개
create or replace function private.lc_levels_create_books()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lc_books (level, book_set)
  select new.level, s.book_set
  from (values ('A'), ('B')) as s (book_set)
  on conflict (level, book_set) do nothing;
  return new;
end;
$$;

revoke execute on function private.lc_levels_create_books() from public, anon, authenticated;

-- ─── 2. 음원: 제목 → Day 1~9 ───────────────────────────────────────────────
do $$
declare v_over text;
begin
  select string_agg(format('교재 #%s (%s개)', s.book_id, s.cnt), ', ' order by s.book_id)
  into v_over
  from (select book_id, count(*) as cnt from public.lc_audio_tracks group by book_id having count(*) > 9) s;

  if v_over is not null then
    raise exception 'Day 는 1~9 뿐인데 음원이 더 많은 교재가 있습니다: %', v_over
      using hint = '/admin/lc-audio 에서 남는 음원을 지운 뒤 다시 실행하세요.';
  end if;
end $$;

alter table public.lc_audio_tracks add column day int;

-- 제목에 든 숫자 순서로 Day 를 매긴다 (숫자가 없으면 제목 순서). 배포 시점 행 0건이라 사실상 no-op
update public.lc_audio_tracks t
set day = n.seq
from (
  select id,
         row_number() over (
           partition by book_id
           order by nullif(left(regexp_replace(title, '\D', '', 'g'), 9), '')::bigint nulls last, title, id
         ) as seq
  from public.lc_audio_tracks
) n
where n.id = t.id;

alter table public.lc_audio_tracks
  alter column day set not null,
  add constraint lc_audio_tracks_day_check check (day between 1 and 9),
  add constraint lc_audio_tracks_book_id_day_key unique (book_id, day),
  drop column title;

-- unique(book_id, day) 가 book_id 조회도 덮으므로 예전 단일 인덱스는 지운다
drop index if exists public.lc_audio_tracks_book_id_idx;

comment on column public.lc_audio_tracks.day is '교재 안의 Day (1~9). 한 교재의 한 Day 에 음원 하나';
