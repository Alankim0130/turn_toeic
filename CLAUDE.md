# 역전토익 홈페이지 — CLAUDE.md

부산 서면 YBM 어학원 소속 토익 브랜드 **역전토익**(강사: 이혜영 LC / 이영수 RC)의
수강생 학습관리 홈페이지. 원페이지 랜딩이 아니라 LMS를 갖춘 사이트다.

---

## 작업 원칙 (반드시 준수)

1. **요청하지 않은 기능을 추가하지 않는다.** 아래 "구현 범위"에 없는 것은 만들지 않는다.
   좋아 보인다는 이유로 출결·채점·단어장·오답노트·알림톡·NFC 체크인 등을 끼워넣지 말 것.
2. **미확정 항목은 추측해서 구현하지 않는다.** 문서 맨 아래 "미확정" 목록에 해당하면
   구현을 멈추고 질문한다.
3. 결제·수강신청은 **YBM 공식 사이트(ybmedu.com)에서만** 이뤄진다. 이 사이트는 결제를 다루지 않는다.
4. 반·시간대·수강료 같은 운영 데이터는 **DB에서 읽는다. 코드에 하드코딩 금지.**

---

## 기술 스택

- **Next.js** (App Router) + TypeScript
- **Supabase** — Auth, Postgres, Storage, Edge Functions, RLS
- 배포: Vercel
- OCR: 외부 OCR API 호출 (엔진 미확정)

---

## 구현 범위 (2026-09-15 Alan 확장 반영)

| 영역 | 내용 |
|---|---|
| 공개 페이지 | 역전토익 소개(랜딩, 애니메이션), 수강생전용 소개, 스터디 신청하기(대면·비대면·단어), 연락하기 |
| 수강생 포털 | 등업신청(수강증 업로드·자동 등업), 내 시간표, 내 스터디(비대면 자료 받기), 그리고 **수강생전용** 6개: 불라방, 다시보기, 숙제업로드, 스터디, 불라방교재주문, LC음원듣기 |
| 관리자 페이지 | 대시보드(학생명단·교재주문·마케팅 분석·시간대별 인원수 위젯), 반 개설·편성(+ 그 달 스터디 시간 설정), 다시보기 등록, 등업 로그, 스터디 신청자 명단, 비대면 자료 등록, 숙제점검, LC 음원 등록, 문의 처리 |

### 디자인·품질 원칙 (항상 적용)
- **브랜드 컬러는 핫핑크.** 팔레트: brand #FF2E88 / hover #E61E75 / tint #FFE4EF, 텍스트 ink #17121F
- **SEO**: 모든 공개 페이지에 metadata(title/description/OG), 시맨틱 HTML, `app/sitemap.ts`·`app/robots.ts` 를 새 공개 라우트마다 갱신
- **반응형** + 상단 네비게이션 바 + **모바일 하단 네비게이션 바**
- 상단 메뉴는 `소개 · 등업신청 · 수강생전용(하위 메뉴) · 연락하기`. PC(lg 이상)는 드롭다운, 그보다 좁으면 햄버거
- **햄버거 메뉴는 오른쪽에서 밀려나오는 패널**이다. 화면 전체를 덮지 않고 뒤 화면은 살짝만 어둡게 한다
- PC 에서는 헤더 바로 아래에 두 번째 메뉴 줄을 두지 않는다 (마이페이지 메뉴 줄은 lg 미만에서만)
- 스태프(instructor/admin)에게는 학생 페이지에서 관리자 페이지로 바로 가는 버튼 노출
- **기본 이모지 절대 금지.** 아이콘·일러스트는 힉스필드(Higgsfield)로 제작해 `public/` 에 저장한 자산만 사용
- 브랜드 로고도 힉스필드로 제작 (`public/brand/`)
- Downloads 의 첫토익 자료(노랑/연두, 파스텔 핑크 시간표·교재 표지)는 **다른 브랜드**. 참고 금지

