# 역전토익 홈페이지 — CLAUDE.md

부산 서면 YBM 어학원 소속 토익 브랜드 **역전토익**(강사: 이혜영 LC / 이영수 RC)의 수강생 학습관리 홈페이지. 원페이지 랜딩이 아니라 LMS 를 갖춘 사이트다.

## 이 문서를 쓰는 법 (2026-10-30)

- **여기에는 꼭 지킬 규칙만 둔다.** 경위 · 세부 · 확인 기록은 `docs/rules/` 의 주제별 파일에 있다 (맨 아래 "문서 지도").
  **기능을 고치기 전에 그 기능의 파일을 먼저 읽는다** — 파일이 크면 `Grep` 으로 필요한 곳만.
- **이 파일을 다시 길게 만들지 말 것.** 2026-10-30 에 이 파일이 54만 자(979KB)까지 커져, 질문마다 통째로 실리느라
  대화가 "Prompt is too long" 으로 멈췄다. 그래서 원문을 `docs/rules/` 로 옮겼다 (글자 하나 버리지 않았다).
  - 새 기능의 경위 · 세부는 해당 `docs/rules/*.md` 에 적는다 (없으면 새 파일을 만들고 문서 지도에 한 줄).
  - 여기에는 **어기면 깨지는 규칙만 한두 줄**로 더한다. 날짜별 경위 · 실측 · "확인한 것" 은 여기에 적지 않는다.
- 코드 주석의 "CLAUDE.md 등급 체계 N" · "도메인 규칙 N" 은 문서 지도의 파일을 가리킨다.

---

## 작업 원칙 (반드시 준수)

1. **요청하지 않은 기능을 추가하지 않는다.** 들어온 기능은 "구현 범위"(`docs/rules/scope.md`)뿐이다.
   좋아 보인다는 이유로 채점 · 단어장 · 오답노트 · 알림톡 · NFC 체크인 · 출결 경고 · 포인트 등을 끼워 넣지 말 것.
   기능이 들어온 날짜와 Alan 의 말은 `docs/rules/principles.md`.
2. **미확정 항목은 추측해서 구현하지 않는다.** 아래 "미확정" 에 해당하면 멈추고 Alan 에게 묻는다.
3. **결제 · 수강신청은 YBM 공식 사이트(ybmedu.com)에서만.** 예외는 불라방 교재비 **안내**뿐이다 — 강사가 등록한 계좌 · 금액을 보여 주고 입금자명을 받으며,
   돈은 이 사이트를 지나지 않는다. 카드 · 간편결제를 붙이지 말 것.
4. **반 · 시간대 · 수강료 · 레벨 · 강사 이름 같은 운영 데이터는 DB 에서 읽는다. 코드에 하드코딩 금지.**
5. **"다 잡혔다" 고 말하기 전에 무엇을 훑었는지 적는다.** 한 파일을 보고 전체를 말하면 또 틀린다.
6. **이 작업 환경은 운영 Supabase 로 못 나간다.** 운영 DB 의 지금 상태(반이 있다 · 없다 등)를 문서로 단정하지 말고 Alan 에게 묻는다.
   실기기(아이폰 · 갤럭시)로 못 본 것은 못 봤다고 말한다.

---

## 등급 체계 — 손대기 전에 꼭 본다 (자세히: `docs/rules/roles.md`, `docs/rules/d3-roles.md`)

> 권한이 걸린 곳은 조용히 틀린다 — 화면은 열리는데 데이터가 안 오거나, **막아야 할 사람에게 열린다.** 어기면 `npm test`(`src/lib/roles.test.ts`)가 깨진다.

| 등급 | 관리자 화면 | 학생 화면 |
|---|---|---|
| `admin`(알런) · `instructor`(이혜영 · 이영수) | **전부** — 둘은 권한이 같다 | 전부 |
| `assistant`(조교) | **열한 개만** — 출석 · 등업 로그 · 교재주문 · 불라방 링크 · 스터디 신청자 · 숙제점검 · 비대면 자료 · 비대면스터디 인증 · 숙제 미제출 알림 · 직원 게시판 · 알림 설정(등업신청 · 교재주문 알림만). **학생명단 · 반 배정 · 등급 변경 없음.** 학생 정보는 **이름만** | 전부 |
| `student` | 없음 | 배정된 반 (개강일~종강일) |
| `member` · `alumni` · `guest` | 없음 | 잠금 안내만 |

