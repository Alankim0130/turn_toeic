-- ============================================================================
-- 특강 = 무슨 특강 하나 + 신청 방식 (2026-10-16 Alan — "지금 특강부분 수정을 다시해야해.
--   1. 모의고사 신청을 클릭하면, 신청방식을 고를 수 있게 해줘. 버튼형식으로 현장 / 시험지수령 / pdf수령 그리고 신청조건을 보여주고,
--      신청하기까지 들어가면 돼. (단, 조건을 이수완료하고 신청하기를 눌러달라는 안내문)
--   2. RC특강과 LC특강도 클릭하면 신청방식을 고를 수 있도록 해줘. 현장 / 수업영상받기 …
--   3. 일정표에는 특강이 표시되도록 하는데, 실제 신청받는곳에서는 전부 안보이도록해줘. 지금은 7일전부터 오픈인데 이 기능을 없애고
--      강사가 직접 '신청받기' 버튼을 누르면 바로 오픈되면서 신청을 받을 수 있도록 바꿔줘.
--   4. … 맨 위에 특강 종류 버튼을 만들어서 … 모의고사를 누르면 아래에 추가적으로 전체, 현장, 시험지수령, pdf수령의 버튼이 또 나오고 …
--   5. 일정표에서 수업일정을 만들때 특강신청에 관한 디테일을 전부다 기입하지말고, 간략하게 … 특강설정은 특강신청에서 다 할 수 있도록
--   6. … 특강설정 버튼을 특강신청에 하나 넣어놓고 해당 버튼을 누르면 종류별로 설정할 수 있도록 해줘.")
--
--  1) 특강 하나(special_lectures) = **무슨 특강**(kinds — rc · lc · mock1 · mock2 중 하나, 비우면 메모만 있는 특강) · 날 · 강사 · 메모 · 안내 · 신청 받기.
--     2026-10-15 ~ 10-16 에는 특강 하나 = 종류 하나(현강 · 녹화영상 · 시험지 수령 · PDF 수령이 따로 특강)였다 —
--     **같은 기수 · 같은 날 · 같은 무슨 특강인 줄을 하나로 합친다** (같은 날 1차 모의고사는 한 시험이다). 강사 · 메모가 달라도 합친다 —
--     나중에 붓으로 더한 줄은 강사 · 메모를 다르게 고른 채 만들어지기도 했다 (10/30 LC특강 현강 '16:00' + 녹화영상 메모 없음).
--     남는 줄은 현장(현강) 줄, 없으면 먼저 만든 줄이고 강사 · 메모는 그 줄의 것(메모가 비었으면 합친 줄의 메모)이다.
--     메모만 있는 특강(무슨 특강 없음)은 메모까지 같은 줄만 합친다.
--  2) 신청 방식(special_lecture_ways) — 특강마다 정해진 방식 줄. RC · LC특강 = 현장(onsite) · 수업영상 받기(video),
--     1 · 2차 모의고사 = 현장 · 시험지 수령(paper) · PDF 수령(pdf), 메모만 있는 특강 = 현장. 앱 LECTURE_WAYS · lectureWaysOf 와 같다 — 바꾸면 둘 다.
--     줄마다 받기(enabled) · 신청 조건(signup_condition) · 정원(capacity) · 신청 수(applied_count). 줄은 트리거가 만든다(무슨 특강이 정해질 때) —
--     강사 · 관리자는 받기 · 조건 · 정원만 고친다 (특강 신청 → 특강 설정).
--  3) 신청(lecture_signups)에 방식(way). **한 학생 한 특강에 한 방식** — 바꾸려면 취소하고 다시 신청한다 (새 신청을 넣을 때 트리거가 막는다).
--     합치기 전에 한 학생이 같은 특강의 두 방식(예: 현강 + 시험지 수령)을 따로 신청해 둔 것은 **지우지 않는다** — unique 는 (특강, 학생, 방식).
--     같은 방식이 겹치면(같은 특강을 두 줄로 만들어 둘 다 신청) 먼저 한 신청만 남긴다.
--  4) 신청이 열리는 때 — **강사가 '신청 받기' 를 누른 특강만**(signup = true), 특강 당일까지. 7일 전 자정 자동 열림(2026-10-02)은 없앤다.
--     지금 실제로 열려 있던 특강(신청 받기 켬 · 열리는 시각이 지남)은 열린 그대로 둔다 — 내일 특강처럼 신청이 들어오고 있는 것을 닫지 않는다.
--     아직 열리기 전이던 특강은 닫힌 채로 둔다 — 강사가 특강 설정을 보고 '신청 받기' 를 누른다.
--  5) 방식 받기 — 열려 있던 특강은 **열려 있던 방식만** 켠다(학생 화면에 갑자기 새 방식이 생기지 않게). 아직 안 열린 특강 · 새 특강은 모든 방식을 켠다.
--     조건 · 정원은 그 방식 줄의 것이고, 줄이 없던 방식은 그 특강 현장 줄(없으면 먼저 만든 줄)의 조건을 따른다 —
--     후기 조건이 걸린 모의고사를 새로 생긴 PDF 수령으로 비껴가지 않게.
--  6) 안내는 특강 하나에 하나 — 합친 줄들의 안내를 방식 순서로 이어 붙인다.
--  7) 정원 · 조건은 이제 방식마다 — special_lectures 의 capacity · signup_opens_at · signup_condition 은 더 쓰지 않는다
--     (배포하는 몇 분 동안 옛 앱이 읽어서 칸은 남긴다. capacity · signup_opens_at 은 비운다).
-- ============================================================================

