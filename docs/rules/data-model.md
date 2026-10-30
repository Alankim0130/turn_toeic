<!-- CLAUDE.md 에서 옮긴 원문 (2026-10-30, 원래 4414~4987줄). 꼭 지킬 규칙의 요약은 CLAUDE.md — 여기는 경위 · 세부 · 확인 기록이다. -->
<!-- 데이터 모델 (표 · 칸 · 주요 DB 함수) -->

## 데이터 모델

```sql
create type user_role as enum
  ('guest','member','student','alumni','instructor','assistant','admin');
-- assistant(조교) 는 마이그레이션 20260916230000 에서 더했다. Postgres 는 새 enum 값을
-- **추가한 트랜잭션 안에서 쓸 수 없어서**(55P04) 값 추가는 그 파일 하나에 혼자 두고,
-- 실제로 쓰는 정책·함수는 20260916240000 에 뒀다. enum 값을 더할 때마다 이렇게 파일을 나눈다.

-- 가입하면 그 등급으로 시작하는 이름 (마이그레이션 20260916250000). 강사 이혜영·이영수 전용.
-- private 스키마 = 앱에서 못 읽는다. 한 번 쓰면 claimed_by 가 박혀 두 번째 가입자는 평범한 회원이다
create table private.reserved_staff (
  name       text primary key,
  role       user_role not null,
  subject    text,                       -- lc | rc. 가입할 때 profiles.subject 로 함께 들어간다
  claimed_by uuid references auth.users on delete set null,
  claimed_at timestamptz
);

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null,              -- 실명. 수강증 대조에 사용
  phone       text,
  role        user_role not null default 'member',
  subject     text,                       -- 강사의 담당 과목 lc | rc (20260916260000). 이혜영 lc · 이영수 rc.
                                          -- 강사가 아니면 null. authenticated 에 update 권한 없음
  university  text,                       -- 마케팅 분석용 (가입 시 입력)
  department  text,
  gender      text,                       -- male | female | other | undisclosed
  created_at  timestamptz default now()
);

create table terms (                       -- 기수 = 월
  id serial primary key,
  year int not null,
  month int not null,
  enrollment_opens_at date,                -- 그 달 개강일 (반 편성 달력). 그 달 모든 반에 복사
  closes_at           date,                -- 그 달 종강일
  unique(year, month)
);

-- ─── 반 편성 달력 (마이그레이션 20260915111851) ───
create table term_class_dates (            -- 기수 수업일. 진실의 원천
  term_id  bigint references terms on delete cascade,
  date     date not null,                  -- 그 달 ± 1개월. 강의가 다음 달까지 이어질 수 있다
  track    text not null,                  -- mwf | ttf. 한 날짜는 한 트랙만
  primary key (term_id, date)
);

create table lecturers (                   -- 특강 강사 선택지 (이혜영·이영수). 계정과 별개, 행 추가로 늘어난다
  id bigint primary key, name text unique not null, sort_order int default 0
);

create table special_lectures (            -- 특강. 수업일과 겹쳐도 되고 하루 여러 개 가능
  id          bigint primary key,
  term_id     bigint references terms on delete cascade,
  date        date not null,
  lecturer_id bigint references lecturers,
  kinds       text[] not null default '{}', -- 무슨 특강 하나(cardinality ≤ 1, 20261016120000): rc | lc | mock1 | mock2, 비우면 메모만 (LECTURE_KINDS).
                                            -- 2026-10-15 ~ 10-16 의 rc_video · mock1_paper · mock1_pdf … 는 신청 방식(special_lecture_ways)이 됐다
  notice      text,                         -- 강사 안내 (수업자료실 안내와 같은 서식 글, 5만 자) — 학생 특강 카드에 그대로
  content     text,                         -- 메모 (선택, 1~100자). 종류나 내용 중 하나는 있어야 한다
  signup          boolean not null default false,  -- 신청 받는 중 — 강사가 '신청 받기' 를 누르면 켜진다 (2026-10-16 — 7일 전 자동 열림 없음). 특강 당일까지 받는다
  applied_count   int not null default 0,          -- 신청 수 합계 (모든 방식) — lecture_signups 트리거가 유지
  -- 쓰지 않음 (2026-10-16, 배포 사이 옛 앱만): capacity · signup_opens_at · signup_condition — 정원 · 조건은 방식마다(special_lecture_ways)
);

create table special_lecture_ways (        -- 특강의 신청 방식 (20261016120000). 줄은 트리거 private.sync_lecture_ways 가 만든다 (무슨 특강이 정해질 때)
  lecture_id       bigint references special_lectures on delete cascade,
  way              text not null,           -- onsite(현장) | video(수업영상 받기) | paper(시험지 수령) | pdf(PDF 수령) — rc · lc = onsite · video, 모의고사 = onsite · paper · pdf, 메모만 = onsite
  enabled          boolean not null default true,  -- 이 방식으로 받나 (끄면 학생 화면에 버튼이 없다)
  capacity         int,                     -- 이 방식의 정원. null = 제한 없음. 1~1000 · 신청 수 이상 (check)
  signup_condition text not null default 'none', -- none | review(YBM 수강후기) | sns(유튜브 구독 · 인스타 팔로우) — 방식마다 강사가 고른다
  applied_count    int not null default 0,  -- 이 방식의 신청 수 — lecture_signups_sync 가 조건부로 올린다 (정원)
  primary key (lecture_id, way)
);
-- 조회: 스태프 또는 그 특강이 보이는 사람. 수정: 강사 · 관리자, 칸 단위 grant (enabled, capacity, signup_condition). 넣고 지우기는 트리거뿐
-- private.lecture_ways_of(무슨 특강) = 앱 lectureWaysOf · private.lecture_signup_open(특강) = 신청 받기 · 당일까지 · 그 달 수강생 · private.lecture_way_open(특강, 방식) = 그것 + 그 방식을 받나
--   + private.lecture_in_my_term(특강) = 그 달 지금 수강 중인 내 반의 종강일이 특강 날 이후 (20261022110000 — 2주완성의 뒤 절반 특강을 막는다. 취소는 lecture_signup_open 그대로)
-- 트리거 special_lectures_sync_ways (AFTER INSERT / UPDATE OF kinds) — 방식 줄을 맞추고, 신청자가 있는데 무슨 특강을 바꾸면 lecture_kind_signup_block

create table account_merge_requests (      -- 계정 통합 신청 (마이그레이션 20260918110000)
  id           bigint primary key,
  from_user    uuid references profiles,   -- 비워질 계정
  to_user      uuid references profiles,   -- 남길 계정 (학생이 고른다)
  requested_by uuid references profiles,   -- 신청한 계정. **확인은 반대쪽이 한다** (본인 확인)
  status       text default 'pending',     -- pending | done | cancelled
  moved        jsonb,                      -- 옮긴 행 수 (숙제·스터디·특강 …)
  created_at timestamptz, decided_at timestamptz
);
-- public.student_auth_info(ids) : 학생명단용 계정 정보 (이메일·로그인 방식·마지막 접속). auth 스키마를 스태프에게만 연다 (20260918170000)
--   마지막 접속(last_sign_in_at 칸)은 20261012130000 부터 private.last_active_at(계정) — 로그인 · 세션 갱신 · 토큰 갱신 중 가장 늦은 때. 합치기 후보 함수 셋도 같다. 내 것은 public.my_last_active_at()
-- public.profile_names(ids) : 강사·관리자·조교 화면의 사람 이름 — **이름 · 등급만** (20261003110000). profiles 조회는 본인·강사·관리자뿐이라 조교는 이걸로 읽는다.
--   같은 파일: public.subject_instructors() (숙제점검 과목 탭의 강사 이름) · public.verification_twins(수강증) (같은 수강증을 올린 다른 계정이 같은 사람인지만 — 번호는 안 준다)
-- profiles.identity_confirmed_at : 수강증 인증 뒤 이름·전화번호를 확인한 시각
-- profiles.merged_into           : 통합되어 비워진 계정 → 남은 계정. null 이 아니면 로그인을 막는다 (기록은 보존)
-- 함수: public.confirm_identity(name, phone) · public.merge_candidates() · public.request_account_merge(other, keep)
--       public.confirm_account_merge(request) → private.merge_accounts(from, to) · public.cancel_account_merge(request)

create table lecture_signups (             -- 특강 신청. 새 신청은 한 특강에 한 방식 (트리거 lecture_signups_check_way — lecture_already_signed)
  id         bigint primary key,
  lecture_id bigint references special_lectures,   -- 신청자가 있는 특강은 삭제 불가
  user_id    uuid references profiles on delete cascade,
  created_at timestamptz default now(),
  review_url text,                                 -- YBM 수강후기 링크 (20261008100000 · 20261008110000) — 조건이 review 인 특강만, https://www.ybmedu.com/mypage/lessonView/<토큰> 꼴 · 2,000자
  sns_follow text,                                 -- 인스타그램 new(새로) | existing(기존) — 조건이 sns 인 방식만 (20261015130000). 유튜브 구독 체크는 남기지 않는다
  way        text not null,                        -- 신청 방식 (20261016120000) — (lecture_id, way) → special_lecture_ways. 학생은 way · sns_follow · review_url 칸만 넣는다
  staff_test boolean not null default false,       -- 강사 · 관리자(진짜 등급) 시험 신청 (20261016130000) — 신청 수 · 정원에 세지 않는다. 신청할 때 lecture_signups_check_way 가 정한다
  unique(lecture_id, user_id, way)                 -- 2026-10-16 전에 방식 둘을 따로 신청해 둔 것은 남아 있다
);
-- (private.lecture_needs_review — 2026-10-08 ~ 10-15 의 '3주차 모의고사' 판정. 20261015130000 이 지웠다 — 이제 방식마다 special_lecture_ways.signup_condition)
-- BEFORE INSERT 트리거는 이름 순: lecture_signups_check_way(시험 신청 표시 · 방식 채우기 · 닫힘 lecture_signup_closed · 한 특강 한 방식) → lecture_signups_eligible_subject(단과) → lecture_signups_review_check
-- private.lecture_signups_review_check (BEFORE INSERT) : 그 방식의 조건으로 review 면 링크 필수(review_link_required) · 한 번만(taken · reused — 시험 신청 줄은 보지 않는다), sns 면 sns_follow 필수(sns_follow_required), 아니면 두 칸을 비운다
-- private.lecture_signups_sync (AFTER INSERT · DELETE) : 그 방식의 applied_count 를 정원 안에서만 올린다(lecture_full) · 특강 합계도 — 시험 신청(staff_test)은 올리지도 내리지도 않는다 (20261016130000)
-- private.lecture_kind_subject(종류) : rc → rc, lc → lc, 모의고사 → null (단과 과목 막기가 쓴다 — 방식과 상관없이)
-- private.review_link_key(주소) : 후기 키 = lessonView 뒤 토큰(소문자 · 끝 = 뗌). 같은 트리거가 다른 학생의 링크(review_link_taken) · 다른 달에 쓴 내 링크(review_link_reused)를 막는다 (20261008130000)
-- private.lecture_subjects_of(학생, 기수) : 그 달 수강 중인 직접 배정 반이 주는 과목 lc · rc (단과 상품 = 그 과목 · 그릇 반 · 과목 칸 없음 = 두 과목). BEFORE INSERT 트리거
--   lecture_signups_eligible_subject 가 특강 종류의 rc · lc 마다 그 과목을 듣는지 보고 lecture_subject_mismatch 로 막는다 — RC 단과는 LC특강 못 함 (20261012110000, 규칙 6-1)
-- 그 달 수강생도 조회할 수 있다 (private.is_term_enrollee) — 내 시간표에 함께 표시된다
-- 저장: public.save_term_schedule(year, month, opens, closes, mwf[], ttf[], lectures jsonb, parts text[])
--       — 스태프만, 한 트랜잭션. parts 는 'dates'|'mwf'|'ttf'|'lectures' 중 저장할 항목 (null 이면 전부).
--       수업일·특강은 그 달 ±1개월까지 허용하고, 수업일이 다른 기수와 겹치면 거부한다.
--       특강 항목은 {"id","date","lecturer_id","kinds":[무슨 특강 하나 이하],"content"} — id 가 있으면 수정, 없으면 추가(신청 받지 않는 채로 — 방식 줄은 트리거가),
--       목록에서 빠지면 삭제(신청자가 있으면 거부). 신청 받기 · 방식 · 조건 · 정원 · 안내는 건드리지 않는다 (2026-10-16 — 특강 신청 → 특강 설정에서)
--       (마이그레이션 20260915131500 · 20260915140500 · 20260916090000 · 20261016120000).
-- 다시보기가 붙은 회차를 달력에서 빼면 저장 전체를 거부한다 (미확정 4 확정 전까지).

create table courses (                     -- 강좌 마스터
  id           serial primary key,
  code         text unique not null,
  name         text not null,
  course_type  text not null,              -- 'full' | 'lc' | 'rc'
  target_score int,
  is_active    boolean default true,
  program      text not null default 'score',   -- score(한 달 점수보장반) | sparta(스파르타반) | twoweek(2주완성 — 같은 레벨의 앞 절반)  (20260916180000 · 20261005140000)
  includes_levels int[] not null default '{}'   -- 스파르타가 함께 듣는 레벨 (예: {850}). 스파르타만 비어 있지 않다
);
-- timetable_slots(level, program, season, start_time, end_time, ttf_recorded, year, month, book_set, subject_mwf, subject_ttf)
--   — 랜딩 시간표 · 일괄 개설 시간대. **year·month 줄 = 그 달 시간표**(season null, 2026-09-29 — 20260929160000),
--   year 가 빈 줄 = 예전 평달·방학달 두 벌(season 있음, 새 계절의 씨앗). unique: 달 줄 (year, month, level, program, 시각) · 기본 줄 (level, program, season, 시각).
--   ttf_recorded = 이 시간대는 화목금이 인강 (20260917090000). book_set = 과정 A/B · subject_mwf/ttf = 트랙별 과목 (시간 단위 줄만).
--   트리거: 달 줄을 넣거나 고치면 그 달 반(time_block·book_set·subject·recorded·live_to_replay)을 맞추고 한달완성 · 2주완성 줄을 품은 시간에 맞춘다
--   (private.tg_timetable_month_sync) · 그 달 반이 쓰는 줄은 못 지운다 (private.tg_timetable_month_guard, timetable_slot_in_use)
-- private.section_includes(부모 반, 대상 반) → has_section_access — 묶음 반(120분·140분) → 시간 단위 반, 스파르타 반 → 포함 레벨의 시간 단위 반,
--   2주완성 반 → 같은 레벨에서 시간이 안에 들거나 같은 반, 묶음 빼고 (방학달 통짜 반 — 20261005140000 · 20261005160000).
--   private.term_half_date(기수) = 그 달 수업일 앞 절반의 마지막 날 = 2주완성 반의 종강일
-- private.time_block_contains · private.is_package_section (20260916210000). public.my_section_ids() · public.term_section_includes(기수)

create table class_sections (              -- 트랙 단위 분반. 60분·70분 시간 단위 반과 그것을 품는 120분·140분 묶음 반이 따로 있다
  id            serial primary key,
  course_id     int references courses,
  term_id       int references terms,
  bundle_id     uuid,                      -- "하나씩 만들기" 의 주5일 묶음 흔적. 주5일 판정은 (기수·강좌·시간대) 의 월수금+화목금 조합으로 한다
  track         text not null,             -- 'mwf' | 'ttf'
  start_time    time,                      -- 반 편성에서 받지 않음 (null)
  end_time      time,
  time_block    text,                      -- 시간대 라벨. 일괄 개설에서 timetable_slots 의 라벨을 복사
  enrollment_opens_at date not null,       -- 개강일: 기수 달력에서 복사
  closes_at           date not null,       -- 종강일: 다시보기 차단. 기수 달력에서 복사
  target_sessions int not null,            -- 달력의 이 트랙 수업일 수
  instructor_id uuid references profiles,
  capacity      int,
  tuition       int,                       -- 현장 수강료. 선택 (2026-09-16 Alan — 등록은 YBM 에서 한다).
                                           -- 값이 있으면 OCR 매칭 기준선으로 쓴다
  live_tuition  int,                       -- 불라방 수강료. null 이면 불라방 미운영
  recorded      boolean not null default false,  -- 인강 반 (20260917090000). 교실에 안 나오고 그 날 오전 수업 녹화본을 본다.
                                           -- 저녁반 화목금이 여기 해당. 불라방(enrollments.mode=live)과 다르다
  live_to_replay boolean not null default true,  -- 오전반: 회차 수업이 끝나면 그 회차 불라방 링크를 다시보기로 (20260918153000).
                                           -- 저녁 줄(timetable_slots.ttf_recorded)의 반은 두 트랙 모두 false 로 시작 (라이브만)
  book_set      text,                      -- 과정 'A'|'B' (20260916160000 → 뜻을 넓힘 20260923160000). (강좌·시간대) 단위라 두 트랙이 같고
                                           -- 달마다 뒤바뀐다. LC 시간(subject=lc)에는 곧 LC 교재. null = 묶음 반 · 스파르타 반 (시간 단위 반은 다 적는다)
  subject       text,                      -- 과목 'lc'|'rc' (20260923160000). 시간 단위 반만. 묶음·스파르타·방학달 통짜 반은 null (두 과목을 이어 듣는다).
                                           -- 담당 강사 자동 매칭 · 단과 표시 · 내 교재 · 저녁-오전 다시보기 짝이 읽는다. 칸 단위 grant 라 새 칸을 열어 줬다
  status        text default 'open'        -- draft | open | closed. draft 는 비공개
);
-- class_sections 는 draft 를 제외하고 비회원도 조회 가능 (공개 시간표).
-- 불라방 링크는 수강생 전용이라 별도 테이블로 분리 (Security Advisor 지적 반영)

create table section_live_links (          -- 반의 상시 불라방 링크 (Zoom 같은 고정 방). 회차 링크가 없을 때만 쓴다
  section_id  int primary key references class_sections on delete cascade,
  live_url    text not null,
  updated_at  timestamptz default now()
);

create table session_live_links (          -- 회차별 불라방 링크 (20260918153000). 접근 가능한 수강생·스태프만 조회, 담당 강사만 쓴다
  session_date_id bigint primary key references session_dates on delete cascade,
  live_url    text not null,
  updated_at  timestamptz default now(),
  promoted_at timestamptz                  -- 이 링크로 다시보기를 만든 시각 (private.promote_live_replays, pg_cron 10분마다).
                                           -- 링크를 바꾸면 트리거가 다시보기 주소도 바꾸고 이 값을 다시 판정한다
);

create table session_streams (             -- 회차별 유튜브 송출 (20261001140000). Zoom 수업을 유튜브로 함께 송출한 방송을 감지해 걸어 둔다. 스태프만 조회, 쓰기는 service_role
  session_date_id bigint primary key references session_dates on delete cascade,
  video_url   text not null,               -- https://www.youtube.com/watch?v=… (register_detected_stream 이 모양을 검사한다)
  detected_at timestamptz default now(),
  promoted_at timestamptz                  -- 이 주소로 다시보기를 만든 시각 (promote_live_replays — live_to_replay 반만, 수업 종료 뒤)
);
-- private.is_evening_section(반) · private.recorded_source_section(저녁 반: 화목금 인강 · 월수금 현장) → 오전 짝 반 (20260923140000).
-- private.has_recorded_replay_access(반) → replays·session_dates 조회 정책. public.term_recorded_pairs(기수) 가 화면용 창구

create table session_dates (               -- 반별 회차. term_class_dates 에서 파생 (직접 편집 화면 없음)
  id          bigserial primary key,
  section_id  int references class_sections on delete cascade,
  seq         int not null,                -- 날짜순 1..n 으로 자동 재번호
  date        date not null,
  start_time  time,                        -- null
  end_time    time,
  unique(section_id, seq),
  unique(section_id, date)
);

create table replays (                     -- 다시보기
  id              bigserial primary key,
  session_date_id bigint references session_dates on delete cascade,
  video_url       text not null,
  published_at    timestamptz default now()
);

create table enrollment_orders (           -- 등록 단위. 수강증 1건 = 1건
  id              bigserial primary key,
  user_id         uuid references profiles,
  verification_id bigint references enrollment_verifications,
  months          int not null check (months between 1 and 2),  -- 매달 등록 원칙: 항상 1
  status          text not null default 'preliminary',
                  -- preliminary | active | expired
  activates_on    date not null,           -- 첫 달 개강일
  access_until    date not null,           -- 마지막 달 종강일
  created_at      timestamptz default now()
);

create table enrollments (                 -- 월별 실제 반 배정
  id         bigserial primary key,
  order_id   bigint references enrollment_orders on delete cascade,
  student_id uuid references profiles,
  section_id int references class_sections,
  status     text default 'active',        -- active | completed (pending_section 은 예전 2개월 등록용, 사용 안 함)
  mode       text not null default 'onsite', -- onsite(현장) | live(불라방)
  pending_from_section_id int references class_sections,
             -- 예전 2개월 등록용. 매달 등록 원칙(2026-09-15)부터 사용하지 않는다
  unique(student_id, section_id)
);

create table enrollment_verifications (
  id              bigserial primary key,
  user_id         uuid references profiles,
  file_path       text not null,
  ocr_raw         jsonb,
  parsed          jsonb,   -- parseReceipt 결과 (방식·트랙·레벨·과정·시간·이름 일치 … · weeks = 수강요일 줄의 기간 숫자 4 | 2, 2026-10-05)
  candidates      jsonb,   -- [{section_id, score, breakdown}] 튜닝용 로그
  matched_section int references class_sections,
  confidence      numeric,
  result          text,    -- approved | rejected
  reject_reason   text,
  source          text not null default 'auto',   -- auto(수강증만) | manual(학생이 반을 직접 고름)  (20260917150000)
  requested_section_ids int[] not null default '{}',  -- 수동 등업신청에서 학생이 고른 반. 주5일이면 2개.
                                                 -- **신청 기록일 뿐 확정 배정이 아니다** (확정은 enrollments)
  created_at      timestamptz default now()
);
-- (영수증번호 컬럼·unique index 는 마이그레이션 20260918100000 에서 삭제했다 — 수강증 화면에 번호가 없다)

-- ─── 스터디 · 숙제 · LC 음원 (마이그레이션 20260915093000) ───
create table studies (                     -- 월별 스터디. 기수 × 유형당 1개
  id        bigint primary key,
  term_id   bigint references terms,
  kind      text not null,                 -- offline(단어 스터디 — 2026-10-12 전 이름 대면) | online(비대면). vocab 은 2026-10-12 없앴다
  status    text default 'draft',          -- draft | open | closed
  notice    text,                          -- 장소·요일·준비물 안내
  unique(term_id, kind)
);

create table study_slots (                 -- 단어 스터디 시간대
  id            bigint primary key,
  study_id      bigint references studies on delete cascade,
  start_time    time not null,
  end_time      time not null,
  level         smallint,                  -- 이 시간대의 레벨 1 · 2 (20261012100000). 신청하면 study_signups.level 로 복사. 비어 있으면 레벨이 생기기 전 시간대
  capacity      int,                       -- null = 정원 없음
  applied_count int default 0,             -- study_signups 트리거가 유지 (직접 수정 불가)
  unique(study_id, start_time)
);

create table study_signups (               -- 스터디 신청. 한 스터디에 1건
  id        bigint primary key,
  study_id  bigint references studies,
  slot_id   bigint,                        -- (slot_id, study_id) → study_slots. 비대면은 null
  user_id   uuid references profiles,
  level     smallint,                      -- 신청한 레벨 1~3 (20261012100000). 비대면은 학생이 고름(새 신청은 필수), 단어 스터디는 시간대의 레벨이 복사됨. 비어 있으면 레벨 전 신청
  requested_level smallint, requested_slot_id bigint, requested_at timestamptz,   -- 레벨 변경 요청 (set_study_level → decide_study_level 이 비운다)
  request_result text, request_decided_at timestamptz,                          -- 마지막 요청 결과 approved | rejected (학생이 내 스터디에서 본다)
  unique(study_id, user_id)
);
-- 트리거 study_signups_level: 단어 스터디는 level = 시간대 레벨 · 비대면 새 신청은 level 필수 · 학생은 level · 요청 칸을 직접 못 고친다(레벨이 달라지는 시간대 이동도 막는다 — study_level_locked)
-- 함수: public.set_study_level(신청, 레벨, 시간대)(본인 — 레벨이 없으면 바로, 있으면 요청) · public.cancel_study_level_request(신청) · public.decide_study_level(신청, 승인?)(is_crew)
-- private.study_level_max(kind) = 앱 STUDY_LEVELS (단어 2 · 비대면 3)

create table study_material_items (        -- 비대면 자료 회차별 자료실 (20260922124700). 한 번 올리면 매달 쓴다. 스태프 · 조교가 본다
  id bigint primary key, seq int,            -- 1~60회차. unique (seq, level) — 회차 × 레벨이 한 칸 (20261012100000)
  level smallint not null default 0,         -- 0 모든 레벨 공통 · 1 · 2 · 3 (2026-10-12). 레벨 전 자료는 전부 0 — 1회차만 20261012140000 이 레벨 1 로 옮겼다
  title text, file_path text unique, file_name text, file_size bigint, content_type text,
  note text                                  -- 회차 안내 (20260930100000 → 서식 글 5만 자 · 사진 [img=notes/…], 20261005180000). 그 달 적용분 study_materials.note 로 복사된다
);
-- contact_messages.reply · replied_at · replied_by : 문의 답변 (20260930120000). 회원 문의면 student_messages(contact_reply) 로도 간다
-- private.is_youtube_url(url) : 불라방 링크 중 다시보기로 승격하는 것은 유튜브 주소뿐 (20260930110000 — 불라방은 Zoom)

create table study_materials (             -- 그 달에 적용된 비대면 자료 회차 (DB 가 채운다 — private.sync_online_materials)
  id        bigint primary key,
  study_id  bigint references studies,
  seq       int,                           -- 회차. unique(study_id, seq, level)
  level     smallint not null default 0,   -- 자료실에서 복사 (0 공통). 학생 조회 · 인증 정책이 `level = 0 or level = 내 신청의 level` (20261012100000)
  item_id   bigint references study_material_items on delete set null,
  date      date not null,                 -- 그 달 seq 번째 수업일. 이 날짜(KST)부터 신청자에게 공개
  title     text,
  file_path text, file_name text, file_size bigint, content_type text   -- 자료실에서 복사 (여러 달이 같은 파일을 쓴다)
);

create table homework_submissions (        -- **정규 수업** 숙제 제출 (20260916223000 · 20260919140000)
  id          bigint primary key,
  user_id     uuid references profiles,
  level       int not null references lc_levels,   -- 그 날 듣는 반의 레벨 (스파르타는 두 레벨 중 하나)
  subject     text not null,               -- rc | lc (src/lib/homework.ts 의 HOMEWORK_SUBJECTS)
  class_date  date,                        -- 어느 수업일 것인지. 학생이 달력에서 고른다 (20260919140000).
                                           -- 달력 이전에 낸 옛 제출은 비어 있다
  question    text,                        -- 강사에게 하는 질문 (500자). 2026-10-30 부터 받지 않는다 — 예전 제출만 값이 있다
  feedback    text,                        -- 강사 코멘트 · 질문 답변 (점검완료와 함께, 1000자). 같은 글이 알림함으로도 간다
  status      text default 'submitted',    -- submitted | checked
  checked_by  uuid references profiles,
  checked_at  timestamptz,
  created_at  timestamptz
);
-- 제출 자격은 정책이 직접 본다: 본인 + private.has_term_access(null). 같은 날·레벨·과목에 여러 번 제출 가능 (unique 없음).
-- insert · update 는 **컬럼 단위 grant** 다 — 새 칸을 열어 주지 않으면 조용히 막힌다.
-- 자료 연결 컬럼 material_id 는 정리 마이그레이션 20260916224500 에서 지웠다.
-- **study_checkins(비대면 인증)와 서로 참조하지 않는다** — 완전히 다른 일이다 (도메인 규칙 6-2 / 7).

-- study_checkins(비대면 스터디 인증 — 자료 하나에 학생 1건, 20260918160000) 에 더한 칸 (20261008140000 비대면스터디 인증 게시판):
--   status(submitted 확인 전 | checked 확인 완료) · checked_by · checked_at · feedback(코멘트 1,000자). 정책 "study_checkins: 스태프·조교 확인"(칸 단위 grant),
--   학생 삭제는 확인 전만. student_messages.kind 에 study_checked(인증 확인 완료)를 더했다 — 강사가 아닌 사람(조교 · 관리자, 20261008160000)이 보낸 것은 트리거 private.student_messages_study_sender 가 이름을 비운다,
--   조교 발송 갈래는 private.study_checkin_notice_ok(related, user_id) — 받는 학생의 확인된 인증만

create table homework_files (              -- 제출 파일 (사진 여러 장 · 음성 파일 — 2026-10-07. 가르는 것은 content_type)
  id            bigint primary key,
  submission_id bigint references homework_submissions on delete cascade,
  file_path text unique, file_name text, file_size bigint, content_type text
);

create table lc_levels (                   -- LC 음원·교재 레벨 (마이그레이션 20260915103723)
  level      int primary key,              -- 650 | 750 | 850 … 행 추가만으로 탭이 생긴다
  sort_order int default 0
);

create table lc_books (                    -- LC 교재 (20260915110833 · 20260916140000)
  id          bigint primary key,
  level       int not null references lc_levels,
  book_set    text not null,               -- 'A' | 'B'. **달과 무관하다** — 누가 어느 교재를 쓰는지는 class_sections.book_set 이 정한다
  title       text,                        -- 교재명 (60자, 비우면 "A반 교재")
  description text,                        -- 짧은 설명 (200자)
  cover_path text unique, cover_name text, cover_size bigint, cover_type text,
  lesson_offset int not null default 0,    -- 첫 강 번호 - 1. 650B 는 11강부터라 10 (마이그레이션 20260916150000)
  unique(level, book_set)                  -- 레벨 × 반 = 한 권. 칸은 레벨 트리거가 만들고 화면은 수정만
);                                         -- 레벨 3개(650·750·850) × 2반 = 전체 6권

create table lc_audio_tracks (             -- LC 음원. 교재 × 종류 × 강 1~9 (마이그레이션 20260916150000)
  id        bigint primary key,
  book_id   bigint references lc_books,    -- 음원은 교재에 속한다
  kind      text not null default 'lesson' -- lesson(수업 시간) | homework(숙제)
              check (kind in ('lesson','homework')),
  day       int not null check (day between 1 and 9),   -- 칸. 화면에는 (lesson_offset + day)강 으로 보인다
  label     text,                          -- 같은 강에 파일이 여러 개일 때 구분 이름 (예: 영국발음, 팟3). 40자
  sort_order int not null default 0,       -- 같은 강 안에서의 순서
  file_path text unique, file_name text, file_size bigint, content_type text
);                                         -- 한 강에 파일 여러 개 가능 — unique(book_id, day) 는 없다
-- 두 표의 조회: 강사·관리자 전부 · 학생은 교재 = 내 LC 과정 칸(private.my_round_cells), 음원 = 그 강의 내 수업일부터(private.my_open_rounds) — 20261005130000. 저장소 파일도 이 행으로 판정한다
-- 구버전 study_applications(비회원 자유 양식 신청)·lc_textbook_images(레벨별 이미지 묶음)는
-- 배포 후 정리 마이그레이션 20260915112851 에서 삭제했다.

-- ─── 수업자료실 (마이그레이션 20261005100000 — 도메인 규칙 7-4) ───
create table class_materials (             -- 레벨 × 과목 × 과정 × 회차 자료 파일. 학생은 내 과정 칸의 그 회차 수업일부터(private.my_open_rounds), 쓰기는 강사·관리자
  id bigint primary key,
  level int not null references lc_levels, -- 650 | 750 | 850 …
  subject text not null,                   -- rc | lc
  book_set text,                           -- 과정 A | B (20261005130000). seq 와 함께 있거나 함께 없다 — 없으면 학생에게 안 보이는 옛 자료
  seq int,                                 -- 회차 1~30 = 그 과정을 쓰는 반의 N번째 수업일
  title text not null,                     -- 1~100자 (비우면 defaultMaterialTitle — 파일 이름 · 안내 첫 줄)
  note text,                               -- 안내 · 스크립트 5만 자 (20261005150000 — 처음엔 500자). 글 · 파일 · 링크 중 하나는 있어야 한다 (서버 액션)
  links jsonb not null default '[]',       -- 링크 0~20개 [{url, label}] (20261006143000). check private.class_material_links_ok — http(s) 2,000자 · 이름 100자
  sort_order int not null default 0,       -- 같은 칸 × 회차 안 순서 (20261012120000). public.move_class_material(자료, 위로?) 가 이웃과 바꾸고 0 부터 다시 매긴다 (강사 · 관리자)
  uploaded_by uuid references profiles, created_at timestamptz, updated_at timestamptz
  -- 파일 칸(file_path · file_name · file_size · content_type)은 2026-10-06 class_material_files 로 옮기고 지웠다 (20261006100000 → 20261006110000, 도메인 규칙 7-4)
);
create table class_material_files (        -- 수업자료실 자료의 파일 0 ~ 20개 (20261006100000). 조회 = 부모 자료가 보이는 사람, 쓰기는 강사·관리자
  id bigint primary key,                   -- /files/class/{id} 의 id. 10-05 에 올린 파일은 자료와 같은 id 로 옮겼다
  material_id bigint references class_materials on delete cascade,
  file_path text unique, file_name text, file_size bigint, content_type text,   -- 버킷 class-materials/{레벨}-{과목}/…
  sort_order int, created_at timestamptz   -- sort_order = 고른 순서
);
-- private.my_round_cells() : 내 과정 칸 'level:subject:set' (20261005130000) — 접근할 수 있는 반 중 레벨 · 과정이 있는 반, 과목 칸이 빈 반은 두 과목.
--   묶음 · 속성반은 과정이 없어 빠지고 품은 시간 단위 반이 칸을 준다. RC 단과는 LC 칸이 없다. LC 교재 조회
-- private.my_open_rounds() : 열린 회차 'level:subject:set:seq' — 그 칸 반의 seq 번째 수업일이 오늘(KST)이거나 지났다. LC 음원 · 수업자료실 조회
-- (private.my_subject_levels · my_lc_levels(20261005110000) 는 남아 있지만 정책이 더 쓰지 않는다)

create table class_notices (               -- 수업자료실 공지 (20261005170000 — 도메인 규칙 7-4 "공지사항")
  id bigint primary key, title text,       -- 1~100자
  body text,                               -- 서식 글 5만 자 · 사진은 [img=images/… w=NN] (버킷 class-notices)
  levels int[], subjects text[],           -- 범위 — 비우면 모든 레벨 / RC · LC 둘 다. 둘 다 비면 전체 공지
  published boolean,                       -- 내리면 false — 학생에게 안 보인다 (20261006150000)
  links jsonb not null default '[]',       -- 링크 0~20개 [{url, label}] (20261013110000) — 수업자료실 링크와 같은 check
  author_id uuid, author_name text, created_at timestamptz, updated_at timestamptz
);
create table class_notice_files (          -- 공지 첨부 파일 0 ~ 20개 (20261013110000). 조회 = 부모 공지가 보이는 사람, 쓰기는 강사·관리자
  id bigint primary key,                   -- /files/notice/{id}
  notice_id bigint references class_notices on delete cascade,
  file_path text unique,                   -- 버킷 class-materials 의 notices/… 만 (check)
  file_name text, file_size bigint, content_type text, sort_order int, created_at timestamptz
);

-- ─── 인수인계 체크리스트 (마이그레이션 20261004110000) ───
create table handover_checks (            -- 끝낸 항목. 내용은 docs/HANDOVER.md, 이 표는 누가 · 언제만. 강사·관리자만 조회 · 체크 · 풀기
  item text primary key,                   -- 문서의 항목 번호 (0-1 · 3-B …, check 꼴 ^[0-9]{1,2}-[0-9A-Z]{1,2}$)
  checked_by uuid references profiles on delete set null, checked_name text,   -- 트리거가 적는다 (넣을 때 authenticated 는 item 칸만)
  checked_at timestamptz
);

-- ─── 직원 게시판 (마이그레이션 20261021100000 — 도메인 규칙 7-5) ───
create table staff_posts (                -- 강사 · 관리자 · 조교만 조회 · 쓰기(is_crew). 고치기 글쓴이 · 지우기 글쓴이와 강사 · 관리자(is_staff)
  id bigint primary key, title text,       -- 1~100자
  body text,                               -- 서식 글 5만 자 · 사진은 [img=images/… w=NN] (버킷 staff-board)
  links jsonb not null default '[]',       -- 링크 0~20개 [{url, label}] — 수업자료실 링크와 같은 check
  levels int[] not null default '{}',       -- 레벨 (20261021110000) — 비우면 모든 레벨, 탭 L 에는 levels = {} 이거나 L 을 품은 글
  moved_from jsonb,                         -- 수업자료실에서 옮겨 온 글의 원래 자리 {kind: notice, levels, subjects} | {kind: material, level, subject, set, seq} — 넣을 때만
  subject text, book_set text,              -- 과목 rc | lc · 과정 A | B (20261021120000) — 비우면 둘 다, 칸 rc-A 에는 subject 가 비었거나 rc 이고 book_set 이 비었거나 A 인 글
  author_id uuid references profiles on delete set null, author_name text,   -- 트리거가 적는다 (authenticated 는 insert title · body · links · levels · moved_from · subject · book_set, update title · body · links · levels · subject · book_set)
  created_at timestamptz, updated_at timestamptz   -- updated_at 은 제목 · 본문 · 링크 · 레벨 · 과목 · 과정이 바뀔 때만
);
create table staff_post_files (           -- 글의 첨부 파일 0 ~ 20개. 조회 = 글이 보이는 사람, 넣기 · 순서 = 글쓴이, 지우기 = 글쓴이 · 강사 · 관리자
  id bigint primary key,                   -- /files/board/{id}
  post_id bigint references staff_posts on delete cascade,
  file_path text unique,                   -- 버킷 staff-board 의 files/… 만 (check)
  file_name text, file_size bigint, content_type text, sort_order int, created_at timestamptz
);
-- 트리거 profiles_staff_posts_follow_merge — profiles.merged_into 가 적히면 옛 계정의 글을 남길 계정으로

-- ─── 관리자 알림 · 네이버 예약 (마이그레이션 20260915115015) ───
create table push_subscriptions (          -- 스태프 기기별 웹 푸시 구독
  id        bigint primary key,
  user_id   uuid references profiles on delete cascade,
  endpoint  text unique not null,
  p256dh    text not null, auth text not null,
  user_agent text, last_sent_at timestamptz
);

create table notification_settings (       -- 사람별 알림 종류 켜기·끄기 (행 없으면 모두 켜짐)
  user_id uuid primary key references profiles,
  verification bool, textbook_order bool, contact bool, naver_reservation bool, daily_digest bool
);

-- ─── QR 출석 (마이그레이션 20260921130500 — 도메인 규칙 7-2) ───
create table attendance_stamps (           -- 한 칸 = 학생 · 직접 배정된 반 · 날짜. 본인·crew 조회, 쓰기는 함수로만
  id bigint primary key, student_id uuid references profiles, section_id bigint references class_sections, class_date date,
  status text,                             -- present(한 번 찍음 = 출석, 20261010100000 — 그전의 in · out 은 present 로 바꿨다) | manual(출석 인정) | absent(결석)
  check_in_at timestamptz, check_out_at timestamptz, late bool, method text,   -- qr | code | poster(인쇄용 QR, 20260921150500) | manual
  decided_by uuid, decided_note text,      -- 강사·조교가 정한 것 (사유 필수)
  unique (student_id, section_id, class_date)
);
create table attendance_events (           -- 쌓기만: enter · exit · manual · reject(틀린 코드 — 연타 잠금에 쓴다). crew 조회
  id bigint primary key, student_id uuid, section_id bigint, class_date date, kind text, method text, result text, actor_id uuid, note text, created_at timestamptz
);
-- public.attendance_scan(토큰, 방법)(학생) — 인쇄용 토큰만 받는다 (20260922103000. 방법 인자는 예전 모양 유지용, 쓰지 않는다)
-- public.attendance_set(학생, 반, 날짜, 상태, 사유)(crew) · public.attendance_roster(날짜)(crew — 강사·관리자 줄 없음 · 조교는 assistant 칸, 20261016100000)
-- public.attendance_term_board(기수)(crew) — 한눈에 보기 격자: 학생 한 줄(assistant 칸 — 강사·관리자 줄은 없다, 20261016100000) + days jsonb {d, s, done, st, late, at} (20261001100000 → 20261010100000 끝난 수업 = 수업 끝. 옛 attendance_term_summary 는 지웠다)
-- public.my_attendance_days()(학생 — auth.uid()) — 내 출석 달력: 지금·다음 기수의 내 현장 수업일마다 한 줄 (종강한 기수는 안 준다)
-- student_messages.kind 에 attendance(결석 안내) 를 더했다 (20261001100000 — student_messages_kind_check)
-- student_messages.pushed_at (20261015120000) — 휴대폰 푸시를 처리한 시각 (live_start · homework_missing 만). 문장 트리거 student_messages_push 가 들어오는 순간
--   private.call_app('/api/cron/student-push') 를 부르고, public.claim_student_pushes()(service_role) 가 15분 안의 줄을 가져가며 찍는다. pg_cron student-push-retry(1분) 가 놓친 것을 다시 부른다
-- student_messages.kind 에 homework_missing(숙제 미제출 안내, 20261008150000) — 조교가 보내면 트리거 student_messages_homework_missing_sender 가 sender_name 을
--   안 낸 과목(related.subjects)의 선생님(private.homework_missing_teacher, RC 먼저 ' · ')으로. 조교 갈래는 private.homework_missing_notice_ok(related, user_id) —
--   받는 학생이 related.termId 기수 반에 배정된 학생일 때만. public.homework_missing_notices(기수)(crew) = 학생 · 레벨마다 마지막으로 보낸 시각
-- student_messages BEFORE INSERT 트리거 student_messages_homework_sender (20261008120000 → 20261008160000) — 보낸 사람이 강사 등급이 아닌(조교 · 관리자) homework_checked 의 sender_name 을
--   그 숙제 과목 선생님(private.homework_notice_teacher)으로. 조교 발송 정책의 숙제 갈래는 private.homework_notice_ok(related, user_id) — 받는 학생의 점검된 숙제만.
--   같은 20261008160000 이 homework_missing_sender · study_sender 도 role <> 'instructor' 로 — 그날 관리자 등급 계정이 점검한 알림 165건이 조교 규칙을 비껴갔다
-- homework_missing_optouts(user_id pk → profiles cascade, created_at) — 숙제 미제출 알림 안 받기 (20261015100000). 행이 있으면 안 받기 — 없으면 받는다. 조회 본인 · crew,
--   넣기 · 지우기는 본인만 (insert 는 user_id 칸만 grant). 트리거 student_messages_homework_missing_optout(BEFORE INSERT, 이름 순으로 _sender 보다 먼저) 이
--   안 받기를 누른 학생에게 가는 homework_missing 줄은 넣지 않는다 (return null). private.merge_accounts 가 옮긴다 (moved.homework_alerts_off)
-- (homework_missing_optins — 2026-10-14 하루 쓴 신청 표 (행이 있으면 받기). 20261015110000 이 지웠다)
-- public.homework_due_dates(날짜[]) → (class_date, due_date) — 숙제 제출 기한 = 같은 트랙(term_class_dates)의 다음 수업일, 기수를 넘어간다 · 없으면 null.
--   authenticated 실행 (학생 숙제 달력 · 관리자 미제출 알림). 시각(오후 5시)은 앱 HOMEWORK_DUE_TIME. service_role 도 (자동 알림, 20261019100000)
-- public.homework_student_search(p_q) → (user_id, name, role) — 숙제점검 학생 이름 검색 (20261030100000). crew 전용 · 이름 · 등급만 · 빈칸 무시 부분 일치 ·
--   합쳐진 옛 계정 빼고 · 숙제를 냈거나 배정된 적이 있는 사람 · 50명
-- homework_missing_auto(한 줄: enabled · send_time 17:00~23:55 5분 단위 · covered_until · schedule_changed_at · updated_at · updated_by) — 숙제 미제출 자동 알림 설정 (20261019100000).
--   조회 crew, 수정 스태프 · 칸 단위 grant (enabled, send_time). 트리거 tg_homework_missing_auto_touch — 켜기 · 시각이 바뀌면 바꾼 때 · 사람, 켜는 순간 covered_until = 첫 실행 날 0시
-- homework_missing_auto_runs(run_date 한국 날짜 pk · started_at · window_from · finished_at · sent · opted_out · tracks · error) — 하루 한 줄. 조회 crew, 쓰기는 service_role 만
--   public.claim_homework_missing_auto()(service_role) — 보낼 때면 오늘 실행을 가져간다 (멈춘 실행은 15분 뒤) · private.homework_missing_auto_due() — pg_cron homework-missing-auto(5분)가 본다
--   private.homework_missing_levels(related) — 알림이 다룬 레벨 = related.levels ∪ related.level (homework_missing_notices 가 레벨마다 펼친다)
--   자동 알림은 sender_id null — student_messages_homework_missing_sender 가 안 낸 과목의 선생님 이름을 적는다
-- private.attendance_poster(한 줄: token 20자 · created_at · created_by) — 출석 QR 포스터 토큰 (20260921150500). 앱에서 못 읽는다
--   → public.attendance_poster_token()(crew) · public.rotate_attendance_poster()(스태프 — 새로 만들기, 옛 종이 무효)
-- (30초 화면 QR 의 private.attendance_token · public.attendance_display · Vault attendance_qr_secret 은 20260922103000 에서 지웠다.
--  stamps.method 의 qr · code 는 지난 기록용으로 check 에 남아 있다)

-- ─── 유튜브 불라방 자동 연결 (마이그레이션 20260921120500 — 도메인 규칙 1 "유튜브 방송을 감지해") ───
create table youtube_channels (            -- 강사 채널 연결. 토큰 칸은 service_role 만 (authenticated 는 상태 칸만 칸 단위 grant)
  user_id uuid primary key references profiles, channel_id text unique, channel_title text,
  refresh_token text, access_token text, access_token_expires_at timestamptz,
  linked_at, last_checked_at, last_live_at, last_error, last_error_at
);
-- session_live_links.source : manual(강사가 붙여 넣음) | youtube(감지한 송출이 비어 있던 칸에 저절로 들어감 — 20261001150000. 송출 자체는 session_streams 에도 남는다)
-- notification_settings.live_detected : 내 송출이 잡혀 다시보기로 예약되면 강사 본인에게
-- public.live_detect_candidates() · public.register_detected_stream(ids, url) — service_role 전용 (register_detected_live 는 20261001140000 에서 지웠다) ·
-- private.notify_live_session(반, 날짜)

-- ─── 불라방 교재주문 (마이그레이션 20260921110500 — 도메인 규칙 7-1) ───
create table textbook_accounts (           -- 교재비 입금 계좌 (강사가 등록). crew + 불라방 배정 학생만 조회
  id bigint primary key, bank_name text, account_no text, holder text, label text, active bool, sort_order int
);
create table textbook_items (              -- 교재 (강사가 등록). level null = 모든 레벨
  id bigint primary key, name text, level int references lc_levels, price int,
  account_id bigint references textbook_accounts,   -- null = 기본 계좌
  note text, active bool, sort_order int,
  subject text, book_set text              -- 어느 시간의 교재 (lc|rc × A|B, 20261002233000). 둘 다 있으면 그 시간을 듣는 불라방 학생의 "내 반 교재"
);
create table textbook_settings (           -- 한 줄: shipping_fee · default_account_id · notice
  id boolean primary key, shipping_fee int, default_account_id bigint, notice text
);
-- textbook_orders 에 더한 칸: term_id · items(jsonb, 주문한 때 이름·가격) · items_total · shipping_fee · total_amount ·
--   depositor_name · pay_to(jsonb, 계좌별 금액). unique (user_id, term_id) where status <> 'cancelled'.
--   넣기는 public.create_textbook_order(...) 로만, 학생 취소는 public.cancel_textbook_order(id) 로만
--   section_ids bigint[] (20261027100000) — 주문할 때 그 달 내 불라방 반 전부(월수금 먼저). 첫째가 section_id(대표 반). 주5일이면 둘 — 교재주문 화면의 반 칸이 이것을 읽는다
--   received_at (20261002234000) — 학생이 받았다고 누른 시각(public.receive_textbook_order(id), 내 주문 · shipped 만). 찍히면 학생 내역에서 숨는다.
--   delivery_method · pickup_date · pickup_time (20261007110000) — 받는 방법 parcel(택배) | pickup(현장수령 — 배송비 0, 주소 대신 받으러 올 날짜 · 시각).
--   address 는 not null 을 풀었고 check textbook_orders_pickup_check 가 "택배면 주소 · 현장수령이면 날짜 · 시각" 을 묶는다. 현장수령을 건네면 조교가 수령완료(shipped + received_at)
--   public.textbook_pickup_days() (20261026100000) — 오늘(KST)부터 60일 안의 수업일 · 트랙(term_class_dates). 현장수령 날 = 이 날들, 시각 = 트랙대로(앱 PICKUP_TIME_RANGES).
--   authenticated 실행 · 날짜 · 트랙만 준다 (homework_due_dates 와 같은 길). 주문 화면과 서버 액션이 같은 함수를 부른다
--   트리거 private.guard_textbook_order_update: 조교 세션이 금액확인 전 · 취소 주문을 confirmed · shipped 로 넘기는 것을 막고,
--   조교 세션은 status · tracking_no · updated_at · received_at 밖의 칸을 못 바꾸며(assistant_status_only, 20261003100000),
--   shipped 가 아니게 되면 received_at 을 지운다

-- ─── 수강증 자동 판정 긴급 스위치 (마이그레이션 20260923000500 — 도메인 규칙 4-2) ───
create table feature_flags (                -- 배포 없이 켜고 끄는 스위치. crew 조회, 스태프는 enabled·note 만 수정 (updated_* 는 트리거)
  key text primary key,                    -- verification_auto = 수강증 자동 판정(자동 승인 · 자동 거절)
  enabled boolean not null, note text, updated_at timestamptz, updated_by uuid references profiles
);
-- enrollment_verifications.candidates 에 더한 칸 (2026-09-22): blockers(자동 승인을 막은 까닭) · hold(받아 둔 다음 달, 1~12) ·
--   heldFor(다시 맞춘 뒤) · autoOff(스위치가 꺼져 있을 때 올라옴) · wouldReject(켜져 있었다면 거절했을 사유)

-- ─── 네이버 예약 자동 확인 (마이그레이션 20260921101500 — 도메인 규칙 8) ───
create table naver_booking_slots (         -- 칸마다 예약 건수 (10분마다 갱신). 쓰기는 서버만, 조회는 스태프
  slot_at timestamptz primary key, booking_count int, stock int, is_sale_day bool, updated_at timestamptz
);
create table naver_booking_events (        -- 변동 기록 (쌓기만). 알림은 이 행마다 한 번
  id bigint primary key, slot_at timestamptz,
  kind text,                               -- booked | cancelled | vanished(예약이 있던 칸이 사라짐 — 확인 필요)
  prev_count int, new_count int, stock int, created_at timestamptz
);
create table naver_sync_status (           -- 한 줄. 마지막 성공·연속 실패·retry_after(차단 뒤 쉼)·held_signature(취소 여러 건 보류)
  id boolean primary key, last_run_at, last_success_at, last_error, last_error_at, consecutive_failures, retry_after, held_signature, slots, range_to
);
-- private.app_config(key, value)          -- site_url = DB 크론이 부르는 우리 사이트 주소 (20260921100500)
-- Vault app_cron_secret                   -- DB 크론 → 우리 API 호출 비밀 (DB 안에서 만든 값). public.app_cron_secret() 은 service_role 전용

create table naver_reservations (          -- (쓰지 않음) 예전 알림 원문 전달 방식. 대시보드가 더는 읽지 않는다
  id             bigint primary key,
  dedupe_key     text unique not null,       -- 예약번호, 없으면 원문 해시
  status         text,                       -- requested | confirmed | cancelled | changed | unknown
  item_name      text, customer_name text,   -- 이름은 가운데 글자 가림
  reserved_date  date, reserved_time time,   -- 예약된 날짜·시각 (한국 시간)
  booking_number text, source text,
  raw_text       text,                       -- 원문 (전화번호 가림)
  parsed         boolean,                    -- 날짜를 읽었는지
  received_at    timestamptz
);
```

---