1. **DB 와 앱은 늘 같은 집합이다.** `private.is_admin()` ↔ `isAdmin()`, `private.is_crew()` ↔ `isCrew()`.
2. **조교 때문에 `is_staff()` 를 넓히지 말 것.** 조교에게 열 자리에만 `is_crew()`.
3. **새 관리자 화면 · 서버 액션 · 라우트의 맨 위에 `requireStaff()`**(조교에게 열 것만 `requireCrew()`). `/admin` 레이아웃은 조교를 통과시키므로 레이아웃만 믿지 않는다.
4. **메뉴에서 빼는 것은 권한이 아니다.** 입구는 `canEnterAdminPath(role, 경로)`(`src/lib/supabase/proxy.ts`) 한곳 — 진짜 등급 · 가장 긴 주소로 판정.
5. **등급 변경은 서비스 롤로 하지 않는다** (로그인한 사람의 세션 UPDATE). **마지막 관리자는 강등 불가.** 바꿀 수 있는 사람은 `canAssignRole()` = 강사 · 관리자.
6. **`profiles.test_role` · `profiles.subject` 는 authenticated 가 못 쓴다** (grant 에 없다).
7. **profiles 정책 안에서 profiles 를 다시 조회하지 말 것** — 42P17 무한 재귀. 필요한 값은 security definer 함수(`private.my_real_role()` 등)로.
8. **enum 값 추가는 그 마이그레이션 파일 하나에만** — 같은 트랜잭션에서 쓰면 55P04.
9. **강사 계정은 이혜영 · 이영수 고정.** 이름 예약(`private.reserved_staff`)은 한 번 쓰면 잠긴다 — 학생에게 주소를 알린 뒤 새 이름을 예약하지 말 것.
   - **조교 화면을 더하려면(`crew: true`) Alan 에게 먼저 묻는다** — 메뉴 · 입구 · 화면 가드가 함께 열린다. `nav-admin.test.ts` 가 열한 화면을 못박는다.
   - **조교에게는 학생 정보 중 이름 · 등급만 — DB 가 막는다.** `profiles` 조회 정책에 조교 갈래를 다시 넣지 말 것. 조교 화면의 이름은 `getProfileNames`(→ `public.profile_names`),
     번호는 `getStaffPhones`(강사 · 관리자만). 조교가 부르는 DB 함수는 개인정보 칸을 돌려주지 않는다. 수강생 설문은 조교에게 닫혀 있다(`is_staff`).
10. **★ 학생 화면(`/my`)에서 "내 것" 을 RLS 에만 맡기지 말 것.** 정책이 대부분 `… or is_staff()` 라 강사 · 관리자에게는 모든 반 · 학생이 열린다.
    `/my` 조회는 `public.my_section_ids()`(내 반) · `user_id`(내 행) 등으로 한 번 더 좁힌다. **좁히는 집합은 RLS 가 여는 집합보다 넓게**, 조회가 실패하면 좁히지 않는다.
    레벨을 화면에서 숫자로 거르지 않는다(`my_section_ids()` 가 곧 내 레벨). **새 `/my` 조회를 만들면 `src/app/my/_lib/queries.test.ts` 의 표 목록도 늘린다.**
    학생이 부르는 DB 함수(`.rpc`)는 전부 `auth.uid()` 로 거른다.
- 테스터: 강사 · 관리자만 `test_role` 을 켠다. 학생 판정은 `effectiveRole`, 관리자 출입은 진짜 등급. 반 배정 · 승인은 `promoteToStudent()` 로 test_role 도 올린다 (내리지는 않는다).
- **합쳐진 옛 계정(`merged_into`)은 강사 등급 그대로 남는다** — 등급으로 사람을 고르는 목록 · 수 세기에는 `.is("merged_into", null)` (`merged-accounts.test.ts`).
- 반에 배정된 **강사 · 관리자 계정은 명단 · 숙제 미제출 · 출석 · 특강 신청 수에서 빼고, 조교는 `조교` 표로 세운다** — `src/lib/roster-accounts.ts` 한곳.

---

## 보안 — 이 상태를 깨지 않는다 (자세히: `docs/rules/security.md`)

