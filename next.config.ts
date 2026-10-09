import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * tesseract.js(수강증 OCR)는 번들하지 않는다 — 워커 스크립트와 wasm 을 node_modules 경로에서 찾기 때문에
   * 번들되면 서버에서 못 읽는다 (src/lib/ocr.ts).
   */
  serverExternalPackages: ["tesseract.js"],

  experimental: {
    /**
     * **방금 본 화면 30초 기억** (2026-10-09 Alan "화면 전환이 좀 느린데" → 화면 틀 · 기억 · 서버 줄이기 셋 다 하기로).
     * 같은 화면으로 30초 안에 다시 가면 서버에 묻지 않고 받아 둔 것을 바로 보여 준다 — 하단 메뉴로 왔다 갔다 할 때.
     * 기본값(0초)은 매번 서버를 다녀왔다. 뒤로 가기는 원래부터 받아 둔 것을 쓴다.
     * **내가 저장 · 제출하면 바로 비운다** — 서버 액션의 `revalidatePath` 가 기억해 둔 화면을 전부 버린다 (Next 문서 revalidatePath ·
     * glossary "Client Cache"). 당겨서 새로고침 · 앱으로 돌아오면(`router.refresh`) 도 비운다.
     * 대가: **다른 사람이 바꾼 것**(선생님이 넣은 불라방 링크 · 새 알림)은 그 화면을 30초 안에 다시 열면 그만큼 늦게 보인다 — Alan 이 알고 골랐다.
     * 숫자를 늘리지 말 것 — 늘린 만큼 늦게 보인다.
     */
    staleTimes: { dynamic: 30 },
  },

  /**
   * tesseract.js 는 워커(worker_threads)를 **파일 경로로** 띄우고, 그 워커가 wasm 코어를 `require` 한다.
   * Next 의 파일 추적은 워커 안의 require 를 따라가지 못해 **Vercel 함수에 워커의 나머지 파일과 wasm 이 실리지 않았다**
   * (2026-09-18 첫 운영 테스트 — Alan 이 8월 수강증을 올렸는데 워커가 뜨자마자 죽어 30초 뒤 "읽은 것 없음" 으로 검토 대기에 빠졌다.
   * 로컬은 node_modules 가 다 있어 3초 만에 읽혔다). 그래서 등업신청 페이지 함수에 tesseract.js 소스 트리와
   * LSTM 코어(js + wasm, CPU 변형 셋 ≈ 9MB)를 직접 넣는다. `*.wasm.js` 는 브라우저용(base64 내장)이라 뺀다.
   * 키 `/my/verify` = app/my/verify/page 의 경로 — 서버 액션은 그 페이지 함수에서 돈다.
   */
  outputFileTracingIncludes: {
    "/my/verify": [
      "./node_modules/tesseract.js/src/**",
      // 워커 트리가 require 하는 패키지 — 추적이 못 따라가 2026-09-18 두 번째 운영 테스트에서 `bmp-js` 를 못 찾고 워커가 죽었다.
      // 배포 전 확인: 추적 파일만 복사해 워커를 띄워 보는 시뮬레이션 (CLAUDE.md 미확정 5)
      "./node_modules/bmp-js/**",
      "./node_modules/is-url/**",
      "./node_modules/idb-keyval/**",
      "./node_modules/regenerator-runtime/**",
      "./node_modules/zlibjs/**",
      "./node_modules/wasm-feature-detect/**",
      // wasm 코어는 CPU 기능(relaxed SIMD · SIMD · 기본)과 엔진 모드로 실행 시점에 고른다 — 여섯 조합의 js + wasm 을 다 넣는다.
      // 브라우저용 `*.wasm.js`(base64 내장, 6 × 3.9MB)는 코어 js 가 참조해서 추적기가 어차피 함께 넣는다 (excludes 로도 안 빠진다).
      // 그래서 함수 전체가 약 97MB 다 — Vercel 한도 250MB 안. 아래 js 는 `.wasm.js` 를 또 잡지 않게 파일명을 하나씩 적었다
      "./node_modules/tesseract.js-core/package.json",
      "./node_modules/tesseract.js-core/tesseract-core.js",
      "./node_modules/tesseract.js-core/tesseract-core-lstm.js",
      "./node_modules/tesseract.js-core/tesseract-core-simd.js",
      "./node_modules/tesseract.js-core/tesseract-core-simd-lstm.js",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd.js",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.js",
      "./node_modules/tesseract.js-core/tesseract-core*.wasm",
    ],
    /**
     * 출석 QR 포스터 PDF (2026-09-22) — 글꼴과 `public/` 의 그림을 서버에서 읽어 PDF 에 넣는다 (`attendance-poster-assets.ts`).
     * `public/` 은 정적 파일로만 나가고 함수에는 실리지 않으므로 읽는 파일을 여기 적는다. 읽는 파일을 바꾸면 여기도 고친다.
     */
    "/admin/attendance/poster/download": [
      "./assets/poster-fonts/*.ttf",
      "./public/brand/logo.png",
      "./public/brand/symbol.png",
      "./public/posters/attendance-*.webp",
      // 강사 캐리커처 (2026-09-30 — 그전에는 public/instructors/casual/*.png 실사 컷). 포스터는 site.instructors[].caricatures[0]
      "./public/instructors/caricature/*.webp",
    ],
    /**
     * 인수인계 체크리스트 (2026-10-04) — 관리자 화면 `운영 → 인수인계` 가 저장소의 docs/HANDOVER.md 를 서버에서 읽어 그린다
     * (`src/app/admin/_lib/handover-doc.ts`). `docs/` 는 함수에 실리지 않으므로 여기 적는다. 서버 액션도 이 화면 함수에서 돈다.
     */
    "/admin/handover": ["./docs/HANDOVER.md"],
  },

  /**
   * 보안 헤더 (2026-09-18 보안 점검). 브라우저에게 "이 사이트는 이렇게만 다뤄라" 를 말해 준다 —
   * 다른 사이트 안에 iframe 으로 끼워 넣는 클릭재킹, 파일 형식 속이기, 주소 유출, 쓰지 않는 기기 권한을 막는다.
   * CSP(스크립트 출처 제한)는 넣지 않았다 — 인라인 스크립트(JSON-LD · 스플래시)·유튜브 임베드·Supabase 를 전부 허용 목록으로
   * 옮겨야 해서 따로 작업한다 (먼저 report-only 로 켜서 깨지는 곳을 본다).
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 카메라 · 마이크는 우리 사이트에만 연다. 남의 사이트(iframe)는 여전히 못 쓴다. 위치 · 결제는 계속 끈다.
          //  - 카메라: 2026-09-22 Alan — 출석 화면에서 카메라를 바로 켜 QR 을 찍는다 (`/my/attendance` 의 `AttendanceCamera` 하나)
          //  - 마이크: 2026-10-08 Alan — 숙제를 화면에서 바로 녹음한다 (`/my/homework` 의 `HomeworkRecorder` 하나). 끄면 녹음이 늘 "권한이 꺼져 있어요" 가 된다
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
          // vercel.app 은 Vercel 이 이미 붙이지만, 나중에 우리 도메인을 붙였을 때도 같게
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