### 관리자 대시보드 항목
- **학생명단**: 등록생(해당 월, 개강일~종강일 기준) / 예비등록생(개강 전 등록) / 졸업생
- **교재주문**: 불라방 수강생의 교재 배송 신청 목록 (`textbook_orders`)
- **마케팅 분석**: 가입 시 수집한 대학·학과·성별 차트
- **수업시간대별 인원수 위젯**: 시간대마다 현장 인원, 괄호 안에 불라방 인원 — `현장 12 (불라방 5)`

---

## 도메인 핵심 규칙

### 1. 수업 편성 — 강사가 매달 직접 짠다

- 강사 일정은 **매달 달라진다.** 고정 패턴을 코드에 넣지 말 것.
- 트랙은 두 가지: **월수금(MWF)** / **화목금(TTF)**
- **주3일반** = 한 트랙만 수강 → 월 **10회**
- **주5일반** = 두 트랙 모두 수강 → 월 **20회**
- 월·수(또는 화·목)는 매주, **금요일은 격주**로 들어간다.
  두 트랙의 금요일은 서로 엇갈려서, 주5일 학생은 금요일에 항상 한 타임만 듣는다.

```
1주  MWF: 월·수·금   TTF: 화·목        → 주5일 학생 5일
2주  MWF: 월·수      TTF: 화·목·금     → 주5일 학생 5일
3주  MWF: 월·수·금   TTF: 화·목        → 주5일 학생 5일
4주  MWF: 월·수      TTF: 화·목·금     → 주5일 학생 5일
     ────────────────────────────────
     MWF 10회        TTF 10회          주5일 20회
```

> **요일 배열(`{월,수,금}`)만으로는 격주 금요일을 표현할 수 없다.**
> 진실의 원천은 `session_dates` 행들이다. 강사가 캘린더에서 날짜를 확정하고,
> 회차 수·학생 시간표·다시보기 슬롯은 전부 여기서 파생된다.
> 강사가 편성을 바꾸면 파생 항목이 모두 따라 움직여야 한다.

**강사 편성 화면 동작**
1. 트랙(MWF/TTF)과 금요일 격주 시작 주를 고르면 초안 날짜가 자동 생성된다
2. 강사가 캘린더에서 개별 날짜를 켜고 끄며 확정한다
3. 화면에 `10 / 10회` 카운터를 항상 표시한다
4. 두 트랙의 같은 날짜가 겹치면 경고한다 (주5일 학생이 하루에 두 수업을 듣게 되므로)

### 2. 개강일 · 종강일 — 수업일과 **별개**로 강사가 지정

| 필드 | 의미 |
|---|---|
| `enrollment_opens_at` (개강일) | 이 날부터 해당 반으로 **수강증 업로드가 활성화**된다 |
| `closes_at` (종강일) | 이 날이 지나면 **다시보기 시청이 차단**된다 |

- 첫 수업일·마지막 수업일과 같을 필요가 없다. 강사가 자유롭게 앞뒤로 잡는다.
- 종강일을 마지막 수업일보다 뒤로 잡으면 마지막 회차 녹화본도 볼 수 있다.
  **시스템이 유예 기간을 임의로 더하지 않는다.**

### 3. 학생 등급 — 권한 × 반 배정 2축

**축 1 · 권한 등급 (`profiles.role`)**

| role | 설명 |
|---|---|
| `guest` | 비회원. 공개 페이지만 |
| `member` | 가입 회원. 수강증 업로드 가능 |
| `student` | 수강증 인증 통과 + 개강일 도래. 배정된 반의 불라방·다시보기 |
| `alumni` | 종강일 경과로 자동 강등 |
| `instructor` | 본인 반 개설·편성·관리 |
| `admin` | 전체 |

**축 2 · 반 배정 (`enrollments`)** — 학생 ↔ 분반 다대다.
주5일 학생은 MWF·TTF **두 건**을 갖는다. 내 시간표는 두 트랙의 합집합.