- **새 표는 RLS 켜기 + 정책 + grant 를 한 마이그레이션에.** 학생이 직접 넣는 표의 insert 는 **칸 단위 grant**(정책이 보지 않는 칸을 열어 두지 않는다).
- **조회 정책은 스태프(조교) 확인을 맨 앞에** — `(select private.is_crew()) or (select private.has_section_access(…)) or …` (`navigation-speed.test.ts`).
- **버킷은 전부 private.** 파일은 `/files/{kind}/{id}` 가 **사용자 세션으로 행을 읽고(RLS)** 서명 URL 로 보낸다. 서비스 롤로 모두가 같은 주소를 쓰는 것은 **LC 교재 표지 하나뿐**(`stableCoverUrl`) — 학생 개인 파일에 쓰지 말 것.
- 서비스 롤은 서버(`server-only`)에서만. 비밀은 `.env*` 에만. **저장소가 공개다** — 계좌번호 · 실명 수강증 · 비밀 값을 코드 · 마이그레이션 · 테스트 · 문서에 넣지 말 것.
- API 라우트(웹훅 · 크론)는 비밀이 없거나 못 읽으면 **거절(fail-closed)**, 비교는 `timingSafeEqual`, 크론 호출은 `authorizedAppCall()`.
- 로그인 뒤 이동 주소는 `safeNextPath` 한곳. 화면 안 `redirect()` 는 진짜 307 이 아니다 — **막아야 할 주소는 `proxy.ts` 에서 막는다.**
- **화면(GET) 로그인 확인은 `getClaims()`, 서버 액션(쓰기)은 `getUser()`** — `getSessionUser` 가 서버 액션 요청이면 스스로 `getUser()`(`isActionRequest`). Next 판을 올리면 `auth-session.test.ts` 를 다시 본다.
- HTML 을 저장하거나 `dangerouslySetInnerHTML` 로 넣지 말 것 (상수 · JSON-LD 만 예외, `<` 이스케이프). 외부 주소를 href · src 에 세울 때는 `https?://` 만.
- OCR 은 서버에서 자체 실행(tesseract.js) — 실명이 밖으로 나가지 않는다. 전처리 실패면 원본으로 읽지 않는다. SVG 는 읽지 않는다(`sharp.block`).
- **`npm audit --omit=dev` 는 0 이어야 한다.** 버전 한 줄로 끝나는 패치를 미루지 않는다.
- 하지 않기로 정한 것: **CSP · 강사 · 관리자 2단계 인증** (Alan). 먼저 만들지 말 것.

---

## 배포 · 마이그레이션 (자세히: `docs/rules/stack.md`)

- Next.js(App Router) + TypeScript + Supabase. **`main` 에 올리면 Vercel 배포와 Supabase 마이그레이션이 저절로 된다** — `supabase db push` 를 따로 하지 않는다.
- **끝낸 일은 `main` 에 머지해 둔다** (다른 세션 · 워크트리가 받아 간다).
- 마이그레이션 파일을 만들기 전 `ls supabase/migrations | tail` 로 마지막 번호를 보고 그보다 뒤 번호를 쓴다. **번호가 겹치면 뒤 파일은 조용히 건너뛴다.**
  **main 에 합친 뒤 push 하기 전에 `npx vitest run src/lib/migrations.test.ts`** 를 다시 돌린다.
- **없는 정책을 `drop policy` 하면 배포가 통째로 실패한다** — 살아 있는 이름은 마이그레이션 재생(`migrations.test.ts`)으로 확인.
- 배포 전 확인: `npx tsc --noEmit && npx eslint src && npx vitest run && NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 npm run build`
  (이 환경에서 빌드는 Supabase 로 못 나가 멈추므로 닿지 않는 주소를 준다). OCR 을 건드렸으면 `npm run ocr:check`.
- 이름이 바뀌는 칸 · 표는 **두 번에 나눠 배포**한다(넓히기 → 새 앱 확인 → 좁히기). 배포 사이 옛 앱이 몇 분 돈다.
- 미리보기 브랜치(Preview branches)는 켜지 않는다 (별도 과금).
- DB 크론 → 우리 API 는 `private.call_app('/api/cron/…')`(주소 `private.app_config.site_url`). **환경변수 · 자동 작업 · 버킷 · 외부 연결을 바꾸면 `docs/HANDOVER.md` 부록도 고친다.**
  인수인계 문서의 항목 번호(`0-1` · `3-B`)를 바꾸면 체크가 사라진다.
- 커밋 작성자를 Alan 주소로 바꾸는 일 · 저장소 비공개 전환은 **Alan 의 허락을 기다린다** (순서는 `security.md` "Alan 이 정할 것").