-- ─── 1. 방식 표 · 신청의 방식 칸 ─────────────────────────────────────────────
-- 무슨 특강 → 신청 방식 (앱 lectureWaysOf 와 같다)
create or replace function private.lecture_ways_of(p_kind text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_kind in ('rc', 'lc') then array['onsite', 'video']
    when p_kind in ('mock1', 'mock2') then array['onsite', 'paper', 'pdf']
    else array['onsite']
  end
$$;
comment on function private.lecture_ways_of(text) is
  '특강의 신청 방식 (2026-10-16) — rc · lc = onsite(현장) · video(수업영상 받기), mock1 · mock2 = onsite · paper(시험지 수령) · pdf(PDF 수령), 메모만 = onsite. 앱 lectureWaysOf 와 같다';
revoke all on function private.lecture_ways_of(text) from public, anon, authenticated;

create table if not exists public.special_lecture_ways (
  lecture_id       bigint not null references public.special_lectures (id) on delete cascade,
  way              text not null,
  enabled          boolean not null default true,
  capacity         int,
  signup_condition text not null default 'none',
  applied_count    int not null default 0,
  primary key (lecture_id, way),
  constraint special_lecture_ways_way_check check (way in ('onsite', 'video', 'paper', 'pdf')),
  constraint special_lecture_ways_condition_check check (signup_condition in ('none', 'review', 'sns')),
  constraint special_lecture_ways_applied_count_check check (applied_count >= 0)
);
comment on table public.special_lecture_ways is
  '특강의 신청 방식 (2026-10-16 Alan — 현장 · 시험지 수령 · PDF 수령 / 현장 · 수업영상 받기). 특강마다 정해진 방식 줄을 트리거(private.sync_lecture_ways)가 만든다. 강사 · 관리자는 받기 · 조건 · 정원만 고친다';
comment on column public.special_lecture_ways.enabled is '이 방식으로 신청을 받나 — 끄면 학생 화면에 버튼이 없다 (이미 들어온 신청은 그대로)';
comment on column public.special_lecture_ways.signup_condition is '이 방식의 신청 조건 — review(YBM 수강후기 작성) · sns(유튜브 구독 · 인스타그램 팔로우) · none. 앱 LECTURE_CONDITIONS 와 같은 값';
comment on column public.special_lecture_ways.capacity is '이 방식의 정원. null 이면 제한 없음. 이미 신청한 수보다 적게 줄일 수 없다';
comment on column public.special_lecture_ways.applied_count is '이 방식의 신청 수 — lecture_signups 트리거가 유지한다 (직접 고치지 않는다)';

alter table public.lecture_signups add column if not exists way text;
comment on column public.lecture_signups.way is
  '신청 방식 (2026-10-16) — onsite(현장) · video(수업영상 받기) · paper(시험지 수령) · pdf(PDF 수령). 그 특강의 special_lecture_ways 줄을 가리킨다';

-- 합치면 한 학생이 한 특강에 방식 둘을 가질 수 있다 (머리말 3) — 옛 unique 는 먼저 푼다
alter table public.lecture_signups drop constraint if exists lecture_signups_lecture_id_user_id_key;

-- ─── 2. 있던 특강을 합친다 ───────────────────────────────────────────────────
-- 한 번만 쓰는 지도 — 줄마다 합칠 특강(event_id — 현장 줄, 없으면 먼저 만든 줄) · 무슨 특강(base) · 방식(way) · 지금 실제로 열려 있었나(open_now)
create or replace function private.tmp_lecture_merge_map()
returns table (
  id bigint, event_id bigint, date date, base text, way text, open_now boolean,
  signup boolean, capacity int, signup_condition text, notice text, content text, way_rank int
)
language sql
stable
set search_path = ''
as $$
  with k as (
    select l.id, l.term_id, l.date, l.content,
           case
             when l.kinds[1] in ('rc', 'rc_video') then 'rc'
             when l.kinds[1] in ('lc', 'lc_video') then 'lc'
             when l.kinds[1] in ('mock1', 'mock1_paper', 'mock1_pdf') then 'mock1'
             when l.kinds[1] in ('mock2', 'mock2_paper', 'mock2_pdf') then 'mock2'
           end as base,
           case
             when l.kinds[1] in ('rc_video', 'lc_video') then 'video'
             when l.kinds[1] in ('mock1_paper', 'mock2_paper') then 'paper'
             when l.kinds[1] in ('mock1_pdf', 'mock2_pdf') then 'pdf'
             else 'onsite'
           end as way,
           -- 2026-10-02 ~ 10-16 의 열림 규칙 그대로 — 신청 받기 켬 + 신청 시작(비우면 7일 전 자정 KST)이 지남
           (l.signup and coalesce(l.signup_opens_at, (l.date - 7)::timestamp at time zone 'Asia/Seoul') <= now()) as open_now,
           l.signup, l.capacity, l.signup_condition, l.notice
      from public.special_lectures l
  ), r as (
    select k.*,
           array_position(array['onsite', 'video', 'paper', 'pdf'], k.way) as way_rank,
           -- 메모만 있는 특강은 메모까지 같아야 같은 특강이다
           case when k.base is null then coalesce(k.content, '') end as memo_key
      from k
  )
  select r.id,
         first_value(r.id) over (partition by r.term_id, r.date, r.base, r.memo_key order by r.way_rank, r.id) as event_id,
         r.date, r.base, r.way, r.open_now, r.signup, r.capacity, r.signup_condition, r.notice, r.content, r.way_rank
    from r
$$;
revoke all on function private.tmp_lecture_merge_map() from public, anon, authenticated;

-- 옮기는 동안 신청 수 트리거를 끈다 — 마지막에 다시 센다
alter table public.lecture_signups disable trigger lecture_signups_sync;

do $$
declare
  e record;
  w text;
  r record;
  v_today date := private.today_kst();
  v_primary text;
  v_enabled boolean;
  v_events int := 0;
  v_dups int := 0;
  v_moved int := 0;
  v_merged int := 0;
begin
  -- 1) 방식 줄 — 특강(합친 뒤 남는 줄)마다
  for e in
    select m.event_id, max(m.base) as base, min(m.date) as date, bool_or(m.open_now) as open_now
      from private.tmp_lecture_merge_map() m
     group by m.event_id
     order by m.event_id
  loop
    -- 줄이 없던 방식이 따를 조건 — 그 특강의 현장 줄, 없으면 먼저 만든 줄
    select m.signup_condition into v_primary
      from private.tmp_lecture_merge_map() m
     where m.event_id = e.event_id
     order by m.way_rank, m.id
     limit 1;

    foreach w in array private.lecture_ways_of(e.base) loop
      select bool_or(m.signup) as any_signup,
             bool_or(m.open_now) as any_open,
             (array_agg(m.capacity order by m.id))[1] as capacity,
             (array_agg(m.signup_condition order by m.id))[1] as condition,
             count(*) as n
        into r
        from private.tmp_lecture_merge_map() m
       where m.event_id = e.event_id and m.way = w;

      v_enabled := case
        when e.date < v_today then coalesce(r.any_signup, false)  -- 지난 특강 — 그때 받았나
        when e.open_now then coalesce(r.any_open, false)         -- 지금 열려 있는 특강 — 열려 있던 방식만
        else true                                                 -- 아직 안 열린 특강 — 모든 방식 (강사가 특강 설정에서 고른다)
      end;

      insert into public.special_lecture_ways (lecture_id, way, enabled, capacity, signup_condition)
      values (
        e.event_id, w, v_enabled,
        case when r.n > 0 then r.capacity end,
        coalesce(case when r.n > 0 then r.condition end, v_primary, 'none')
      );
    end loop;
    v_events := v_events + 1;
  end loop;

  -- 2) 같은 특강 · 같은 방식에 한 학생이 두 번 — 먼저 한 신청만 남긴다
  delete from public.lecture_signups s
   using (
     select s2.id,
            row_number() over (partition by m.event_id, m.way, s2.user_id order by s2.created_at, s2.id) as rn
       from public.lecture_signups s2
       join private.tmp_lecture_merge_map() m on m.id = s2.lecture_id
   ) as x
   where s.id = x.id and x.rn > 1;
  get diagnostics v_dups = row_count;

  -- 3) 신청을 합친 특강 · 방식으로 옮긴다
  update public.lecture_signups s
     set lecture_id = m.event_id,
         way = m.way
    from private.tmp_lecture_merge_map() m
   where m.id = s.lecture_id;
  get diagnostics v_moved = row_count;

  -- 4) 남는 특강 — 열림 · 메모(남는 줄에 없으면 합친 줄의 것) · 안내(합친 줄들의 안내를 방식 순서로) · 쓰지 않는 칸 비우기
  update public.special_lectures l
     set signup           = x.open_now,
         capacity         = null,
         signup_opens_at  = null,
         signup_condition = x.condition,
         content          = coalesce(l.content, x.content),
         notice           = x.notice
    from (
      select m.event_id,
             bool_or(m.open_now) as open_now,
             (array_agg(m.signup_condition order by m.way_rank, m.id))[1] as condition,
             (array_agg(m.content order by m.way_rank, m.id) filter (where m.content is not null))[1] as content,
             (select left(string_agg(n.notice, E'\n\n' order by n.r), 50000)
                from (select m2.notice, min(m2.way_rank * 100000000 + m2.id) as r
                        from private.tmp_lecture_merge_map() m2
                       where m2.event_id = m.event_id and m2.notice is not null and btrim(m2.notice) <> ''
                       group by m2.notice) as n) as notice
        from private.tmp_lecture_merge_map() m
       group by m.event_id
    ) as x
   where l.id = x.event_id;

  -- 5) 합쳐진 줄을 지운다 (신청은 3) 에서 옮겼다)
  delete from public.special_lectures l
   using private.tmp_lecture_merge_map() m
   where m.id = l.id and m.event_id <> m.id;
  get diagnostics v_merged = row_count;

  -- 6) 무슨 특강만 남긴다 (현강 · 녹화영상 · 시험지 · PDF 는 이제 신청 방식이다)
  update public.special_lectures
     set kinds = case
       when kinds[1] in ('rc', 'rc_video') then array['rc']
       when kinds[1] in ('lc', 'lc_video') then array['lc']
       when kinds[1] in ('mock1', 'mock1_paper', 'mock1_pdf') then array['mock1']
       when kinds[1] in ('mock2', 'mock2_paper', 'mock2_pdf') then array['mock2']
       else '{}'::text[]
     end
   where cardinality(kinds) > 0;

  raise notice '특강 합치기: 남은 특강 %개 · 합쳐 지운 줄 %개 · 옮긴 신청 %건 · 겹쳐 지운 신청 %건', v_events, v_merged, v_moved, v_dups;