```
콘텐츠 접근 =  role 이 student 이상
            AND 해당 콘텐츠의 section 에 활성 enrollment 보유
            AND today <= section.closes_at
```

### 4. 등록 기간 — 매달 등록 (2026-09-15 Alan 확정)

- **등록은 매달 한다.** 수강증 1건 = 그 달 등록 1건. 2개월 등록은 받지 않는다.
- 등업신청에서 학생은 **수강증만 올린다.** 개월수·현장/불라방을 고르지 않는다 (현장/불라방은 수강료로 판정).
- 주5일은 같은 달의 월수금·화목금 두 반이 한 등록에 함께 배정된다.
- 시청 만료일은 **그 달 반의 `closes_at`** (두 반이면 늦은 쪽).
- DB 의 `enrollment_orders.months` 는 항상 1, `pending_section`·`pending_from_section_id`·
  `private.resolve_pending_enrollments()` 는 예전 2개월 등록용으로 남아 있을 뿐 쓰지 않는다. 새 기능에서 참조하지 말 것.

### 4-1. 수강생전용 — 보이지만 수강생만 쓴다 (2026-09-15 Alan 요청)

- 소개 페이지 `/student` 와 메뉴의 "수강생전용" 아래에 6개: 불라방 · 다시보기 · 숙제업로드 · 스터디 · 불라방교재주문 · LC음원듣기.
  목록과 설명은 `src/lib/site.ts` 의 `STUDENT_FEATURES` 한곳에서 관리한다.
- 비수강생에게도 **메뉴와 소개는 보인다** (잠금 표시). 누르면 소개 페이지의 해당 카드로 가서 수강생이 되는 방법을 안내한다.
  "수강생이 되면 이런 걸 쓸 수 있구나"를 알게 하는 것이 목적이다.
- 판정 (`getStudentAccess`): 스터디는 예비등록생부터, 나머지 5개는 role 이 student 이상. 강사·관리자는 모두 열림.
- 기능 페이지 주소로 바로 들어와도 `studentGate()` 가 잠금 안내를 보여준다. 화면 안내일 뿐 실제 데이터 보호는 RLS 가 한다.

### 5. 예비등록생 — 개강 전 수강증 업로드

- 학생은 **개강일 전에도 수강증을 올릴 수 있다.**
- OCR 검증을 통과하면 `enrollment_orders.status = 'preliminary'`로 기록되고,
  **"N월 예비등록생"**으로 표시된다.
- 예비등록생은 아직 `student`가 아니다. 불라방·다시보기 접근 불가.
- **개강일이 되면 자동으로** `active` + `role = 'student'`로 전환된다.

### 6. 스터디 — 강사가 매달 연다 (2026-09-15 Alan 요청)

| 유형 (`studies.kind`) | 신청 | 운영 |
|---|---|---|
| 대면스터디 `offline` | 시간대(`study_slots`)를 골라 신청 | 강사가 그 달 편성 때 시간대를 정한다. 하루 2타임·3타임 등 개수 자유 |
| 비대면스터디 `online` | 시간대 없이 신청 | 수업일마다 하루 하나씩 자료(`study_materials`). 학생은 해당 날짜부터 받고, 풀이는 숙제제출에 올린다 |
| 단어스터디 `vocab` | 대면처럼 시간대를 골라 신청 | 정해진 시간에 단어 점검 |

- 스터디는 **기수(월) × 유형**당 하나. 시간대는 매달 달라지므로 코드에 두지 않고
  `/admin/sections?term=` 의 "스터디 시간 설정"에서 행으로 만든다.
- 공개 상태: `draft`(학생에게 안 보임) → `open`(신청·변경·취소 가능) → `closed`(보이지만 신청·취소 불가).
- **신청 자격**: 그 달 반에 배정된 수강생 — 예비등록생 포함, 종강일까지 (`private.is_term_enrollee`).
  **자료·음원 열람**: 주문이 active 인 수강생만 (`private.has_term_access`). 비대면 자료는 **해당 날짜(KST)부터** 공개.
