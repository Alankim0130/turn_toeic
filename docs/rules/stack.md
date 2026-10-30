<!-- CLAUDE.md 에서 옮긴 원문 (2026-10-30, 원래 289~356줄). 꼭 지킬 규칙의 요약은 CLAUDE.md — 여기는 경위 · 세부 · 확인 기록이다. -->
<!-- 기술 스택 · 배포 · 마이그레이션 자동 적용과 함정 · OCR · DB 크론 · 인수인계 · 워크트리 -->

## 기술 스택

- **Next.js** (App Router) + TypeScript
- **Supabase** — Auth, Postgres, Storage, Edge Functions, RLS
- 배포: Vercel (`main` 에 푸시하면 자동 배포)
- **DB 마이그레이션도 `main` 에 머지하면 자동 적용된다** (2026-09-16 Alan 설정 — Supabase 의 GitHub 연동:
  Deploy to production 켬 / production branch `main` / working directory `.`).
  그래서 `supabase/migrations/` 에 파일을 더하고 머지하면 끝이다 — **노트북에서 `supabase db push` 를 따로 하지 않는다.**
  적용 결과는 Supabase 대시보드 `Database → Migrations` 에서 확인한다.
  마이그레이션이 실패하면 그 푸시의 배포가 실패로 뜨므로, 파일을 올리기 전에 문법·데이터 안전성을 확인할 것.
  **없는 정책을 `drop policy` 하면 그 배포가 통째로 실패한다** — 정책은 이름이 바뀌어 있을 수 있다
  (2026-09-19 에 `drop policy "verifications: 스태프 조회"` 를 쓸 뻔했는데, 그 이름은 이미 20260915045300 에서
  `"verifications: 본인·스태프 조회"` 로 합쳐져 사라진 뒤였다). **지금 살아 있는 이름은 마이그레이션을 파일 순서대로
  재생해 확인한다** — `src/lib/migrations.test.ts` 가 `npm test` 에서 그 재생을 자동으로 한다.
  **★ 버전 번호(파일 이름 앞 14자리)가 겹치는 파일이 둘이면 뒤 것은 조용히 건너뛴다** (2026-10-01 실제로 겪었다 — 다른 세션이 같은 날
  `20261001130000_ybm_review_stats.sql` 을 올려 둔 것을 못 보고 같은 번호로 `youtube_stream_replay` 를 만들어 머지했더니, 배포는 성공으로
  뜨는데 표가 안 생겨 **반 상세 수업일 표가 빈 채로** 떴다. `20261001140000` 으로 바꿔 다시 머지했다). 파일을 만들기 전에
  `ls supabase/migrations | tail` 로 마지막 번호를 보고 그보다 뒤 번호를 쓸 것 — 같은 테스트가 겹침도 잡는다.
  **main 에 합친 뒤 push 하기 전에도 다시 본다** (2026-10-07 — 만들 때는 비어 있던 `20261007100000` 을 그 사이 다른 세션이 main 에 먼저 올려,
  합치는 순간 겹쳤다. Supabase 가 그 push 의 적용을 `schema_migrations_pkey` 중복으로 멈췄고(사이트는 이미 새 코드로 떠 있었다) 번호를 `20261007110000` 으로 옮겨 다시 올렸다).
  합친 결과에서 `npx vitest run src/lib/migrations.test.ts` 한 번이면 잡힌다 — 브랜치에서만 돌린 테스트는 합친 뒤의 겹침을 못 본다.
  **미리보기 브랜치(Preview branches)는 켜지 않는다** — Branching Compute 는 별도 과금이다.
- OCR: **tesseract.js 한국어, 서버에서 자체 실행** (`src/lib/ocr.ts` — 미확정 5 에서 확정됐다).
  외부 OCR API 를 부르지 않는다 — 수강증의 실명이 밖으로 나가지 않게 하려는 것이다
- **DB 크론 → 우리 API** (2026-09-21, 마이그레이션 20260921100500). 10분·30초 간격으로 외부(네이버·유튜브)를 부르고 강사에게 웹 푸시를
  보내야 하는 일은 **pg_cron 이 pg_net 으로 우리 API 를 부르게** 했다 — `private.call_app('/api/cron/…')`.
  Vercel 크론은 요금제에 따라 하루 한 번만 되고, Edge Function 은 저장소에 없어 배포 길을 늘리지 않았다.
  - 부르는 주소는 `private.app_config` 의 `site_url`(`https://winnertoeic.com`). **도메인을 옮기면 이 한 줄을 고친다** (docs/HANDOVER.md).
  - 비밀은 Vault 의 `app_cron_secret` — **마이그레이션이 DB 안에서 만들었고 저장소·환경변수 어디에도 값이 없다.**
    API 는 `authorizedAppCall()`(`src/lib/cron-auth.ts`)이 service_role 로 `public.app_cron_secret()` 을 읽어 `x-app-cron-secret` 과
    `timingSafeEqual` 로 비교한다. 손으로 부를 때는 `Authorization: Bearer <CRON_SECRET>` 도 받는다.
  - **pg_net 은 비동기라 크론 기록의 '성공' 은 결과가 아니다.** 실제 응답은 `net._http_response`(6시간 보관)에서 본다:
    `select status_code, left(content, 200), created from net._http_response order by created desc limit 10;`
  - 크론 기록은 `cron-history-cleanup` 이 7일치만 남긴다

