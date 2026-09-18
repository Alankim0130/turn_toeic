#!/usr/bin/env node
/**
 * 배포 전 점검 — Vercel 함수에 실리는 파일만으로 수강증 OCR 워커가 뜨는지 본다 (2026-09-18).
 *
 * 왜 필요한가: tesseract.js 는 워커 스레드를 파일 경로로 띄우고 그 안에서 wasm 코어와 `bmp-js` 같은 패키지를 require 한다.
 * Next 의 파일 추적은 워커 안을 따라가지 못해, 로컬(node_modules 전부)에서는 잘 되던 것이 운영에서 워커가 뜨자마자 죽었다 — 두 번.
 * 이 스크립트는 빌드 결과의 추적 목록(`.nft.json`)에 있는 파일만 임시 폴더에 복사하고, 거기서 워커를 띄워 fixture 를 읽는다.
 * 빠진 모듈이 있으면 여기서 바로 죽는다.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 npm run build && npm run ocr:check
 *
 * 언어 데이터는 `/tmp/tesseract-cache` 를 쓴다 (없으면 CDN 에서 받는다 — 막힌 환경에서는 CLAUDE.md 미확정 5 참고).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const nft = path.join(root, ".next/server/app/my/verify/page.js.nft.json");
if (!fs.existsSync(nft)) {
  console.error("먼저 빌드하세요: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 npm run build");
  process.exit(1);
}
const sim = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-bundle-"));
const files = JSON.parse(fs.readFileSync(nft, "utf8")).files;
let copied = 0;
for (const f of files) {
  const src = path.normalize(path.join(path.dirname(nft), f));
  const rel = path.relative(root, src);
  if (rel.startsWith("..") || !fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
  const dst = path.join(sim, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied++;
}
console.log(`추적 파일 ${copied}개를 ${sim} 에 복사`);

const fixture = path.join(root, "src/lib/__fixtures__/receipt-phone-screenshot.png");
const runner = path.join(sim, "run.cjs");
fs.writeFileSync(
  runner,
  `const fs = require("fs"); const path = require("path");
const { createWorker } = require(path.join(__dirname, "node_modules/tesseract.js"));
const cachePath = path.join(require("os").tmpdir(), "tesseract-cache"); fs.mkdirSync(cachePath, { recursive: true });
const t0 = Date.now();
(async () => {
  const worker = await Promise.race([
    createWorker("kor", 1, { cachePath, logger: () => {}, errorHandler: (e) => { console.error("worker error:", e); process.exit(2); } }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("createWorker 가 30초 안에 끝나지 않았다")), 30000)),
  ]);
  console.log("워커 준비", Date.now() - t0, "ms");
  const { data } = await worker.recognize(fs.readFileSync(process.argv[2]));
  const chars = data.text.replace(/\\s+/g, "").length;
  console.log("인식", chars, "자, confidence", Math.round(data.confidence), "총", Date.now() - t0, "ms");
  await worker.terminate();
  if (chars < 40) { console.error("글자를 거의 못 읽었다"); process.exit(3); }
})().catch((e) => { console.error("실패:", e && e.message ? e.message : e); process.exit(1); });`,
);
const r = spawnSync(process.execPath, [runner, fixture], { cwd: sim, stdio: "inherit", timeout: 120_000 });
fs.rmSync(sim, { recursive: true, force: true });
if (r.status !== 0) {
  console.error("\n✗ 운영 번들만으로는 OCR 워커가 돌지 않는다 — next.config.ts 의 outputFileTracingIncludes 를 확인할 것");
  process.exit(r.status ?? 1);
}
console.log("✓ 운영 번들만으로 OCR 워커가 돈다");