- 한 스터디에 신청은 1건. 시간대 변경은 같은 행의 `slot_id` 만 바꾼다. 정원(`capacity`, 선택)은
  트리거가 `applied_count` 를 조건부로 올려서 동시에 신청해도 넘지 않는다.
- 신청자가 있는 시간대·스터디, 제출물이 있는 자료는 DB 가 삭제를 막는다 (학생 기록 보호).

### 7. 숙제제출 · LC 음원

- **숙제제출**: 비대면 자료(날짜)마다 1건, 사진·PDF 여러 장(최대 20개, 파일당 20MB).
  강사가 `/admin/homework` 에서 점검완료로 바꾸면 학생은 더 이상 파일을 바꾸거나 지울 수 없다. 점수·코멘트는 없다.
- **LC 음원**: **레벨(650 · 750 · 850) × 반(A · B) × 권**으로 나눈다 (2026-09-15 Alan 요청).
  레벨마다 **A반 교재 2권 + B반 교재 2권 = 4권**. **홀수달은 A반, 짝수달은 B반** 교재로 수업한다.
  - 교재 한 권(`lc_books`)마다 표지 이미지 1장 + 교재명 + 짧은 설명(200자), 음원은 교재에 속한다.
  - 레벨 목록은 `lc_levels` 에서 읽고, 레벨을 추가하면 트리거가 A·B 1~2권 칸을 만든다.
  - 학생 화면: 레벨 카드 → A반·B반 책장(큰 표지 + 설명) → 교재를 누르면 그 교재 음원. "이번 달 교재"는 월의 홀짝으로 표시,
    기본 레벨은 지금 듣는 강좌의 `courses.target_score`, 기본 교재는 이번 달 반 1권.
  - 열람은 지금 수강 중인 수강생 전체(레벨·반으로 막지 않음). 음원 목록은 제목의 숫자 순서(Unit 1, 2, 10)로 정렬.
- 파일은 전부 private 버킷(`study-materials`, `homework`, `lc-audio`, `lc-textbooks`). 화면은 `/files/{material|homework|audio|textbook}/{id}` 로
  서명 URL 로 리다이렉트한다 — 행 RLS 와 storage 정책이 같은 규칙으로 막는다.
- 서버 액션 본문 한도(1MB) 때문에 파일은 **브라우저 → Storage 직접 업로드**, 서버 액션은 경로·이름만 등록한다.

---

## 수강증 OCR 자동 등업

> **가장 어려운 부분이다.** 과거 운영에서 브랜드명 인식, 단과/종합 구분, 시간대 판별이
> 계속 틀렸다. 수강증 전문을 자유 파싱하지 말 것 — 한글 OCR은 한 글자만 틀려도 무너진다.
> **해당 시점에 열려 있는 반은 10~20개뿐이므로, 파싱이 아니라 후보 대조 문제로 푼다.**

### 파이프라인

```
업로드 → Supabase Storage (private) → Edge Function
  ↓ OCR
  ↓ 정규화
      공백·특수문자 제거, 전각→반각
      시각 구분자  . ; ：  →  :
      범위 구분자  - – ~   →  ~
      금액 콤마 제거 → int
  ↓ 게이트 (하나라도 실패하면 reject)
      G1  학원명에 'YBM' AND ('서면' OR '부산')
      G2  '역전토익' 정확 일치
          OR 4글자 슬라이딩 윈도우 편집거리 ≤ 1
             (역전토익 ↔ 력전토익 / 역젼토익 / 역전도익)
          OR 강사명 '이혜영' | '이영수' 포함
      G3  가입 실명 == 수강증 수강생명 (공백 무시)
      G4  영수증번호 미사용 (DB unique index)
  ↓ 후보 생성
      class_sections 중 업로드 시점에 enrollment_opens_at 이 도래했거나
      곧 도래하는 반 전체 (예비등록 허용하므로 다음 달 반도 포함)
  ↓ 후보별 점수 (가중합 0~100)
      +30  수강료 일치        ← 가장 신뢰도 높은 키
      +20  시간대 일치
      +15  트랙 일치          MWF / TTF / 주5일
      +15  강좌유형 일치       종합 / 단과LC / 단과RC
      +10  강사명 일치
      +10  수강기간 일치
  ↓ 판정
      top1 ≥ 70 AND (top1 − top2) ≥ 15  →  자동 확정
      그 외                              →  아래 "미확정" 참조
```