**소유권을 넘길 때는 `docs/HANDOVER.md` 를 본다** (2026-09-21 Alan — "소유권 전체를 다 넘겨줘야할것 같아" ·
**"완전히 손을 때는거야"** → 2026-10-04 Alan "체크리스트를 하나 만들어주면 좋겠어 … 하나의 체크리스트를 완성할때 해야하는 방법도 같이 … 최대한 자세하게").
소유권은 코드 한 곳이 아니라 **열한 곳에 흩어져 있다** — 사이트 `admin` 계정 · Supabase · Vercel · 도메인 · GitHub · 구글 클라우드(구글 로그인 · 유튜브 자동 연결) ·
서치 콘솔 · 카카오 디벨로퍼스 · 카카오톡 상담 채널 · 네이버 서치어드바이저 · 그 밖의 링크(네이버 예약 · YBM · 인스타그램 · 랜딩 소개 영상).
그 문서는 **단계마다 체크 칸 + 방법 + 확인**으로 된 체크리스트이고(0 준비 → 1 개인정보 → 2 사이트 관리자 → 3 Supabase → 4 Vercel·도메인 → 5 GitHub → 6 구글 → 7 카카오 →
8 네이버 등 → 9 확인 → 10 빼기 + 운영 · 부록), 같은 내용을 Alan 의 Claude 문서(체크리스트)로도 만들었다.
**사이트 관리자 메뉴 `운영 → 인수인계`(`/admin/handover`)가 이 파일을 그대로 그린다** (2026-10-04 Alan "햄버거 메뉴에서 인수인계 안보여") — 강사·관리자만, 체크는 DB `handover_checks` 에
저장돼 Alan 과 인수자(2단계에서 관리자가 된다)가 같은 진행을 본다. 판독은 `src/lib/handover.ts`(`handover.test.ts` 가 **실제 파일로** 못 읽는 꼴 · 빠진 항목 · 단계 없는 항목을 잡는다).
**체크는 항목 번호(`0-1` · `3-B`)로 저장한다 — 번호를 바꾸면 그 항목의 체크가 화면에서 사라진다.** 문서를 고칠 때는 `- [ ] **N-X 제목**` + 두 칸 들여 쓴 `1. 단계` 꼴을 지킬 것
(표 · 목록 · 문단 · 굵게 · 코드 · 링크만 읽는다). 운영에서는 `next.config.ts` 의 `outputFileTracingIncludes["/admin/handover"]` 로 이 파일이 함수에 실린다.
**코드에는 Alan 개인 정보가 없다.** 넘길 때 고칠 코드는 개인정보처리방침(`/privacy`) 9항의 책임자 칸 하나다 (6항 "실명은 본인이 직접 바꿀 수 없고" 처럼 지금 사이트와
어긋났던 문장들은 2026-10-04 에 고쳤다 — 공개 페이지 표의 `/privacy`). 개인정보 이전 통지(개인정보 보호법 제27조)가 필요한지는 운영 주체가 바뀌는지에 달려 그 문서 1단계에서 전문가에게 확인하게 했다.
**환경변수 · 자동 작업(pg_cron · Vercel Cron) · 저장소 버킷 · 외부 연결을 늘리거나 바꾸면 그 문서의 부록 표도 같이 고친다** — 인수자가 세는 목록이다.
**완전 이관이라 되돌릴 사람이 없다** — 그 문서의 순서(더하기 → 확인 → 빼기)를 거꾸로 하지 말 것.

**다른 워크트리에서 바로 확인하기** (2026-09-17 Alan 요청). 세션마다 워크트리가 따로 있으므로
**끝낸 일은 `main` 에 머지해 두어야 다른 워크트리가 받아 간다** (브랜치에만 있으면 안 보인다).
받는 쪽은 세 가지가 필요하다 — 앞의 둘은 **깃에 없다**(`.gitignore`):
```
git -C <워크트리> pull origin main
npm install                    # node_modules 는 워크트리마다 따로
cp <기존 워크트리>/.env.local .    # .env* 는 깃에 안 올라간다 (.env.example 만 있다)
npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
```
- 워크트리는 `.claude/worktrees/` 아래에 둔다 (`.gitignore` 에 들어 있다).
- **이 작업 환경에서 `npm run build` 는 Supabase 로 못 나간다** — `getSocialLogins()` 가 `/signup` 을 미리 만들 때
  `/auth/v1/settings` 를 부르는데 프록시가 막아 **60초 넘게 멈춘다.** 닿지 않는 주소를 주면 바로 실패해서 지나간다:
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 npm run build`. 운영 배포(Vercel)는 실제로 닿으므로 그대로 둔다.
- `node_modules` 를 다른 워크트리에서 **심볼릭 링크로 끌어다 쓰지 말 것** — Turbopack 이
  "points out of the filesystem root" 로 거부한다. 복사(`cp -al`)하거나 그 워크트리에서 `npm install` 한다.

---
