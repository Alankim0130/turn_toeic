-- ============================================================================
-- 3주차 모의고사 특강은 YBM 수강후기 링크를 올려야 신청된다 (2026-10-08 Alan — "3주차 특강에서 모의고사 특강을 신청할때,
--   ybm홈페이지에서 수강후기를 작성해서 올리는것이 신청조건이야. 학생이 후기를 적고 난 뒤에 이미지처럼 링크를 올리면 신청이 되는걸로 해줘.")
--
--   * 신청에 후기 링크 칸(lecture_signups.review_url)을 더한다 — http(s) 주소 한 줄, 2,000자까지 (수업자료실 링크와 같은 끝).
--     **어느 사이트 주소인지는 막지 않는다** — YBM 후기 주소의 모양을 이 작업 환경에서 볼 수 없어(ybmedu.com 이 막혀 있다)
--     짐작으로 막으면 진짜 후기 링크가 튕긴다. 강사 화면(/admin/lectures)이 ybmedu.com 이 아닌 주소 · 같은 링크를 낸 학생을 표시한다.
--   * 후기 링크가 필요한 특강 = **모의고사(mock1 · mock2)가 든 특강 중 3주차인 것** (private.lecture_needs_review).
--     주차는 그 달 개강일(terms.enrollment_opens_at)이 든 주(월요일 시작)가 1주차 — 2026년 10월(10/6 개강)이면 10/24(토) RC특강 + 2차 모의고사,
--     9월(9/3)은 9/19, 7월(7/3)은 7/18, 8월(8/4)은 8/22 — 지금까지 달마다 2차 모의고사 날이다.
--     강사가 개강일이나 특강 날짜를 바꾸면 그대로 다시 센다. 앱 needsReviewLink(src/lib/lecture.ts, lecture.test.ts)와 같은 규칙 — 바꾸면 둘 다.
--   * 신청을 넣을 때 트리거가 막는다 (review_link_required) — 화면 · 서버 액션이 먼저 말하지만, 주소를 직접 불러 넣는 길도 같은 규칙이다.
--     이미 들어간 신청은 건드리지 않는다 (넣을 때만 본다). 링크를 고치는 길은 없다 — 신청 받는 중이면 취소하고 다시 신청한다.
-- ============================================================================

-- ─── 1. 후기 링크 칸 ─────────────────────────────────────────────────────
alter table public.lecture_signups add column if not exists review_url text;

alter table public.lecture_signups drop constraint if exists lecture_signups_review_url_check;
alter table public.lecture_signups
  add constraint lecture_signups_review_url_check
  check (review_url is null or (char_length(review_url) <= 2000 and review_url ~ '^https?://[^[:space:]]+$'));

comment on column public.lecture_signups.review_url is
  'YBM 수강후기 링크 (2026-10-08) — 3주차 모의고사 특강을 신청할 때 학생이 올린다 (private.lecture_needs_review). 그 밖의 특강은 비어 있다';

-- 학생이 신청하며 넣는다 (lecture_id · user_id 와 같은 칸 단위 grant)
grant insert (review_url) on public.lecture_signups to authenticated;

-- ─── 2. 후기 링크가 필요한 특강인가 ────────────────────────────────────────
create or replace function private.lecture_needs_review(p_lecture_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.special_lectures l
    join public.terms t on t.id = l.term_id
    where l.id = p_lecture_id
      and l.kinds && array['mock1', 'mock2']::text[]
      and t.enrollment_opens_at is not null
      -- 그 주의 월요일끼리 뺀 날수 / 7 + 1 = 주차 (개강일이 든 주가 1주차)
      and ((l.date - (extract(isodow from l.date)::int - 1))
           - (t.enrollment_opens_at - (extract(isodow from t.enrollment_opens_at)::int - 1))) / 7 + 1 = 3
  )
$$;
comment on function private.lecture_needs_review(bigint) is
  '후기 링크를 올려야 신청되는 특강인가 — 모의고사(mock1 · mock2)가 든 3주차 특강 (개강일이 든 주 = 1주차, 월요일 시작). 앱 needsReviewLink 와 같은 규칙 (2026-10-08 Alan)';
grant execute on function private.lecture_needs_review(bigint) to authenticated, service_role;

-- ─── 3. 신청을 넣을 때 막는다 ─────────────────────────────────────────────
create or replace function private.lecture_signups_review_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.review_url is null and private.lecture_needs_review(new.lecture_id) then
    raise exception 'review_link_required'
      using errcode = 'P0001', detail = '이 특강은 YBM 수강후기 링크를 올려야 신청할 수 있습니다.';
  end if;
  return new;
end;
$$;
revoke execute on function private.lecture_signups_review_check() from public, anon, authenticated;

drop trigger if exists lecture_signups_review_check on public.lecture_signups;
create trigger lecture_signups_review_check
  before insert on public.lecture_signups
  for each row execute function private.lecture_signups_review_check();