### 수강료를 최우선 키로 쓰는 이유
숫자는 한글 대비 OCR 오인식률이 낮고, 단과·종합·불라방 할인가가 서로 충분히 떨어져 있어
**금액 하나만 제대로 읽혀도 강좌유형과 시간대 후보가 대부분 걸러진다.**
따라서 `class_sections.tuition`은 매달 정확히 입력되어야 한다 — 이 값이 판별 기준선이다.

### 단과 / 종합 판정
세 신호 중 **2개 이상 합치할 때만** 확정한다.

| 신호 | 종합 | 단과 |
|---|---|---|
| 키워드 | 종합, 종합반, LC+RC | 단과, LC, RC |
| 수업 길이 | 김 | 짧음 |
| 수강료 | 높음 | 낮음 |

### 개인정보
- 수강증 원본은 private bucket에 저장하고 인증 후 자동 삭제한다 (보관 기간 미확정)
- 업로드 화면에 수집 항목·보관 기간을 고지하고 동의를 받는다
- `receipt_no`에 unique index — 영수증 1건당 1계정

---

## 데이터 모델

```sql
create type user_role as enum
  ('guest','member','student','alumni','instructor','admin');

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null,              -- 실명. 수강증 대조에 사용
  phone       text,
  role        user_role not null default 'member',
  university  text,                       -- 마케팅 분석용 (가입 시 입력)
  department  text,
  gender      text,                       -- male | female | other | undisclosed
  created_at  timestamptz default now()
);

create table terms (                       -- 기수 = 월
  id serial primary key,
  year int not null,
  month int not null,
  unique(year, month)
);

create table courses (                     -- 강좌 마스터
  id           serial primary key,
  code         text unique not null,
  name         text not null,
  course_type  text not null,              -- 'full' | 'lc' | 'rc'
  target_score int,
  is_active    boolean default true
);

create table class_sections (              -- 트랙 단위 분반
  id            serial primary key,
  course_id     int references courses,
  term_id       int references terms,
  bundle_id     uuid,                      -- 주5일반: MWF+TTF 묶음 키
  track         text not null,             -- 'mwf' | 'ttf'
  start_time    time not null,
  end_time      time not null,
  time_block    text,                      -- 시간대 라벨. 값은 Alan 확정 후 입력
  enrollment_opens_at date not null,       -- 개강일: 수강증 업로드 개시
  closes_at           date not null,       -- 종강일: 다시보기 차단
  target_sessions int not null,            -- 10 또는 20
  instructor_id uuid references profiles,
  capacity      int,
  tuition       int not null,              -- 현장 수강료. OCR 매칭 기준선
  live_tuition  int,                       -- 불라방 수강료. null 이면 불라방 미운영
  status        text default 'open'        -- draft | open | closed. draft 는 비공개
);
-- class_sections 는 draft 를 제외하고 비회원도 조회 가능 (공개 시간표).
-- 불라방 링크는 수강생 전용이라 별도 테이블로 분리 (Security Advisor 지적 반영)

create table section_live_links (          -- 불라방 입장 링크. 접근 가능한 수강생·스태프만 조회
  section_id  int primary key references class_sections on delete cascade,
  live_url    text not null,
  updated_at  timestamptz default now()
);

create table session_dates (               -- 진실의 원천. 강사가 캘린더로 확정
  id          bigserial primary key,
  section_id  int references class_sections on delete cascade,
  seq         int not null,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
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
  parsed          jsonb,   -- {name, course, teacher, time, tuition, period, receipt_no}
  candidates      jsonb,   -- [{section_id, score, breakdown}] 튜닝용 로그
  matched_section int references class_sections,
  confidence      numeric,
  result          text,    -- approved | rejected
  reject_reason   text,
  receipt_no      text,
  created_at      timestamptz default now()
);
create unique index on enrollment_verifications (receipt_no)
  where result = 'approved';

-- ─── 스터디 · 숙제 · LC 음원 (마이그레이션 20260915093000) ───
create table studies (                     -- 월별 스터디. 기수 × 유형당 1개
  id        bigint primary key,
  term_id   bigint references terms,
  kind      text not null,                 -- offline(대면) | online(비대면) | vocab(단어)
  status    text default 'draft',          -- draft | open | closed
  notice    text,                          -- 장소·요일·준비물 안내
  unique(term_id, kind)
);

create table study_slots (                 -- 대면·단어 스터디 시간대
  id            bigint primary key,
  study_id      bigint references studies on delete cascade,
  start_time    time not null,
  end_time      time not null,
  capacity      int,                       -- null = 정원 없음
  applied_count int default 0,             -- study_signups 트리거가 유지 (직접 수정 불가)
  unique(study_id, start_time)
);

create table study_signups (               -- 스터디 신청. 한 스터디에 1건
  id        bigint primary key,
  study_id  bigint references studies,
  slot_id   bigint,                        -- (slot_id, study_id) → study_slots. 비대면은 null
  user_id   uuid references profiles,
  unique(study_id, user_id)
);

create table study_materials (             -- 비대면 자료. 하루 하나
  id        bigint primary key,
  study_id  bigint references studies,
  date      date not null,                 -- 이 날짜(KST)부터 신청자에게 공개
  title     text,
  file_path text unique, file_name text, file_size bigint, content_type text,
  unique(study_id, date)
);

create table homework_submissions (        -- 자료별 숙제 제출
  id          bigint primary key,
  material_id bigint references study_materials,
  user_id     uuid references profiles,
  status      text default 'submitted',    -- submitted | checked
  checked_by  uuid references profiles,
  checked_at  timestamptz,
  unique(material_id, user_id)
);

create table homework_files (              -- 제출 파일 (여러 장)
  id            bigint primary key,
  submission_id bigint references homework_submissions on delete cascade,
  file_path text unique, file_name text, file_size bigint, content_type text
);

create table lc_levels (                   -- LC 음원·교재 레벨 (마이그레이션 20260915103723)
  level      int primary key,              -- 650 | 750 | 850 … 행 추가만으로 탭이 생긴다
  sort_order int default 0
);

create table lc_books (                    -- LC 교재 (마이그레이션 20260915110833)
  id          bigint primary key,
  level       int not null references lc_levels,
  book_set    text not null,               -- 'A'(홀수달) | 'B'(짝수달)
  volume      int not null,                -- 권 (1, 2)
  title       text,                        -- 교재명 (60자, 비우면 "A반 1권")
  description text,                        -- 짧은 설명 (200자)
  cover_path text unique, cover_name text, cover_size bigint, cover_type text,
  unique(level, book_set, volume)          -- 칸은 레벨 트리거가 만들고 화면은 수정만
);

create table lc_audio_tracks (             -- LC 음원
  id        bigint primary key,
  book_id   bigint references lc_books,    -- 음원은 교재에 속한다
  title     text not null,                 -- 숫자 순서로 정렬 (Unit 1, 2, 10)
  file_path text unique, file_name text, file_size bigint, content_type text
);
-- 구버전 study_applications(비회원 자유 양식 신청)·lc_textbook_images(레벨별 이미지 묶음)는
-- 배포 후 정리 마이그레이션 20260915112851 에서 삭제했다.
```

