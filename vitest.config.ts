import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** 순수 로직 단위 테스트 (수강증 판독기 등). `npm test` — 브라우저·DB 없이 돈다 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
