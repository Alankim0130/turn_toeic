import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * tesseract.js(수강증 OCR)는 번들하지 않는다 — 워커 스크립트와 wasm 을 node_modules 경로에서 찾기 때문에
   * 번들되면 서버에서 못 읽는다 (src/lib/ocr.ts).
   */
  serverExternalPackages: ["tesseract.js"],

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