---

## 상태 전이 (일 1회 배치)

> 구현: `private.run_daily_status_transition()` 을 pg_cron 이 매일 00:05 KST 에 실행한다.
> 날짜 비교는 전부 한국 시간(`private.today_kst()`) 기준. 예전 2개월 등록용 둘째 달 자동 배정
> (`private.resolve_pending_enrollments()`)도 이 배치와 트리거에 남아 있지만, 매달 등록이라 처리할 행이 없다.

```sql
-- 개강일 도래 → 예비등록생을 수강생으로
update enrollment_orders set status='active'
where status='preliminary' and activates_on <= current_date;

update profiles p set role='student'
where p.role in ('member','alumni')
  and exists (select 1 from enrollment_orders o
              where o.user_id=p.id and o.status='active');

-- 종강일 경과 → 만료
update enrollment_orders set status='expired'
where status='active' and access_until < current_date;

update profiles p set role='alumni'
where p.role='student'
  and not exists (select 1 from enrollment_orders o
                  where o.user_id=p.id and o.status='active');
```

---

## 화면

**공개**

| 경로 | 내용 |
|---|---|
| `/` | 역전토익 소개 (랜딩, 애니메이션) |
| `/student` | 수강생전용 소개: 6개 기능 카드. 수강생은 바로가기, 비수강생은 잠금 표시와 수강생이 되는 방법 |
| `/study` | 스터디 신청하기: 대면·비대면·단어 소개 + 이번 달·다음 달 일정. 그 달 수강생은 여기서 신청·시간대 변경·취소 |
| `/contact` | 연락하기 |
| `/login`, `/signup` | 로그인 / 회원가입 (실명·전화·대학·학과·성별) |

