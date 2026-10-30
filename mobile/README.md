# 역전토익 아이폰 앱 (`mobile/`)

> 2026-10-30 Alan — "일단 애플 앱 출시부터 먼저 진행해보자 … 기존에 쓰는 학생들이 방해받지 않도록 웹사이트 별도로 분리해서" →
> "같은 사이트, 앱에서만 켜기" · "애플로그인을 추가해줘. 그리고 홈페이지에도 애플로그인이 추가되어야해" · 탈퇴는 "전부 지우기" · "맥 있음".

앱은 **웹사이트(https://winnertoeic.com)를 그대로 띄우는 껍데기**(Capacitor 8)다. 서버 · DB · 화면이 웹과 같아서
**웹사이트를 고치면 앱도 그 자리에서 바뀐다** — 앱을 다시 올릴 일은 이 폴더(`mobile/`)를 고칠 때뿐이다.

앱 안에서만 다른 것 (웹 · 홈 화면 앱 학생에게는 아무것도 바뀌지 않는다 — `src/lib/native-app.ts`):

| | 웹 | 앱 |
|---|---|---|
| 로그인 | 카카오 · 구글 · **Apple**(맨 뒤) · 이메일 | **Apple**(맨 앞 · 아이폰의 Apple 로그인 창) · 카카오 · 구글(앱 안 로그인 창) · 이메일 |
| 알림 | 웹 푸시 | **애플 푸시(APNs)** — 같은 알림 설정 · 같은 받는 사람 |
| PDF · Word · 그림 받기 | 내려받기 · 아이폰은 공유 창 | 아이폰 공유 창 (파일에 저장 · 프린트 · 카카오톡) |
| YBM 수강 신청으로 가는 버튼 | 있음 | **숨김** (App Store 심사 3.1.1 — 앱 밖 결제로 이끌지 않는다, `.hide-in-app`) |
| 홈 화면 앱 설치 안내 | 있음 | 없음 (이미 앱이다) |
| 회원 탈퇴 | 내 정보 맨 아래 | 같다 (App Store 심사 5.1.1(v)) |

앱인지는 서버가 사용자 에이전트 끝의 `WinnerToeicApp/1`(`capacitor.config.json` 의 `appendUserAgent`)로 안다 — 바꾸면 `src/lib/native-app.ts` 도 같이.

---

## 0. 먼저 — 이 코드를 main 에 합친다

앱은 **운영 사이트를 띄운다** — 그래서 웹 쪽 코드(`src/`)가 main 에 올라가 배포돼 있어야 앱 안 Apple 로그인 · 앱 안 카카오 · 구글 로그인 · 앱 알림 · YBM 버튼 숨기기가 돈다.
합치기 전에 만든 앱은 지금 사이트를 그대로 띄울 뿐이라(구글 로그인은 앱 화면에서 막힌다) 시험할 수 없다. 앱 주소는 `winnertoeic.com` 만 열어서 미리보기 주소로는 시험할 수 없다.

합치면 **웹 학생에게 보이는 것은 이것뿐**이다 — 나머지는 전부 앱 안에서만 켜진다:
- 내 정보(`/my/profile`) 맨 아래 **회원 탈퇴** (웹 · 앱 같다)
- 개인정보처리방침 문구 (Apple 로그인 · 앱 알림 · 탈퇴 — 시행일 2026-10-30)
- 웹 로그인 화면의 **Apple 버튼은 2 · 3 · 4 단계를 마친 뒤에야** 선다 (그 전에는 그리지 않는다)

마이그레이션 `20261030110000_apple_tokens` 가 함께 적용된다 (서버만 읽고 쓰는 표 하나 — 화면에는 아무 변화 없다).

## 1. 준비물

- [ ] **맥** + **Xcode 26 이상** (App Store 에서 받는다 — 애플은 최신 SDK 로 만든 앱만 받는다)
- [ ] **Node.js 22 이상** (https://nodejs.org 의 LTS) — `node -v` 로 확인
- [ ] **Apple Developer Program 가입** (https://developer.apple.com/programs — 1년 99달러)
  - 개인으로 가입하면 App Store 의 판매자 이름이 **본인 실명**이다. 학원 · 회사 이름으로 내려면 조직으로 가입한다(D-U-N-S 번호가 필요하다). 어느 쪽인지 먼저 정한다.
- [ ] 시험할 **아이폰** 한 대 (USB 케이블)

## 2. 애플 개발자 사이트 — 앱 · 웹 로그인 · 키

https://developer.apple.com/account → **Certificates, Identifiers & Profiles**

### 2-1. 앱 ID
- [ ] **Identifiers → +** → App IDs → App
  - Description: `역전토익`
  - Bundle ID: **Explicit** · `com.winnertoeic.app`
    (다른 값을 쓰면 `ios/App/App.xcodeproj` 의 PRODUCT_BUNDLE_IDENTIFIER · `capacitor.config.json` 의 `appId` · Vercel `APPLE_BUNDLE_ID` 를 **모두 같은 값으로** 바꾼다)
  - Capabilities: **Push Notifications** ✔ · **Sign in with Apple** ✔ (Enable as a primary App ID)
  - Continue → Register

### 2-2. 웹 Apple 로그인 (Services ID)
- [ ] **Identifiers → +** → **Services IDs**
  - Description: `역전토익 웹 로그인` · Identifier: `com.winnertoeic.web`
  - Register 한 뒤 그 줄을 다시 눌러 **Sign in with Apple ✔ → Configure**
    - Primary App ID: `com.winnertoeic.app`
    - Domains and Subdomains: `winnertoeic.com`
    - Return URLs: **`https://winnertoeic.com/auth/apple/callback`** (이 주소 그대로 — 끝에 `/` 없이)
  - Save → Continue → Save

### 2-3. 서버 키 (.p8) — Apple 로그인과 앱 알림이 같이 쓴다
- [ ] **Keys → +**
  - Key Name: `역전토익 서버 키`
  - **Apple Push Notifications service (APNs)** ✔ — 환경을 고르라고 하면 **Sandbox & Production**(둘 다)
  - **Sign in with Apple** ✔ → Configure → Primary App ID `com.winnertoeic.app` → Save
  - Continue → Register → **Download** — `.p8` 파일은 **한 번만 받을 수 있다.** 안전한 곳에 둔다 (저장소 · 카톡에 올리지 않는다)
- [ ] 화면의 **Key ID**(10자)와 **Team ID**(오른쪽 위 이름 아래, 또는 Membership details — 10자)를 적어 둔다

## 3. Supabase — Apple 로그인 켜기

Supabase 대시보드 → **Authentication → Sign In / Providers → Apple**
- [ ] **Enable Sign in with Apple** 켬
- [ ] **Client IDs**: `com.winnertoeic.web,com.winnertoeic.app` (웹 Services ID 와 앱 번들 ID 를 쉼표로)
- [ ] **Secret Key (for OAuth)**: **비워 둔다** — 우리 사이트는 애플이 준 신분 토큰으로 들어가서(`signInWithIdToken`) 필요 없다. 6개월마다 바꿀 일도 없다
- [ ] Save
- [ ] Authentication → URL Configuration 의 Redirect URLs 에 `https://winnertoeic.com/**` 가 있는지만 본다 (앱의 카카오 · 구글 로그인이 `/auth/app-callback` 으로 돌아온다 — 이미 있다)

## 4. Vercel — 환경변수 (Production · 서버 전용)

Vercel → 프로젝트 → Settings → Environment Variables (Type **Secret**, Environment **Production**)

| 이름 | 값 |
|---|---|
| `APPLE_TEAM_ID` | 2-3 의 Team ID |
| `APPLE_KEY_ID` | 2-3 의 Key ID |
| `APPLE_PRIVATE_KEY` | `.p8` 파일 내용 **통째로** (`-----BEGIN PRIVATE KEY-----` 부터 `-----END PRIVATE KEY-----` 까지, 줄바꿈 그대로) |
| `APPLE_SERVICES_ID` | `com.winnertoeic.web` |
| `APPLE_BUNDLE_ID` | `com.winnertoeic.app` (이 값이면 안 넣어도 된다) |

- [ ] 넣은 뒤 **Deployments → 맨 위 배포 → Redeploy** — 환경변수는 새 배포부터 먹는다
- [ ] 확인: https://winnertoeic.com/login 에 검정 **Apple로 로그인** 버튼이 맨 아래에 보이고, 눌러서 로그인이 끝까지 된다
  (안 보이면 Supabase 의 Apple 이 꺼져 있거나 `APPLE_SERVICES_ID` · 키 중 하나가 빠졌다)

## 5. 맥에서 앱 만들기 · 아이폰에 설치

```bash
git clone https://github.com/Alankim0130/turn_toeic.git
cd turn_toeic/mobile
npm install          # 앱 의존성 (웹사이트와 따로)
npx cap sync ios     # 설정 · 플러그인을 Xcode 프로젝트에 맞춘다
npx cap open ios     # Xcode 가 열린다
```

Xcode 에서:
- [ ] 왼쪽 **App**(파란 아이콘) → TARGETS **App** → **Signing & Capabilities**
  - **Automatically manage signing** ✔ · **Team**: 내 개발자 팀
  - Bundle Identifier 가 `com.winnertoeic.app` 인지 본다
  - **Push Notifications** · **Sign in with Apple** 이 목록에 있는지 본다 (`App/App.entitlements` 에 이미 있다 — 없으면 `+ Capability` 로 더한다)
- [ ] 아이폰을 USB 로 연결 → 위쪽 기기 칸에서 그 아이폰 → **▶ (Run)**
  - 처음이면 아이폰 **설정 → 개인정보 보호 및 보안 → 개발자 모드** 켜기, **설정 → 일반 → VPN 및 기기 관리**에서 개발자 앱 신뢰
- [ ] 앱에서 확인
  - 로그인 화면: **Apple로 로그인**(맨 앞) · 카카오 · 구글 · 이메일이 다 된다
  - 처음 Apple 로 들어오면 가입 정보 입력(실명 · 휴대폰) — Apple 이 준 이름이 실명 칸에 들어가 있다
  - 마이페이지 → 알림 → **휴대폰으로 알림 받기** → 허용 → **테스트 알림 보내기**가 온다
    (Xcode 로 바로 설치한 앱은 애플의 개발용 알림 서버를 쓴다 — 서버가 저절로 가른다)
  - 반별 명단 PDF 같은 파일 받기 → 공유 창이 뜬다
  - 내 정보 맨 아래 **회원 탈퇴**가 보인다 (시험 계정으로만 눌러 볼 것 — 되돌릴 수 없다)

## 6. App Store Connect — 앱 등록 · TestFlight

- [ ] https://appstoreconnect.apple.com → **앱 → +  → 신규 앱**
  - 플랫폼 iOS · 이름 `역전토익` (이미 있는 이름이면 `역전토익 - YBM 서면` 처럼) · 기본 언어 **한국어** · 번들 ID `com.winnertoeic.app` · SKU `winnertoeic-ios`
- [ ] Xcode 위쪽 기기 칸 → **Any iOS Device (arm64)** → 메뉴 **Product → Archive**
- [ ] 끝나면 Organizer 창 → **Distribute App → App Store Connect → Upload**
- [ ] 10 ~ 30분 뒤 App Store Connect → **TestFlight** 에 빌드가 뜬다 (암호화 질문은 건너뛴다 — Info.plist 에 `ITSAppUsesNonExemptEncryption = NO` 를 넣어 두었다)
- [ ] **내부 테스트** 그룹에 강사님 Apple ID 를 넣고, 아이폰의 TestFlight 앱으로 설치해 5 의 확인을 한 번 더 한다 (TestFlight 앱은 운영 알림 서버를 쓴다)

## 7. 심사 제출

- [ ] 앱 정보: 카테고리 **교육** · 개인정보처리방침 URL **`https://winnertoeic.com/privacy`** · 지원 URL `https://winnertoeic.com/contact`
- [ ] **앱 개인정보 보호**(데이터 수집 질문표) — 모두 "앱 기능" 용도 · "사용자와 연결됨" · **추적 안 함**
  - 연락처 정보: 이름 · 이메일 · 전화번호 / 사용자 콘텐츠: 사진(수강증 · 숙제 · 인증) · 오디오(숙제 녹음) / 식별자: 사용자 ID · 기기 ID(알림)
- [ ] **스크린샷** — 6.9형(아이폰 Pro Max) 은 꼭 필요하다. Xcode 의 시뮬레이터(iPhone 17 Pro Max)로 앱을 띄워 `⌘S` 로 찍는다 (로그인 · 마이페이지 · 내 시간표 · 숙제제출 · 다시보기)
- [ ] **심사용 계정** (App Review Information → 로그인 정보) — 심사관이 로그인해서 수강생 화면을 봐야 한다
  - 이메일로 가입한 계정 하나를 만들고 학생명단에서 그 달 반 하나에 배정한다 (현장 · 불라방은 상관없다)
  - **그 계정은 반 명단 · 출석 · 숙제 미제출에 학생으로 선다** — 심사가 끝나면 배정을 지우거나 그 계정으로 회원 탈퇴한다
- [ ] **심사 메모** (Notes) — 영어로 이렇게 적는다:

  > This app is the student portal for "역전토익" TOEIC classes at YBM Language Institute (Seomyeon, Busan).
  > Students enroll and pay offline / on the official YBM website; the app sells nothing and shows no prices.
  > Students upload their YBM enrollment receipt to unlock class materials (live class links, replays, homework, LC audio).
  > Native features: Sign in with Apple, push notifications (class start / homework reminders), camera QR attendance, share sheet for files.
  > Demo account: (이메일) / (비밀번호) — already assigned to a class.
  > Account deletion: 마이페이지 (My page) → 내 정보 (My info) → 회원 탈퇴 (Delete account) at the bottom.

- [ ] **제출 → 심사**(보통 1 ~ 3일). 거절되면 사유를 그대로 알려 주면 맞춰 고친다

### 심사에서 걸릴 수 있는 것 (알고 낸다)
- **4.2 최소 기능** — "웹사이트를 감싼 앱" 이면 거절될 수 있다. 그래서 앱만의 기능(Apple 로그인 · 애플 푸시 알림 · 카메라 QR 출석 · 공유 창)을 메모에 적는다
- **3.1.1 결제** — 앱 밖 결제로 이끄는 버튼은 앱에서 숨겼다(`hide-in-app`). 화면에 수강료 · YBM 신청 링크가 새로 생기면 앱에서도 숨겨야 한다
- **4.8 Apple 로그인** — 카카오 · 구글이 있으면 Apple 로그인이 꼭 있어야 한다. **Supabase 의 Apple 이 꺼져 있으면 앱에 Apple 버튼이 안 선다** → 3 을 먼저 할 것
- **5.1.1(v) 탈퇴** — 내 정보 맨 아래에 있다. 탈퇴하면 Apple 연결도 끊는다(`APPLE_*` 환경변수가 있어야 한다)

## 8. 앱을 다시 올려야 할 때 · 안 올려도 될 때

- **웹사이트(`src/`)를 고쳤다** → main 에 올리면 끝. 앱도 다음에 열 때 바뀐다 (심사 없음)
- **이 폴더(`mobile/`)를 고쳤다** (아이콘 · 시작 화면 · Swift · 권한 문구 · 플러그인 · `capacitor.config.json`)
  → Xcode 에서 **MARKETING_VERSION**(1.0 → 1.0.1)과 **CURRENT_PROJECT_VERSION**(1 → 2)을 올리고 `npx cap sync ios` → Archive → 업로드 → 심사
- 앱 안에서만 다르게 할 일은 웹 코드에서 가른다 — 서버는 `isAppRequest()`(`src/lib/native-app-server.ts`), 화면은 `isNativeApp()`, 숨길 것은 `className="hide-in-app"`

## 9. 잘 안 될 때

| 증상 | 볼 곳 |
|---|---|
| 웹 로그인 화면에 Apple 버튼이 없다 | Supabase Apple 켜짐 · `APPLE_SERVICES_ID` · `APPLE_TEAM_ID` · `APPLE_KEY_ID` · `APPLE_PRIVATE_KEY` · 재배포 |
| 웹 Apple 로그인 뒤 "Apple 로그인을 마치지 못했어요" | Services ID 의 Return URL 오타 · 도메인 · Supabase Client IDs 에 `com.winnertoeic.web` · www 주소로 들어왔는지 |
| 앱 Apple 로그인 뒤 "마치지 못했어요" | Supabase Client IDs 에 `com.winnertoeic.app` · Xcode 의 Sign in with Apple capability |
| 앱 알림이 안 온다 | `APPLE_*` 환경변수 · Xcode 의 Push Notifications capability · 아이폰 설정의 알림 허용 · Vercel 로그의 `[apns]` |
| 앱 알림 켜기에서 "앱 알림을 아직 보낼 수 없어요" | 서버에 `APPLE_*` 키가 없다 (4) |
| 카카오 로그인 창의 "카카오톡으로 로그인" 이 앱으로 안 돌아온다 | 알려진 한계 — 그 창에서 카카오 아이디 · 비밀번호로 로그인한다 |
| 앱이 하얀 화면 · "연결할 수 없어요" | 인터넷 · https://winnertoeic.com 이 열리는지 (앱은 사이트를 그대로 연다) |

## 10. 키를 잃어버렸거나 새어 나갔을 때

- `.p8` 은 다시 받을 수 없다 → 2-3 으로 **새 키**를 만들고 Vercel 의 `APPLE_KEY_ID` · `APPLE_PRIVATE_KEY` 를 바꾸고 재배포 → 확인한 뒤 옛 키를 **Revoke**
- 새 키로 바꿔도 로그인 · 알림 · 탈퇴(Apple 연결 끊기)는 그대로 된다 — 같은 팀의 키면 된다

## 파일

| 파일 | 하는 일 |
|---|---|
| `capacitor.config.json` | 띄울 주소(`server.url` · `/my` 부터) · 사용자 에이전트 표시 · 시작 화면 · 상태 표시줄 |
| `ios/App/App/WinnerToeicPlugin.swift` | 앱 전용 기능 — Apple 로그인 창 · 앱 안 로그인 창(카카오 · 구글) · 앱 정보(개발용 알림 서버인지) · **우리 사이트 밖 주소는 사파리로** |
| `ios/App/App/AppViewController.swift` | 위 플러그인을 붙이고 옆으로 밀어 뒤로 가기를 켠다 |
| `ios/App/App/AppDelegate.swift` | 애플 알림 기기 토큰을 알림 플러그인으로 넘긴다 |
| `ios/App/App/App.entitlements` | 알림 · Apple 로그인 권한 |
| `ios/App/App/Info.plist` | 카메라 · 마이크 · 사진 권한 문구(한국어) · 암호화 신고 |
| `www/offline.html` | 인터넷이 끊겼을 때 화면 |
| 웹 쪽 | `src/lib/native-app.ts` · `src/lib/app-login.ts` · `src/lib/apple-auth.ts` · `src/lib/apns.ts` · `src/lib/account-deletion.ts` · `src/components/native/NativeAppBridge.tsx` |