end;
$$;

drop function private.tmp_lecture_merge_map();

-- 신청 수를 다시 센다 · 정원은 이미 신청한 수보다 적을 수 없다
update public.special_lecture_ways w
   set applied_count = (select count(*) from public.lecture_signups s where s.lecture_id = w.lecture_id and s.way = w.way);
update public.special_lecture_ways
   set capacity = least(greatest(capacity, applied_count), 1000)
 where capacity is not null and capacity < applied_count;
update public.special_lectures l
   set applied_count = (select count(*) from public.lecture_signups s where s.lecture_id = l.id);

alter table public.lecture_signups enable trigger lecture_signups_sync;

-- ─── 3. 제약 ─────────────────────────────────────────────────────────────────
alter table public.special_lecture_ways drop constraint if exists special_lecture_ways_capacity_check;
alter table public.special_lecture_ways
  add constraint special_lecture_ways_capacity_check
  check (capacity is null or (capacity between 1 and 1000 and capacity >= applied_count));

alter table public.special_lectures drop constraint if exists special_lectures_kinds_check;
alter table public.special_lectures
  add constraint special_lectures_kinds_check
  check (cardinality(kinds) <= 1 and kinds <@ array['rc', 'lc', 'mock1', 'mock2']::text[]);
comment on column public.special_lectures.kinds is
  '무슨 특강 — 하나 (2026-10-16): rc(RC특강) · lc(LC특강) · mock1(1차 모의고사) · mock2(2차 모의고사). 비우면 메모(content)만 있는 특강. 신청 방식은 special_lecture_ways. src/lib/utils.ts 의 LECTURE_KINDS 와 같은 값';