**수강생 `/my`**

| 경로 | 내용 | 필요 등급 |
|---|---|---|
| `/my` | 대시보드. 예비등록생이면 "N월 예비등록생" 표시. 스태프면 관리자 바로가기 버튼 | member |
| `/my/verify` | 등업신청: 수강증만 업로드 → 자동 등업 (개월수·현장/불라방 선택 없음) | member |
| `/my/class` | 내 시간표 (주5일이면 두 트랙 합집합) | student |
| `/my/live` | 불라방 입장 | student |
| `/my/textbook` | 불라방 교재주문 (불라방 수강생만) | student |
| `/my/replay` | 강의 다시보기. 종강일까지 | student |
| `/my/study` | 내 스터디: 신청한 스터디·시간대, 비대면 자료 받기(해당 날짜부터) | 그 달 수강생 |
| `/my/homework` | 숙제업로드: 비대면 자료별 사진·PDF 업로드, 점검 상태 | student |
| `/my/lc-audio` | LC 음원듣기: 레벨 카드 → A반·B반 교재 책장(표지·설명) → 교재별 음원 재생 | student |

**관리자 `/admin`**

| 경로 | 내용 | 필요 등급 |
|---|---|---|
| `/admin` | 대시보드: 학생명단 요약, 교재주문, 마케팅 분석 차트, 시간대별 인원수 위젯 | instructor |
| `/admin/students` | 학생명단: 등록생 / 예비등록생 / 졸업생 탭 | instructor |
| `/admin/sections` | 월별 반 개설, 트랙 편성, 캘린더 확정, 개강일·종강일 지정, 그 달 스터디 시간 설정 | instructor |
| `/admin/replays` | 녹화본 등록·회차 연결 | instructor |
| `/admin/verifications` | OCR 로그, 후보 점수, 오배정 정정 | instructor |
| `/admin/textbook-orders` | 교재주문 처리 | instructor |
| `/admin/analytics` | 마케팅 분석 (대학·학과·성별) | instructor |
| `/admin/study` | 스터디 신청자 명단 (월 · 유형 · 시간대별, 비대면은 숙제 제출 수) | instructor |
| `/admin/study-materials` | 비대면 자료 날짜별 등록·교체·삭제 (수업일 기준) | instructor |
| `/admin/homework` | 숙제점검: 날짜별 제출물·미제출자, 점검완료 | instructor |
| `/admin/lc-audio` | 레벨 탭 → A반·B반 교재 4권의 표지·교재명·설명, 교재별 음원 등록 | instructor |
| `/admin/contacts` | 문의 처리 | instructor |

