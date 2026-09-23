import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** 순수 로직 단위 테스트 (수강증 판독기 등). `npm test` — 브라우저·DB 없이 돈다 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 서버 전용 모듈(`src/lib/ocr.ts` 등)을 테스트가 직접 부를 수 있게 — Next 의 react-server 조건과 같은 빈 모듈이다.
      // 없으면 OCR 통합 테스트가 엔진을 흉내만 내서, 운영의 "판정 키가 다 나오면 멈춤" 을 거치지 않았다 (2026-09-22)
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
});