---

## 코드 규칙 — 어기면 조용히 틀린다

- **새 서버 액션은 끝에 `revalidatePath`** — 안 부르면 저장한 사람이 30초 동안 옛 화면을 본다. `staleTimes.dynamic: 30` 을 늘리지 말 것 (`docs/rules/speed.md`).
- 구역 레이아웃(`my/layout.tsx` · `admin/layout.tsx`)에 무거운 조회를 넣지 말 것. 수강생전용 화면은 `loadGated(기능, () => Promise.all([...]))` — 잠금 판정과 데이터를 함께.
- 고르기 · 체크 칸이나 `defaultValue` 칸이 있는 `<form action>` 은 **`onSubmit={submitWithoutReset(action)}`** (React 19 폼 초기화 함정, `form-submit.test.ts`).
- 물음표 뒤(`?term` · `?date` · `?level`)만 바뀌는 화면의 클라이언트 조각에는 **`key`** — 앞 화면 상태가 남는다 (`stale-state.test.ts`).
- 팝업 효과는 열림(`open`)에만 묶고 부르는 쪽 콜백은 `useEffectEvent`. **새 `fixed inset-0` 팝업 · 서랍에는 `follow-screen`**, 바닥에 붙는 저장 · 선택 막대는 **`bar-above-nav`** (`visible-viewport.test.ts`).
- 파일을 올린 뒤 등록하는 화면은 **등록을 보낸 뒤(`sent`) 끊기면 지우지 않는다**. 서버는 저장 단계를 넘긴 뒤 실패하면 `filesSaved` 를 돌려준다.
- **지우기 전에 남은 것을 세는 조회가 실패하면 지우지 않는다. UPDATE · DELETE 는 바뀐 줄을 센다**(RLS 는 오류 없이 0줄). **읽기 오류를 빈 목록으로 판정하지 않는다.**
- 1,000줄을 넘을 수 있는 조회는 `readAll`, id 목록을 싣는 조회는 `readAllIn` (`src/lib/read-all.ts`).
- PDF · Word 받기 버튼은 `FileDownloadButton`, 파일 라우트의 글 오류에는 `x-file-message: 1` (`file-download.test.ts`).
- 새 로그아웃 폼에는 `PushLogoutField`. 시간대가 있는 반을 넣는 길은 `public.open_month_sections` 만 (`month-open.test.ts`).
- 학생 알림함에 새 종류를 더하면 DB check(`student_messages_kind_check`)와 알림함 버튼을 함께. 학생 휴대폰 푸시 종류(`live_start` · `homework_missing`)를 늘리려면 Alan 에게 묻는다.
- 글 편집기(`NoteEditor`)의 저장 값은 꺾쇠 태그 글이다 — 정해 둔 클래스만 붙여 그린다. 글자로 적은 `[` 는 `LITERAL_MARK` 규칙을 지킨다 (`docs/rules/note-editor.md`).
- `Reveal` 의 `threshold` 는 0 — 올리면 긴 카드가 영영 안 보인다.

---

## 디자인 — 늘 적용 (자세히: `docs/rules/design-*.md`)