---

## 미확정 — 구현 전에 반드시 Alan에게 질문할 것

1. **시간대·반 목록** — 어떤 시간대에 어떤 반이 열리는지. Alan이 정리해서 전달 예정.
   받기 전까지 시간대 값을 임의로 만들지 말 것.
   → **목표 점수반별 대표 시간은 확정** (2026-09-15): 650·750반 10:00~12:10 / 18:30~20:40 (750은 월수금반 현장, 화목금반 인강),
   850반 12:30~13:40 / 13:50~15:00. 랜딩 수업시간표가 `timetable_levels`·`timetable_slots` 에서 읽는다 (수정은 행만 바꾼다).
   매달 반 편성(`class_sections`)의 `time_block` 라벨·수강료는 여전히 미확정.
2. **수강료 실제 금액** — OCR 매칭 기준선. 확정 전까지 하드코딩 금지.
3. **OCR 판정이 애매할 때** — 1·2위 점수가 붙었을 때 어떻게 할지.
   (제안: 후보 3개를 학생에게 보여주고 직접 고르게 하면 관리자 개입 없이 오배정을 막을 수 있다.
   Alan 확정 필요.)
4. **편성 수정 시 기존 녹화본** — 학생 등록 후 강사가 회차를 빼면,
   그 날짜에 붙은 녹화본을 어떻게 할지. (삭제 / 경고 후 강사 확인)
5. **OCR 엔진** — 미선정. 수강증 실물 샘플을 받아 보고 결정.
6. **수강증 원본 보관 기간**
7. **도메인** — 현재 veterantoiec.com. 유지 여부 미정.

### 아직 논의되지 않음 (임의 구현 금지)
출결, 채점·점수(숙제제출은 점검완료 표시까지만), 성적·모의고사, 단어장, 오답노트, 일반 자료실, 알림 발송, 후기 작성 기능

### 확장 기능의 가정 (Alan 확인 전까지의 기본값)
- **교재신청**: 불라방 수강생만, 본인 반 기준, 배송지 입력. 결제 없음(교재비는 YBM/현장 처리). 상태 requested → confirmed → shipped
- **스터디 신청 자격**: 그 달 반에 배정된 수강생만 (예비등록생 포함). 비회원·일반 회원은 안내만 본다
- **스터디 신청 방식**: 신청 즉시 확정(스태프 승인 없음). 유형마다 시간대 1개. 본인 취소는 '신청 받는 중'일 때만, 그 뒤엔 스태프가 명단에서 취소
- **대면·단어 시간대**: 그 달 내내 같은 시간대(요일·장소는 안내 문구에 적는다). 정원은 선택
- **비대면 자료**: 해당 날짜 00:00(KST)부터 공개, 날짜마다 파일 1개. 목록은 그 달 반들의 수업일(session_dates) 합집합 + 직접 고른 날짜
- **숙제제출**: 비대면스터디 자료에 대한 제출만 (정규 수업 숙제 아님). 점검 전 / 점검완료 2단계
- **LC 음원**: 지금 수강 중인 수강생은 모든 레벨·반의 교재 음원을 들을 수 있다(기본 선택만 내 레벨·이번 달 반). 페이지에서 재생, 별도 다운로드 버튼 없음
- **교재 이미지**: LC 음원 페이지의 교재 표지 (교재신청 화면용 아님). 교재 한 권에 1장, 이미지당 10MB
- **연락하기**: 비회원 가능. 이름 + (전화 또는 이메일) + 메시지. 스태프만 열람
- **현장/불라방 구분**: `enrollments.mode` (onsite | live). OCR 은 수강료가 `tuition` 이면 onsite, `live_tuition` 이면 live 로 판정
- **가입 정보**: 실명, 전화, 대학, 학과, 성별(선택). 성별은 미응답 허용