comment on column public.special_lectures.signup is
  '신청 받는 중 (2026-10-16) — 강사가 특강 신청 화면에서 ''신청 받기'' 를 누르면 켜지고 그 순간부터 특강 당일까지 받는다. 7일 전 자동 열림은 없다';
comment on column public.special_lectures.capacity is '쓰지 않음 (2026-10-16 부터 정원은 신청 방식마다 — special_lecture_ways.capacity)';
comment on column public.special_lectures.signup_opens_at is '쓰지 않음 (2026-10-16 — 신청은 강사가 ''신청 받기'' 를 누를 때 열린다)';
comment on column public.special_lectures.signup_condition is '쓰지 않음 (2026-10-16 부터 신청 조건은 신청 방식마다 — special_lecture_ways.signup_condition)';
comment on column public.special_lectures.applied_count is '신청 수 합계 (모든 방식) — lecture_signups 트리거가 유지한다';

alter table public.lecture_signups alter column way set not null;
alter table public.lecture_signups drop constraint if exists lecture_signups_way_fkey;
alter table public.lecture_signups
  add constraint lecture_signups_way_fkey
  foreign key (lecture_id, way) references public.special_lecture_ways (lecture_id, way);
alter table public.lecture_signups drop constraint if exists lecture_signups_lecture_user_way_key;
alter table public.lecture_signups
  add constraint lecture_signups_lecture_user_way_key unique (lecture_id, user_id, way);
comment on table public.lecture_signups is
  '특강 신청 — 한 학생 한 특강에 한 방식(새 신청은 트리거 lecture_signups_check_way 가 막는다). 2026-10-16 전에 방식 둘을 따로 신청한 것은 남아 있다';

-- ─── 4. 함수 ─────────────────────────────────────────────────────────────────
-- 무슨 특강 정리 — 중복을 없애고 정한 순서로 (save_term_schedule 이 쓴다)
create or replace function private.lecture_kinds(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_agg(x.k order by array_position(array['rc', 'lc', 'mock1', 'mock2'], x.k)),
    '{}')
  from (select distinct jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) as k) as x
$$;
grant execute on function private.lecture_kinds(jsonb) to authenticated, service_role;

