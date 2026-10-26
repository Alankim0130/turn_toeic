-- ============================================================================
-- 불라방 교재 현장수령 — 받으러 올 수 있는 날 (2026-10-26 Alan)
--   "월수금은 9:30-15:00 & 18-21시 선택가능하고 화목금은 9:30-15:00 까지 만 선택 가능하도록 해줘" — 날을 가르는 법은 Alan 이
--   "반 편성 달력대로" 를 골랐다: 그 날이 월수금 수업일이면 낮 · 저녁, 화목금 수업일이면 낮만. 금요일은 그 주 달력이 정하고,
--   수업이 없는 날(주말 · 공휴일 · 달 사이 빈 날)은 고를 수 없다.
--
--   public.textbook_pickup_days() — 오늘(KST)부터 60일 안의 수업일과 그 날 트랙(mwf | ttf). 시각 목록은 앱이 트랙으로 정한다
--   (src/lib/textbook.ts 의 PICKUP_TIME_RANGES). 60일은 create_textbook_order 의 v_today + 60 과 같다 (바꾸면 셋 다 — 앱 PICKUP_DAYS_AHEAD).
--   반 편성 달력(term_class_dates)은 강사 · 관리자만 읽어서 날짜 · 트랙만 돌려주는 함수로 연다 — homework_due_dates 와 같은 길이다.
--   개인 정보가 없고 누구에게나 같은 달력이라 auth.uid() 로 거르지 않는다. 주문 화면이 날짜를 보여 주고 서버 액션이 같은 함수로 다시 본다
--   (DB 의 주문 함수는 시각을 거르지 않는다 — 시각 · 수업일 검사는 서버 액션이 한다).
--   한 날짜는 한 기수 · 한 트랙에만 속한다(save_term_schedule 이 막는다). 그래도 겹쳐 있으면 월수금으로 본다 — 그 날 저녁 현장 수업이 있다.
-- ============================================================================

create or replace function public.textbook_pickup_days()
returns table (pickup_date date, track text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.date,
         case when bool_or(d.track = 'mwf') then 'mwf' else 'ttf' end
    from public.term_class_dates d
   where d.date between private.today_kst() and private.today_kst() + 60
   group by d.date
   order by d.date;
$$;

comment on function public.textbook_pickup_days() is
  '불라방 교재 현장수령: 오늘(KST)부터 60일 안의 수업일과 트랙(mwf | ttf). 월수금 수업일은 낮 · 저녁, 화목금 수업일은 낮에 받는다 — 시각은 앱이 정한다 (2026-10-26)';

revoke all on function public.textbook_pickup_days() from public, anon;
grant execute on function public.textbook_pickup_days() to authenticated;
