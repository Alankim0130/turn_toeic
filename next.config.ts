import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * tesseract.js(수강증 OCR)는 번들하지 않는다 — 워커 스크립트와 wasm 을 node_modules 경로에서 찾기 때문에
   * 번들되면 서버에서 못 읽는다 (src/lib/ocr.ts).
   */
  serverExternalPackages: ["tesseract.js"],

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
      "./node_modules/tesseract.js-core/package.json",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.js",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-simd-lstm.js",
      "./node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-lstm.js",
      "./node_modules/tesseract.js-core/tesseract-core-lstm.wasm",
      "./node_modules/wasm-feature-detect/**",
    ],
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // vercel.app 은 Vercel 이 이미 붙이지만, 나중에 우리 도메인을 붙였을 때도 같게
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