-- 무슨 특강의 과목 — RC특강 = rc, LC특강 = lc, 모의고사 = 없음 (현장 · 수업영상 받기 모두 그 과목이다). 앱 lectureKindSubject 와 같다
create or replace function private.lecture_kind_subject(p_kind text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_kind = 'rc' then 'rc'
    when p_kind = 'lc' then 'lc'
  end
$$;
comment on function private.lecture_kind_subject(text) is
  '무슨 특강의 과목 — rc = rc, lc = lc, 모의고사는 null (2026-10-16 — 신청 방식과 상관없이 그 과목). 앱 lectureKindSubject 와 같은 규칙';
revoke all on function private.lecture_kind_subject(text) from public, anon, authenticated;

-- 신청 받는 중인가 — **강사가 '신청 받기' 를 눌렀고**(signup) 특강 당일까지, 그 달 수강 중인 학생 (7일 전 자동 열림은 없앴다).
-- 본인 취소도 이 규칙이다. 앱 lectureState 와 같다
create or replace function private.lecture_signup_open(p_lecture_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.special_lectures l
    where l.id = p_lecture_id
      and l.signup
      and private.today_kst() <= l.date
      and private.is_term_enrollee(l.term_id)
  )
$$;
comment on function private.lecture_signup_open(bigint) is
  '신청 받는 중인가 (2026-10-16) — 강사가 ''신청 받기'' 를 누른 특강(signup)을 특강 당일까지, 그 달 수강 중인 학생만. 7일 전 자동 열림은 없다. 앱 lectureState 와 같은 규칙';
grant execute on function private.lecture_signup_open(bigint) to authenticated, service_role;

-- 이 방식으로 신청할 수 있나 — 신청 받는 중 + 그 방식을 받는다. 정원은 신청 수 트리거가 본다
create or replace function private.lecture_way_open(p_lecture_id bigint, p_way text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.lecture_signup_open(p_lecture_id)
     and exists (
       select 1 from public.special_lecture_ways w
        where w.lecture_id = p_lecture_id and w.way = p_way and w.enabled
     )
$$;
comment on function private.lecture_way_open(bigint, text) is
  '이 방식으로 신청할 수 있나 (2026-10-16) — lecture_signup_open + 그 방식을 받는다(enabled). 정원은 lecture_signups_sync 가 본다';
grant execute on function private.lecture_way_open(bigint, text) to authenticated, service_role;

-- 신청 수 · 정원 — 방식마다. applied_count 를 조건부로 올려서 마지막 한 자리에 동시에 신청해도 넘지 않는다
create or replace function private.lecture_signups_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.special_lecture_ways
       set applied_count = greatest(applied_count - 1, 0)
     where lecture_id = old.lecture_id and way = old.way;
    update public.special_lectures
       set applied_count = greatest(applied_count - 1, 0)
     where id = old.lecture_id;
    return old;
  end if;

  update public.special_lecture_ways
     set applied_count = applied_count + 1
   where lecture_id = new.lecture_id
     and way = new.way
     and (capacity is null or applied_count < capacity);
  if not found then
    raise exception 'lecture_full' using errcode = 'P0001', detail = '이 신청 방식은 정원이 찼습니다.';
  end if;
  update public.special_lectures
     set applied_count = applied_count + 1
   where id = new.lecture_id;
  return new;
end;
$$;
revoke execute on function private.lecture_signups_sync() from public, anon, authenticated;

-- 신청을 넣을 때 맨 먼저 — 방식이 비었으면(배포 사이 옛 앱) 그 특강의 첫 받는 방식으로, 그리고 **한 학생 한 특강에 한 방식**.
-- 이름이 c 로 시작해 과목(e) · 조건(r) 검사보다 먼저 돈다 (BEFORE 트리거는 이름 순이다). 본인 줄만 본다 — 남이 신청했는지 엿보는 길이 되지 않게
create or replace function private.lecture_signups_check_way()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.way is null then
    select w.way into new.way
      from public.special_lecture_ways w
     where w.lecture_id = new.lecture_id and w.enabled
     order by array_position(array['onsite', 'video', 'paper', 'pdf'], w.way)
     limit 1;
  end if;

  if new.user_id = (select auth.uid()) then
    -- 닫힌 특강 · 받지 않는 방식이면 조건(후기 · 팔로우)을 묻기 전에 그렇다고 말한다 — 정책(lecture_way_open)이 한 번 더 막는다
    if not private.lecture_way_open(new.lecture_id, new.way) then
      raise exception 'lecture_signup_closed'
        using errcode = 'P0001', detail = '지금은 이 방식으로 신청을 받지 않습니다.';
    end if;
    -- 같은 학생이 두 방식을 동시에 눌러도 하나만 — 학생 · 특강마다 줄을 세운다
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lecture_signup:' || new.lecture_id || ':' || new.user_id, 0));
    if exists (select 1 from public.lecture_signups s where s.lecture_id = new.lecture_id and s.user_id = new.user_id) then
      raise exception 'lecture_already_signed'
        using errcode = 'P0001', detail = '이미 신청한 특강입니다. 방식을 바꾸려면 신청을 취소하고 다시 신청해 주세요.';
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function private.lecture_signups_check_way() from public, anon, authenticated;
drop trigger if exists lecture_signups_check_way on public.lecture_signups;
create trigger lecture_signups_check_way
  before insert on public.lecture_signups
  for each row execute function private.lecture_signups_check_way();

-- 신청을 넣을 때 — 그 **방식의** 신청 조건 (후기 링크 · 유튜브 구독 · 인스타그램 팔로우)
create or replace function private.lecture_signups_review_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_condition text;
  v_key text;
begin
  select w.signup_condition into v_condition
    from public.special_lecture_ways w
   where w.lecture_id = new.lecture_id and w.way = new.way;

  -- 조건이 아닌 칸은 저장하지 않는다 — 다른 방식에 딸려 온 값을 남기지 않는다
  if v_condition is distinct from 'review' then
    new.review_url := null;
  end if;
  if v_condition is distinct from 'sns' then
    new.sns_follow := null;
  end if;

  if v_condition = 'sns' then
    if new.sns_follow is null then
      raise exception 'sns_follow_required'
        using errcode = 'P0001', detail = '이 신청 방식은 역전토익 유튜브 구독 · 인스타그램 팔로우를 하고 신청할 수 있습니다.';
    end if;
    return new;
  end if;

  if v_condition is distinct from 'review' then
    return new;
  end if;

  if new.review_url is null then
    raise exception 'review_link_required'
      using errcode = 'P0001', detail = '이 신청 방식은 YBM 수강후기 링크를 올려야 신청할 수 있습니다.';
  end if;

  v_key := private.review_link_key(new.review_url);
  if v_key is null then
    return new; -- 링크의 꼴은 표의 check 제약(20261008110000)이 본다
  end if;

  -- 같은 링크로 동시에 둘이 신청해도 하나만 — 링크마다 줄을 세운다. 앞 사람이 끝난 뒤 아래 조회가 그 줄을 본다
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lecture_review_link:' || v_key, 0));

  if exists (
    select 1
      from public.lecture_signups s
     where s.review_url is not null
       and s.user_id <> new.user_id
       and private.review_link_key(s.review_url) = v_key
  ) then
    raise exception 'review_link_taken'
      using errcode = 'P0001', detail = '다른 학생이 이미 특강 신청에 쓴 YBM 수강후기 링크입니다.';
  end if;

  if exists (
    select 1
      from public.lecture_signups s
      join public.special_lectures l on l.id = s.lecture_id
      join public.special_lectures n on n.id = new.lecture_id
     where s.review_url is not null
       and s.user_id = new.user_id
       and l.term_id <> n.term_id
       and private.review_link_key(s.review_url) = v_key
  ) then
    raise exception 'review_link_reused'
      using errcode = 'P0001', detail = '다른 달 특강 신청에 쓴 YBM 수강후기 링크입니다. 그 달 후기를 새로 써야 합니다.';
  end if;

  return new;
end;
$$;
revoke execute on function private.lecture_signups_review_check() from public, anon, authenticated;
comment on function private.lecture_signups_review_check() is
  '특강 신청을 넣을 때 그 신청 방식의 조건을 본다 (2026-10-16 — 방식마다) — review: YBM 수강후기 링크(없으면 review_link_required · 다른 학생 링크 review_link_taken · 다른 달에 쓴 내 링크 review_link_reused) · sns: 인스타그램 팔로우(없으면 sns_follow_required). 조건이 아닌 칸은 비운다';

-- 무슨 특강이 정해지거나 바뀌면 신청 방식 줄을 맞춘다. 신청자가 있으면 무슨 특강을 바꾸지 못한다 (학생은 그 특강을 신청한 것이다)
create or replace function private.sync_lecture_ways()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ways text[] := private.lecture_ways_of(new.kinds[1]);
begin
  if tg_op = 'UPDATE' then
    if old.kinds is not distinct from new.kinds then
      return new;
    end if;
    if exists (select 1 from public.lecture_signups s where s.lecture_id = new.id) then
      raise exception 'lecture_kind_signup_block'
        using errcode = 'P0001', detail = to_char(new.date, 'YYYY-MM-DD');
    end if;
  end if;

  delete from public.special_lecture_ways w
   where w.lecture_id = new.id and not (w.way = any (v_ways));
  insert into public.special_lecture_ways (lecture_id, way)
  select new.id, x.way from unnest(v_ways) as x(way)
  on conflict (lecture_id, way) do nothing;
  return new;
end;
$$;
revoke execute on function private.sync_lecture_ways() from public, anon, authenticated;
comment on function private.sync_lecture_ways() is
  '특강의 신청 방식 줄을 맞춘다 (2026-10-16) — 만들 때 · 무슨 특강이 바뀔 때. 새 방식은 받기 켬 · 조건 없음 · 정원 없음. 신청자가 있는 특강의 종류를 바꾸면 lecture_kind_signup_block';
drop trigger if exists special_lectures_sync_ways on public.special_lectures;
create trigger special_lectures_sync_ways
  after insert or update of kinds on public.special_lectures
  for each row execute function private.sync_lecture_ways();

-- ─── 5. 권한 ─────────────────────────────────────────────────────────────────
alter table public.special_lecture_ways enable row level security;
grant all on public.special_lecture_ways to service_role;
grant select on public.special_lecture_ways to authenticated;
-- 강사 · 관리자가 특강 설정에서 고친다 — 줄을 넣고 지우는 것은 트리거(sync_lecture_ways)뿐이다
grant update (enabled, capacity, signup_condition) on public.special_lecture_ways to authenticated;

-- 특강이 보이는 사람에게 그 방식도 보인다 (special_lectures 조회 정책 — 스태프 · 그 달 반에 배정된 학생). 스태프 확인을 앞에 둔다 (화면 전환 속도 4)
drop policy if exists "special_lecture_ways: 특강이 보이는 사람 조회" on public.special_lecture_ways;
create policy "special_lecture_ways: 특강이 보이는 사람 조회" on public.special_lecture_ways
  for select to authenticated
  using (
    (select private.is_staff())
    or exists (select 1 from public.special_lectures l where l.id = special_lecture_ways.lecture_id)
  );

drop policy if exists "special_lecture_ways: 스태프 수정" on public.special_lecture_ways;
create policy "special_lecture_ways: 스태프 수정" on public.special_lecture_ways
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- 학생은 방식을 골라 신청한다 — 그 방식을 받을 때만
grant insert (way) on public.lecture_signups to authenticated;
drop policy if exists "lecture_signups: 수강생 신청" on public.lecture_signups;
create policy "lecture_signups: 수강생 신청" on public.lecture_signups
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select private.lecture_way_open(lecture_signups.lecture_id, lecture_signups.way))
  );

