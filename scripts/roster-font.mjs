/**
 * 반별 명단 PDF 에 넣는 글꼴을 만든다 (2026-10-14) — Pretendard Bold 를 **한글 완성형 11,172자 전부 + 영문 · 숫자 · 기호**만 남긴 TTF 로.
 * 포스터 글꼴(`poster-fonts.mjs`)과 달리 **학생 이름**을 찍으므로 글자를 고를 수 없다 — 어떤 이름이 올지 모른다.
 *
 * **글리프 길이를 짝수로 맞춘다** — PDF 에 넣을 때 pdf-lib(@pdf-lib/fontkit)가 쓴 글자만 다시 잘라 넣는데(subset), 잘라 낸 글꼴이 64KB 보다 작으면
 * 위치표(loca)를 짧은 꼴(2로 나눈 값)로 쓰면서 **글리프 길이가 홀수인지 보지 않는다**. 원본 Pretendard 는 큰 글꼴이라 긴 위치표에 길이가 홀수인 글리프가 섞여
 * 그대로 넣으면 한 글자 뒤부터 모양이 밀려 **이름이 거의 다 빈칸으로 찍힌다** (2026-10-14 실측 — 글자는 PDF 에 들어 있는데 그림이 없다).
 * 포스터 글꼴은 작아서 harfbuzz 가 처음부터 짧은 위치표 + 짝수 길이로 만들어 괜찮았다. `class-roster-pdf.test.ts` 가 홀수 길이 글리프가 없는지 본다.
 *
 *   npm pack pretendard@1.3.9 && tar -xzf pretendard-1.3.9.tgz
 *   node scripts/roster-font.mjs package/dist/public/static/alternative
 *
 * Pretendard 는 SIL Open Font License 1.1 — 줄여서 다시 배포해도 된다 (라이선스 사본을 함께 둔다 — assets/roster-fonts/README.md).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import subsetFont from "subset-font";

const src = process.argv[2];
if (!src) {
  console.error("사용법: node scripts/roster-font.mjs <Pretendard 정적 TTF 폴더 (Pretendard-Bold.ttf 가 있는 곳)>");
  process.exit(1);
}

const OUT = "assets/roster-fonts";

let text = "";
for (let c = 0x20; c <= 0x7e; c++) text += String.fromCharCode(c);
for (let c = 0xac00; c <= 0xd7a3; c++) text += String.fromCharCode(c);
// 명단 머리 · 표시에 쓰는 기호
text += "·~–—…○●";

/** 글리프마다 길이를 짝수로 — 위치표는 긴 꼴(4바이트)로 다시 쓴다. 다른 표는 그대로 옮기고 표 체크섬 · head.checkSumAdjustment 를 다시 센다 */
function padGlyphs(input) {
  const buf = new Uint8Array(input);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const numTables = dv.getUint16(4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables.push({ tag: String.fromCharCode(...buf.subarray(o, o + 4)), offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) });
  }
  const table = (tag) => {
    const t = tables.find((x) => x.tag === tag);
    if (!t) throw new Error(`${tag} 표가 없다`);
    return t;
  };
  const head = table("head");
  const loca = table("loca");
  const glyf = table("glyf");
  const longLoca = dv.getInt16(head.offset + 50) === 1;
  const numGlyphs = dv.getUint16(table("maxp").offset + 4);
  const at = (i) => (longLoca ? dv.getUint32(loca.offset + i * 4) : dv.getUint16(loca.offset + i * 2) * 2);

  const glyphs = [];
  const offsets = [0];
  let pos = 0;
  for (let i = 0; i < numGlyphs; i++) {
    const g = buf.subarray(glyf.offset + at(i), glyf.offset + at(i + 1));
    const padded = g.length % 2 ? Uint8Array.of(...g, 0) : g;
    glyphs.push(padded);
    pos += padded.length;
    offsets.push(pos);
  }
  const newGlyf = new Uint8Array(pos);
  let w = 0;
  for (const g of glyphs) {
    newGlyf.set(g, w);
    w += g.length;
  }
  const newLoca = new Uint8Array(offsets.length * 4);
  const locaDv = new DataView(newLoca.buffer);
  offsets.forEach((o, i) => locaDv.setUint32(i * 4, o));
  const newHead = buf.slice(head.offset, head.offset + head.length);
  const headDv = new DataView(newHead.buffer);
  headDv.setInt16(50, 1); // 긴 위치표
  headDv.setUint32(8, 0); // checkSumAdjustment — 다 짠 뒤 다시 센다

  const data = tables.map((t) =>
    t.tag === "glyf" ? newGlyf : t.tag === "loca" ? newLoca : t.tag === "head" ? newHead : buf.slice(t.offset, t.offset + t.length),
  );
  const checksum = (bytes) => {
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
    padded.set(bytes);
    const v = new DataView(padded.buffer);
    let sum = 0;
    for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
    return sum;
  };
  const headerLen = 12 + numTables * 16;
  let total = headerLen;
  const placed = data.map((d) => {
    const offset = total;
    total += Math.ceil(d.length / 4) * 4;
    return offset;
  });
  const out = new Uint8Array(total);
  out.set(buf.subarray(0, 12)); // sfnt 버전 · 표 수 · 검색 값은 그대로 (표 수가 같다)
  const outDv = new DataView(out.buffer);
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    out.set(buf.subarray(o, o + 4), o);
    outDv.setUint32(o + 4, checksum(data[i]));
    outDv.setUint32(o + 8, placed[i]);
    outDv.setUint32(o + 12, data[i].length);
    out.set(data[i], placed[i]);
  });
  const headAt = placed[tables.indexOf(head)];
  outDv.setUint32(headAt + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}

mkdirSync(OUT, { recursive: true });
const input = readFileSync(path.join(src, "Pretendard-Bold.ttf"));
const subset = await subsetFont(input, text, { targetFormat: "truetype" });
const out = padGlyphs(subset);
writeFileSync(path.join(OUT, "roster-bold.ttf"), out);
console.log(`${OUT}/roster-bold.ttf  ${(out.length / 1024).toFixed(1)}KB · 글자 ${[...text].length}개`);