- **학생 모드 · 랜딩 · 공개 페이지는 핫핑크**(brand #FF2E88 · hover #E61E75 · tint #FFE4EF · ink #17121F). **관리자 모드(`/admin`)는 토스 모양(파랑 · 회색 바탕 · 흰 카드)** —
  `globals.css` 의 `:root:has([data-admin-theme])` 한 블록이 토큰만 덮는다. **관리자 화면에 핑크 hex 를 직접 적지 말 것**(토큰을 쓴다, `admin-theme.test.ts`).
- **기본 이모지 절대 금지.** 아이콘 · 일러스트는 힉스필드로 만든 `public/` 자산만, 아이콘은 `<Icon name="…" />`. 작은 줄 아이콘 · 재생 버튼 같은 것만 인라인 SVG 도형.
  예외: 간편 로그인 · 카카오톡 상담 · 네이버 예약 자리의 **카카오 · 구글 · 네이버 표식**(`BrandMarks.tsx`)과 **YBM 로고**는 원래 모양 · 색 그대로.
- **강사 실사는 히어로 투샷과 강사 소개 카드 두 곳뿐**, 나머지 강사 그림은 캐리커처(`site.instructors[].caricatures` — 첫 장은 출석 포스터가 읽는다). 강사를 AI 로 그리지 말 것.
- 명단의 이름 · 전화번호는 검은 글자(누르는 값에는 연분홍 밑줄). **학생명단은 표가 아니라 카드**(PC 기본은 반별 명단). 관리자 필터 줄은 `FilterTabs` 한곳 —
  한 화면에 줄 셋 이상 쌓지 않는다, `전체` 칸을 되살리지 않는다.
- 랜딩 구간에 어두운 바탕 띠를 두지 않는다. 공개 라우트를 더하면 `app/sitemap.ts` · `app/robots.ts` 를 같이 고친다.
- 하단 바 다섯 칸은 `홈 · LC음원 · 숙제제출 · 불라방 · 마이` (`NAV_BOTTOM`). 헤더 아래 두 번째 메뉴 줄은 없다(햄버거 서랍 `NAV_DRAWER` 한곳).
  모드(관리자 ↔ 학생)는 저장하지 않고 주소로 정한다 — 강사 · 관리자의 `/my` 첫 문서 요청만 `/admin` 으로 돌린다(`staff-landing.ts`).
- "다시 넣지 말 것" 목록(되살리면 Alan 이 지운 것을 되돌린다): 대시보드 처리 대기의 설명 줄 · 예비등록생 · 졸업생 위젯 · 시간대별 인원수 합계 줄 · `/my` 등급 칩 ·
  랜딩 흐르는 띠(marquee) · 랜딩 "N월 개설 반" 목록 · 투샷 목표 카드 · `10분 전 입장` 문구 · 스터디 신청자 · 출석 명단 · 특강 명단의 전화번호 · 사진 자리의 이름 첫 글자.
  각 경위는 해당 design · 도메인 파일에 있다.

---

## 도메인 — 핵심만 (기능을 고칠 때는 그 파일을 읽는다)

- **개강일 · 종강일(강사가 반 편성 달력에서 기수마다 정한다)이 모든 것의 기준이다.** 권한 · 등록 상태 · 등급 · 출석 · "지금 기수" 가 이 날짜로 정해지고, 바꾸면 그 즉시 따라간다.
  등록 상태는 저장할 때 트리거가 날짜로 계산한다. **달력의 월(1일~말일)로 판정하는 코드를 새로 만들지 말 것** — 지금 기수는 `pickCurrentTerm`(`term-window.ts`). (`d2-term-dates.md` · `status-transition.md`)
- **수업 편성은 강사가 매달** — 고정 패턴을 코드에 넣지 않는다. 진실은 기수 달력 `term_class_dates`(한 날짜 = 한 트랙 = 한 기수, 금요일 격주). 반의 회차는 거기서 파생된다.
  **평달은 달력을 저장하면 시간표 · 반이 저절로**(10분 확인 포함), **방학달(1 · 2 · 7 · 8월)만 강사가 직접** 연다. 시간표는 달마다 한 벌이고 반이 그 칸을 따라간다. (`d1-schedule.md`)
- **주5일 = 같은 기수 · 강좌 · 시간대의 월수금 + 화목금 두 반.** 학생에게는 `주5일` 한 가지로 보인다(`week5.ts`). 관리자 편성은 트랙 그대로, 명단 · 학생 관리만 합친다.
  60분 반과 120분(묶음) 반은 다른 등록이다. 과정 A/B 와 과목 LC/RC 는 시간표의 시간대마다 정한다 — **"홀수달 = A" 처럼 달로 짐작하지 말 것.**
- **반 권한(묶음 반 · 속성반 · 2주완성이 품는 반)은 DB `private.section_includes` 한곳** — 화면에서 따로 계산하지 말 것(표시용 `sectionPackages` 만 예외).
  그릇 반 판정은 `isContainerProgram` 한곳(`program === "sparta"` 로 가르지 말 것). 2주완성 종강일 = `private.term_half_date` = 앱 `termHalfDate` (바꾸면 둘 다). (`d1-section-access.md` · `d1-twoweek.md`)
- **담당 강사는 반의 과목으로 DB 가 저절로 정한다** — 반을 만들 때 만든 사람을 담당으로 넣지 말 것. 묶음 · 속성 · 2주완성 반은 담당 null.
- **불라방**: 링크는 시간 단위 반에, 다시보기로 올라가는 것은 유튜브 주소뿐, 강사가 넣은 링크(Zoom)는 덮어쓰지 않는다. 시작 알림 문구는 SQL(`private.notify_live_session`) 한곳. (`d1-live.md`)
- **수강생전용**: 불라방교재주문만 예비등록생부터, 나머지는 개강일~종강일 배정이 있을 때 — **강사 · 관리자 · 조교도 학생 모드에서는 같은 판정**. (`d4-1-student-only.md`)
- **등업신청**: 근거가 있을 때만 거절한다(못 읽었으면 검토 대기). 자동 승인 조건은 `src/lib/auto-approve.ts` 한곳 — 반 대조는 키로 거른다. 긴급 스위치는 **읽지 못하면 꺼진 것**.
  학생에게 "위조 의심" 을 말하지 않는다. 다음 달 수강증은 받아 뒀다 그 달 반이 열리면 같은 조건으로 맞춘다. 수동 등업신청의 고른 반은 배정이 아니다. (`d4-2-verify.md` · `ocr.md`)
  OCR 판정에 쓰는 값을 늘리면 판독 멈춤 기준(`readEnoughFor`)에도 넣는다.
- **숙제와 비대면 스터디 인증은 완전히 다른 일이다** — 표 · 화면 · 알림을 섞지 말고 서로 가리키지도 않는다. 숙제 기한 = 같은 트랙 다음 수업일 오후 5시(`HOMEWORK_DUE_TIME`).
  미제출 셈은 `homework-missing.ts` 한곳이고 제출률도 같은 셈이다. 미제출 알림은 기본으로 받고 '알림 안 받기' 만 빠진다 (신청 방식으로 되돌리지 말 것). 숙제 질문 칸은 없다. (`d7-homework.md` · `d6-2-checkins.md`)
- **강사가 아닌 사람(조교 · 관리자)이 학생에게 보낸 숙제 점검 · 미제출 · 인증 확인 알림에는 그 사람 이름이 가지 않는다** — DB 트리거가 과목 선생님 이름(인증은 빈 이름)으로 바꾼다. 조교 발송 정책에 "자기 이름" 조건을 되살리지 말 것.
- **특강**: 무슨 특강 하나 + 신청 방식. **신청은 강사가 `신청 받기` 를 눌러야 열린다**(7일 전 자동 열림 금지). 강사 · 관리자 시험 신청은 세지 않는다(`staff_test`). 단과는 제 과목 특강만. 특강 자료실은 신청한 학생만. (`d6-1-lectures.md`)
- **교재주문**: 주문은 DB 함수 `create_textbook_order` 로만, 교재는 **내 반 교재 고정**(체크 칸으로 되돌리지 말 것), 금액확인은 강사 · 관리자, 조교는 상태 · 송장만. 받는 곳은 `PICKUP_PLACE` 한곳. (`d7-1-textbook.md`)
- **출석**: 한 번 찍으면 출석, 수업 시작 뒤 1초라도 지각, 결석은 한 단어(`미출석` 금지). 규칙을 바꾸면 SQL · `attendance.ts` · 포스터 문구를 같이. (`d7-2-attendance.md`)
- **수업자료실 · LC 음원**: 내 반의 과정 칸, 그 회차 수업일부터 열린다 — DB(`my_round_cells` · `my_open_rounds`)와 화면(`class-rounds.ts`)이 같은 규칙 (바꾸면 둘 다). (`d7-4-class-materials.md` · `d7-lc-audio.md`)
- **알림은 웹 푸시만**(문자 · 이메일 · 카톡 없음). 네이버 예약은 응답을 기본값으로 메우지 않고 예약자를 조회하지 않는다. (`d8-notifications.md` · `d8-1-student-push.md`)

---

## 아직 안 된 것 · Alan 이 정할 것

- **SMTP** (출시를 막는 유일한 항목 — 기본 메일러는 시간당 몇 통이라 방학 가입이 막힌다). CAPTCHA · 속도 제한(학원 와이파이는 IP 공유 — 넉넉히). JWT 비대칭 키 확인. 저장소 비공개 + 커밋 작성자. 개인정보처리방침 보호책임자 이름.
- 대답을 기다리는 것: 비대면 인증 독촉의 보낸 이름, 이미 가진 교재 빼기 허락, 숙제 · 인증 · 프로필 사진에 오래 사는 주소 쓰기.

## 미확정 — 구현 전에 반드시 Alan 에게 묻는다 (원문: `docs/rules/open-questions.md`)

- **4.** 편성 수정 시 기존 녹화본 — 지금은 다시보기가 붙은 날짜를 달력에서 뺄 수 없다(막아 둠).
- **8.** YBM 수강후기 **수집기** · 특강 라이브 시청 링크 — 만들지 말 것.
- **12.** 주3일 2주완성의 교재 권수. **방학달(1 · 2월)의 교재 규칙 · 통짜 반 불라방 자동 연결**은 그 달이 오기 전에 묻는다.
- 방학달 시간표의 실제 시각은 해마다 브로슈어대로 강사가 고친다.
- **아직 논의되지 않음(임의 구현 금지)**: 출결 경고 · 교차수강 · 포인트 · NFC · 비콘, 채점 · 점수 · 성적 · 모의고사, 단어장, 오답노트, 일반 자료실,
  학생 대상 문자 · 알림톡 · 그 밖의 학생 푸시, 후기 작성 기능.

---

## 문서 지도 — `docs/rules/`

| 찾는 것 | 파일 |
|---|---|
| 작업 원칙 원문 · 기능이 들어온 날짜 | `principles.md` · 구현 범위 표 `scope.md` · 화면 목록 `screens.md` |
| 등급 체계 1~10 원문 (조교 열한 화면 · 이름만 · `/my` 좁히기) | `roles.md` |
| 보안 점검 · 전체 보안 검토 · 2026-10-29 전체 버그 점검 · 아직 안 된 것 | `security.md` |
| 기술 스택 · 배포 · 마이그레이션 함정 · DB 크론 · 인수인계 · 워크트리 | `stack.md` |
| 화면 전환 속도 (화면 틀 · 30초 기억 · getClaims · 정책 순서 · 표지 주소) | `speed.md` |
| 디자인: 테마 · 학생명단 · 내비/PWA · /my · 랜딩 · 헤더/모드 · 자산 | `design-theme.md` · `design-roster.md` · `design-nav-pwa.md` · `design-my.md` · `design-landing.md` · `design-header-mode.md` · `design-assets.md` |
| 관리자 대시보드 위젯 | `dashboard.md` |
| 도메인 1 수업 편성 · 달력 · 평달 자동 · 시간표 · 담당 강사 | `d1-schedule.md` |
| 도메인 1 850 2주완성 · 반 권한 · 내 시간표 · 불라방/다시보기/유튜브 | `d1-twoweek.md` · `d1-section-access.md` · `d1-live.md` |
| 도메인 2 개강일 · 종강일 / 도메인 3 등급 / 3-1 계정 통합 | `d2-term-dates.md` · `d3-roles.md` · `d3-1-accounts.md` |
| 도메인 4 매달 등록 / 4-2 등업신청 / 4-1 · 5 수강생전용 · 예비등록생 | `d4-enrollment.md` · `d4-2-verify.md` · `d4-1-student-only.md` |
| 도메인 6 스터디 / 6-1 특강 / 6-2 비대면 인증 · 알림함 | `d6-study.md` · `d6-1-lectures.md` · `d6-2-checkins.md` |
| 도메인 7 숙제 · 미제출 알림 · 제출률 / LC 음원 | `d7-homework.md` · `d7-lc-audio.md` |
| 도메인 7-1 교재주문 / 7-2 출석 / 7-3 문의 답변 | `d7-1-textbook.md` · `d7-2-attendance.md` · `d7-3-contact.md` |
| 도메인 7-4 수업자료실 · 공지 / 글 편집기(붙여 넣기 · 표) | `d7-4-class-materials.md` · `note-editor.md` |
| 도메인 7-5 직원 게시판 / 7-6 수강생 설문 | `d7-5-staff-board.md` · `d7-6-survey.md` |
| 도메인 8 관리자 알림 · 네이버 예약 / 8-1 학생 휴대폰 알림 | `d8-notifications.md` · `d8-1-student-push.md` |
| 수강증 OCR 파이프라인 · 표기 규칙 | `ocr.md` |
| 데이터 모델 (표 · 칸 · DB 함수) / 상태 전이 · 월 넘김 점검 | `data-model.md` · `status-transition.md` |
| 미확정 원문 · 확장 기능의 가정 | `open-questions.md` |
| 소유권 넘기기 체크리스트 (관리자 `운영 → 인수인계` 가 그린다) | `docs/HANDOVER.md` |
