import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * tesseract.js(수강증 OCR)는 번들하지 않는다 — 워커 스크립트와 wasm 을 node_modules 경로에서 찾기 때문에
   * 번들되면 서버에서 못 읽는다 (src/lib/ocr.ts).
   */
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
