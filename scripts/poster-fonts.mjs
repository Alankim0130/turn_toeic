/**
 * 출석 QR 포스터 PDF 에 넣는 글꼴을 만든다 (2026-09-22) — Pretendard 를 **포스터에 쓰는 글자만 남긴** 작은 TTF 로.
 * 원본은 한 굵기에 2.6MB 라 그대로 두면 저장소와 서버 함수가 무거워지고, 포스터 한 장에 쓰는 글자는 100자 남짓이다.
 *
 * 남기는 글자: `src/lib/attendance-poster.ts` 에 있는 모든 글자 + `src/lib/site.ts` 의 강사 이름·과목 + 영문·숫자·기호 전부.
 * 포스터 문구를 바꾸면 이 스크립트를 다시 돌린다 — `attendance-poster.test.ts` 가 빠진 글자를 잡는다.
 *
 *   npm pack pretendard@1.3.9 && tar -xzf pretendard-1.3.9.tgz
 *   node scripts/poster-fonts.mjs package/dist/public/static/alternative
 *
 * Pretendard 는 SIL Open Font License 1.1 — 줄여서 다시 배포해도 된다 (라이선스 사본을 함께 둔다).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import subsetFont from "subset-font";

const src = process.argv[2];
if (!src) {
  console.error("사용법: node scripts/poster-fonts.mjs <Pretendard 정적 TTF 폴더 (Pretendard-Black.ttf 가 있는 곳)>");
  process.exit(1);
}

const WEIGHTS = ["Black", "Bold", "SemiBold"];
const OUT = "assets/poster-fonts";

const poster = readFileSync("src/lib/attendance-poster.ts", "utf8");
const site = readFileSync("src/lib/site.ts", "utf8");
const names = [...site.matchAll(/(?:name|part): "([^"]+)"/g)].map((m) => m[1]).join("");
let ascii = "";
for (let c = 0x20; c <= 0x7e; c++) ascii += String.fromCharCode(c);
const text = [...new Set([...poster, ...names, ...ascii, "·"])].filter((ch) => ch >= " ").join("");

mkdirSync(OUT, { recursive: true });
for (const w of WEIGHTS) {
  const input = readFileSync(path.join(src, `Pretendard-${w}.ttf`));
  const out = await subsetFont(input, text, { targetFormat: "truetype" });
  writeFileSync(path.join(OUT, `poster-${w.toLowerCase()}.ttf`), out);
  console.log(`${OUT}/poster-${w.toLowerCase()}.ttf  ${(out.length / 1024).toFixed(1)}KB`);
}
console.log(`글자 ${[...text].length}개`);