-- ─── 6. 반 편성 달력 저장 — 무슨 특강 · 강사 · 메모만 (신청 설정은 특강 신청에서) ─────
create or replace function public.save_term_schedule(
  p_year      int,
  p_month     int,
  p_opens     date,
  p_closes    date,
  p_mwf       date[],
  p_ttf       date[],
  p_lectures  jsonb,
  p_parts     text[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_term_id     bigint;
  v_first       date;
  v_last        date;
  v_from        date;
  v_to          date;
  v_mwf         date[] := coalesce(p_mwf, '{}');
  v_ttf         date[] := coalesce(p_ttf, '{}');
  v_lectures    jsonb  := coalesce(p_lectures, '[]'::jsonb);
  v_parts       text[] := coalesce(p_parts, array['dates', 'mwf', 'ttf', 'lectures']);
  v_do_dates    boolean;
  v_do_mwf      boolean;
  v_do_ttf      boolean;
  v_do_lectures boolean;
  v_bad         text;
  v_sections    int;
  v_keep        bigint[];
begin
  if not (select private.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_year is null or p_month is null or p_year not between 2020 and 2100 or p_month not between 1 and 12 then
    raise exception 'invalid_term' using errcode = '22023';
  end if;

  -- ─── 저장할 항목 고르기 ──────────────────────────────────────────────────
  if 'all' = any(v_parts) then
    v_parts := array['dates', 'mwf', 'ttf', 'lectures'];
  end if;
  if exists (select 1 from unnest(v_parts) as p where p is null or p not in ('dates', 'mwf', 'ttf', 'lectures')) then
    raise exception 'invalid_parts' using errcode = '22023';
  end if;
  v_do_dates    := 'dates'    = any(v_parts);
  v_do_mwf      := 'mwf'      = any(v_parts);
  v_do_ttf      := 'ttf'      = any(v_parts);
  v_do_lectures := 'lectures' = any(v_parts);
  if not (v_do_dates or v_do_mwf or v_do_ttf or v_do_lectures) then
    raise exception 'invalid_parts' using errcode = '22023';
  end if;

  if v_do_dates then
    if p_opens is null or p_closes is null then
      raise exception 'dates_required' using errcode = '22023';
    end if;
    if p_closes < p_opens then
      raise exception 'closes_before_opens' using errcode = '22023';
    end if;
  end if;

  -- 수업일·특강을 찍을 수 있는 범위: 지난달 1일 ~ 다음달 말일
  v_first := make_date(p_year, p_month, 1);
  v_last  := (v_first + interval '1 month')::date - 1;
  v_from  := (v_first - interval '1 month')::date;
  v_to    := (v_first + interval '2 months')::date - 1;

  -- ─── 수업일 ──────────────────────────────────────────────────────────────
  if v_do_mwf and exists (select 1 from unnest(v_mwf) as d where d is null or d < v_from or d > v_to) then
    raise exception 'class_date_out_of_range' using errcode = '22023';
  end if;
  if v_do_ttf and exists (select 1 from unnest(v_ttf) as d where d is null or d < v_from or d > v_to) then
    raise exception 'class_date_out_of_range' using errcode = '22023';
  end if;
  if v_do_mwf and v_do_ttf then
    select string_agg(to_char(x.d, 'YYYY-MM-DD'), ',' order by x.d) into v_bad
    from (select unnest(v_mwf) as d intersect select unnest(v_ttf)) as x;
    if v_bad is not null then
      raise exception 'track_overlap' using errcode = '22023', detail = v_bad;
    end if;
  end if;

  -- ─── 특강 검증 — 무슨 특강(넷 중 하나 또는 없음) · 메모(1~100자) ─────────────
  if v_do_lectures then
    if jsonb_typeof(v_lectures) <> 'array' or jsonb_array_length(v_lectures) > 100 then
      raise exception 'invalid_lectures' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_lectures) as e
      where jsonb_typeof(e) <> 'object'
         or e ->> 'date' is null
         or e ->> 'lecturer_id' is null
         or (e ->> 'date')::date not between v_from and v_to
         or (e -> 'kinds' is not null and jsonb_typeof(e -> 'kinds') <> 'array')
         -- 특강 하나 = 무슨 특강 하나 (2026-10-16 — 현장 · 수업영상 · 시험지 · PDF 는 신청 방식이다)
         or coalesce(jsonb_array_length(e -> 'kinds'), 0) > 1
         or exists (
              select 1 from jsonb_array_elements_text(coalesce(e -> 'kinds', '[]'::jsonb)) as k
              where k not in ('rc', 'lc', 'mock1', 'mock2')
            )
         or (coalesce(jsonb_array_length(e -> 'kinds'), 0) = 0
             and char_length(btrim(coalesce(e ->> 'content', ''))) = 0)
         or char_length(btrim(coalesce(e ->> 'content', ''))) > 100
    ) then
      raise exception 'invalid_lectures' using errcode = '22023';
    end if;
  end if;

  -- ─── 기수 행 ─────────────────────────────────────────────────────────────
  insert into public.terms (year, month) values (p_year, p_month)
  on conflict (year, month) do nothing;
  select t.id into v_term_id from public.terms t where t.year = p_year and t.month = p_month;

  -- ─── 월(기수) 구분: 같은 날짜를 다른 기수가 이미 수업일로 쓰면 거부 ─────
  select string_agg(distinct to_char(d.date, 'YYYY-MM-DD') || '@' || t.year || '-' || lpad(t.month::text, 2, '0'), ',')
    into v_bad
  from public.term_class_dates d
  join public.terms t on t.id = d.term_id
  where d.term_id <> v_term_id
    and d.date = any(
      case
        when v_do_mwf and v_do_ttf then v_mwf || v_ttf
        when v_do_mwf then v_mwf
        when v_do_ttf then v_ttf
        else '{}'::date[]
      end
    );
  if v_bad is not null then
    raise exception 'date_in_other_term' using errcode = '22023', detail = v_bad;
  end if;

  if v_do_dates then
    update public.terms
    set enrollment_opens_at = p_opens,
        closes_at = p_closes
    where id = v_term_id;
  end if;

  -- ─── 수업일: 저장하는 트랙만 갈아 끼운다 ────────────────────────────────
  if v_do_mwf then
    delete from public.term_class_dates
    where term_id = v_term_id and (track = 'mwf' or date = any(v_mwf));
  end if;
  if v_do_ttf then
    delete from public.term_class_dates
    where term_id = v_term_id and (track = 'ttf' or date = any(v_ttf));
  end if;
  if v_do_mwf then
    insert into public.term_class_dates (term_id, date, track)
    select v_term_id, m.d, 'mwf' from (select distinct unnest(v_mwf) as d) as m;
  end if;
  if v_do_ttf then
    insert into public.term_class_dates (term_id, date, track)
    select v_term_id, t.d, 'ttf' from (select distinct unnest(v_ttf) as d) as t;
  end if;

  -- ─── 특강: id 로 유지 (수정 / 추가 / 빠진 것 삭제) ──────────────────────
  if v_do_lectures then
    select coalesce(array_agg((e ->> 'id')::bigint), '{}')
      into v_keep
    from jsonb_array_elements(v_lectures) as e
    where e ->> 'id' is not null;

    -- 넘겨받은 id 가 이 기수 특강이 맞는지 (남의 기수 특강을 건드리지 못하게)
    if exists (
      select 1 from unnest(v_keep) as k
      where not exists (select 1 from public.special_lectures l where l.id = k and l.term_id = v_term_id)
    ) then
      raise exception 'invalid_lectures' using errcode = '22023';
    end if;

    -- 빠지는 특강에 신청자가 있으면 저장 전체를 되돌린다
    select string_agg(to_char(l.date, 'YYYY-MM-DD'), ',' order by l.date)
      into v_bad
    from public.special_lectures l
    where l.term_id = v_term_id
      and not (l.id = any(v_keep))
      and exists (select 1 from public.lecture_signups g where g.lecture_id = l.id);
    if v_bad is not null then
      raise exception 'lecture_signup_block' using errcode = 'P0001', detail = v_bad;
    end if;

    delete from public.special_lectures l
    where l.term_id = v_term_id and not (l.id = any(v_keep));

    -- 수정 — 날 · 강사 · 메모 · 무슨 특강만. 신청 받기 · 신청 방식 · 조건 · 정원 · 안내는 특강 신청 화면에서 정하고 여기서 건드리지 않는다.
    -- 무슨 특강이 바뀌면 트리거(special_lectures_sync_ways)가 신청 방식 줄을 맞춘다 — 신청자가 있으면 lecture_kind_signup_block
    update public.special_lectures l
    set date        = (e.v ->> 'date')::date,
        lecturer_id = (e.v ->> 'lecturer_id')::bigint,
        content     = nullif(btrim(coalesce(e.v ->> 'content', '')), ''),
        kinds       = private.lecture_kinds(e.v -> 'kinds')
    from jsonb_array_elements(v_lectures) as e(v)
    where e.v ->> 'id' is not null and l.id = (e.v ->> 'id')::bigint and l.term_id = v_term_id;

    -- 추가 — 신청은 닫힌 채로 시작한다 (강사가 특강 신청에서 '신청 받기' 를 누른다). 신청 방식 줄은 트리거가 만든다
    insert into public.special_lectures (term_id, date, lecturer_id, content, kinds)
    select
      v_term_id,
      (e.v ->> 'date')::date,
      (e.v ->> 'lecturer_id')::bigint,
      nullif(btrim(coalesce(e.v ->> 'content', '')), ''),
      private.lecture_kinds(e.v -> 'kinds')
    from jsonb_array_elements(v_lectures) with ordinality as e(v, ord)
    where e.v ->> 'id' is null
    order by e.ord;
  end if;

  v_sections := private.sync_term_sections(v_term_id);

  return jsonb_build_object(
    'term_id',  v_term_id,
    'parts',    to_jsonb(v_parts),
    'mwf',      (select count(*) from public.term_class_dates where term_id = v_term_id and track = 'mwf'),
    'ttf',      (select count(*) from public.term_class_dates where term_id = v_term_id and track = 'ttf'),
    'lectures', (select count(*) from public.special_lectures where term_id = v_term_id),
    'sections', v_sections
  );
end;
$$;

comment on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) is
  '반 편성 달력 저장. p_parts 로 항목만 고른다. 수업일·특강은 그 달 ±1개월, 수업일은 다른 기수와 겹칠 수 없다. 특강은 id 로 유지되고(신청자가 있으면 삭제 거부) 무슨 특강(kinds — rc · lc · mock1 · mock2 중 하나, 2026-10-16) · 강사 · 메모만 받는다. 신청 받기 · 신청 방식 · 조건 · 정원 · 안내는 특강 신청 화면에서 정한다';

revoke all on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) from public, anon;
grant execute on function public.save_term_schedule(int, int, date, date, date[], date[], jsonb, text[]) to authenticated, service_role;
