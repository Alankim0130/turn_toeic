/**
 * 인쇄용 출석 QR 포스터 (2026-09-21 Alan — "QR을 A5 크기로 2개 해서 A4로 인쇄할 수 있도록 디자인해서 만들어줘. 힉스필드로 제작부탁해!").
 *
 * - **A4 가로 한 장 = A5 세로 포스터 두 장.** 가운데 점선을 자르면 강의실마다 한 장씩 붙인다. 두 장은 QR 이 같고
 *   강사만 다르다 — `site.instructors[].casual` 의 첫 컷 (이혜영 가리키기 · 이영수 엄지척, 랜딩과 같은 사진).
 * - 그림(QR 을 찍는 휴대폰 · 출석 도장)은 **힉스필드로 만든 `public/posters/`** 이고 **QR 과 글자는 코드로 그린다** —
 *   AI 가 그린 QR 은 찍히지 않고 한글은 깨진다.
 * - QR 은 H(30% 복구)로 만들고 가운데에 브랜드 심벌을 얹는다 (가리는 넓이는 5% 안쪽). 칸은 순검정이다 —
 *   컬러 레이저는 진회색을 여러 색으로 섞어 찍어 칸 가장자리가 번진다.
 * - 루트 레이아웃(헤더·하단 바)을 타지 않는 **완성된 HTML 문서**다 — `/admin/attendance/poster/print` 라우트 핸들러가 돌려준다.
 *   `print-color-adjust: exact` 라서 인쇄 창에서 "배경 그래픽" 을 안 켜도 분홍 띠가 나온다.
 *   중요한 것은 전부 종이 가장자리에서 7mm 안쪽에 있다 — 가정·사무실 프린터는 가장자리 4~5mm 를 못 찍는다.
 * - 규칙 숫자(수업 30분 전부터 입실 · 7분 지각 · 입실 30분 뒤부터 퇴실 · 끝나고 30분까지)는 SQL `attendance_scan` 에 있다.
 *   바꾸면 아래 문구도 고친다 (`attendance.ts` 의 학생 화면 문구와 같은 규칙).
 */
import { qrPath, QR_QUIET, type QrMatrix } from "./qr-svg";
import { site } from "./site";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** 발행 시각 → `2026.09.21 16:40 발행` (한국 시간). 새로 뽑은 뒤 붙어 있는 옛 종이를 가려내는 표시 */
export function issuedLabel(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}.${p("month")}.${p("day")} ${p("hour")}:${p("minute")} 발행`;
}

/** QR (순검정 칸 + 가운데 브랜드 심벌). 좌표는 칸 단위 — 크기는 CSS 가 정한다 */
function qrSvg(m: QrMatrix): string {
  const side = m.size + QR_QUIET * 2;
  const box = +(m.size * 0.22).toFixed(2); // 한 변의 22% = 넓이 약 5%. H 는 30% 까지 되살린다
  const at = +((side - box) / 2).toFixed(2);
  const pad = +(box * 0.14).toFixed(2);
  return (
    `<svg class="qr" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img" aria-label="출석 QR 코드">` +
    `<rect width="${side}" height="${side}" fill="#fff"/>` +
    `<path d="${qrPath(m)}" fill="#000"/>` +
    `<rect x="${at}" y="${at}" width="${box}" height="${box}" rx="${+(box * 0.24).toFixed(2)}" fill="#fff" shape-rendering="geometricPrecision"/>` +
    `<image href="/brand/symbol.png" x="${+(at + pad).toFixed(2)}" y="${+(at + pad).toFixed(2)}" width="${+(box - pad * 2).toFixed(2)}" height="${+(box - pad * 2).toFixed(2)}"/>` +
    `</svg>`
  );
}

type Who = { name: string; part: string; src: string; width: number; height: number };

function poster(who: Who, qr: string, issued: string): string {
  return `
<section class="poster" aria-label="출석 QR 포스터 — ${esc(who.name)} 선생님">
  <div class="frame">
    <header class="top">
      <img class="logo" src="/brand/logo.png" alt="역전토익" width="1200" height="463">
      <span class="pill">강의실 출석 QR</span>
    </header>
    <div class="middle">
      <div class="left">
        <h1>들어올 때 <em>찰칵</em>,<br>나갈 때 <em>찰칵</em>!</h1>
        <p class="sub">휴대폰 기본 카메라로 찍으면<br>입실·퇴실이 기록돼요</p>
        <div class="qrcard">${qr}</div>
        <p class="hint">로그인한 휴대폰으로 찍어 주세요</p>
      </div>
      <figure class="who">
        <img src="${esc(who.src)}" alt="${esc(who.name)} 선생님" width="${who.width}" height="${who.height}">
        <figcaption>${esc(who.part)} · ${esc(who.name)}</figcaption>
      </figure>
    </div>
    <ol class="steps">
      <li><img src="/posters/attendance-phone.webp" alt="" width="1166" height="1142"><b><i>1</i>들어올 때 찰칵</b><span>입실 · 수업 시작 30분 전부터</span></li>
      <li><img src="/posters/attendance-stamp.webp" alt="" width="856" height="725"><b><i>2</i>나갈 때 한 번 더</b><span>퇴실까지 찍어야 출석 완료</span></li>
    </ol>
    <footer class="foot">
      <p>수업 시작 7분이 지나면 지각 · 퇴실은 입실 30분 뒤부터 수업 끝나고 30분까지 · 불라방·인강 날은 찍지 않아요</p>
      <p><span>QR 이 안 찍히면 선생님께 말씀해 주세요</span><span>${esc(issued)}</span></p>
    </footer>
  </div>
</section>`;
}

const CSS = `
@page { size: A4 landscape; margin: 0; }
*, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; }
body { font-family: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif; color: #17121F; background: #EEEAF1; word-break: keep-all; -webkit-font-smoothing: antialiased; }
.bar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 12px 16px; background: #fff; box-shadow: 0 1px 0 #E7E1EA; font-size: 14px; }
.bar a { color: #E61E75; font-weight: 700; text-decoration: none; }
.bar p { flex: 1 1 280px; margin: 0; color: #5B5466; line-height: 1.5; }
.bar b { color: #17121F; }
.bar button { font: inherit; font-weight: 800; color: #fff; background: #FF2E88; border: 0; border-radius: 12px; padding: 10px 20px; cursor: pointer; }
.bar button:hover { background: #E61E75; }
.stage { display: flex; justify-content: center; padding: 24px 16px 48px; }
.sheet { position: relative; display: flex; flex: none; width: 297mm; height: 210mm; background: #fff; box-shadow: 0 12px 40px rgba(23, 18, 31, .16); overflow: hidden; }
.cut { position: absolute; top: 0; bottom: 0; left: 148.5mm; border-left: .25mm dashed #BDB5C4; }
.poster { flex: none; width: 148.5mm; height: 210mm; padding: 7mm; }
.frame { position: relative; display: flex; flex-direction: column; height: 100%; padding: 7mm 7.5mm 5.5mm; border: .9mm solid #FF2E88; border-radius: 7mm; background: #fff; overflow: hidden; }
.top { display: flex; align-items: center; justify-content: space-between; height: 11mm; flex: none; }
.logo { display: block; width: auto; height: 10mm; }
.pill { padding: 1.5mm 3.4mm; border-radius: 99mm; background: #FF2E88; color: #fff; font-size: 9.5pt; font-weight: 800; letter-spacing: -.01em; }
.middle { position: relative; flex: 1; min-height: 0; margin-top: 4mm; }
.left { position: relative; z-index: 1; width: 70mm; }
h1 { margin: 0; font-size: 26pt; line-height: 1.2; font-weight: 900; letter-spacing: -.03em; }
h1 em { font-style: normal; color: #FF2E88; }
.sub { margin: 2mm 0 0; font-size: 10pt; line-height: 1.45; font-weight: 600; color: #4A4453; }
.qrcard { width: 64mm; margin-top: 8mm; padding: 1.6mm; border: .8mm solid #FF2E88; border-radius: 5mm; background: #fff; }
.qr { display: block; width: 100%; height: auto; }
.hint { width: 64mm; margin: 1.8mm 0 0; text-align: center; font-size: 8.5pt; font-weight: 700; color: #E61E75; }
.who { position: absolute; right: -5mm; bottom: -9mm; width: 50mm; margin: 0; }
.who img { display: block; width: 100%; height: auto; }
.who figcaption { position: absolute; right: 5mm; bottom: 12mm; padding: 1.2mm 2.8mm; border-radius: 99mm; background: #17121F; color: #fff; font-size: 8pt; font-weight: 800; }
.steps { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; flex: none; margin: 3.5mm 0 0; padding: 3.2mm 3mm 3.4mm; list-style: none; border-radius: 5mm; background: #FFE4EF; }
.steps li { display: flex; flex-direction: column; align-items: center; text-align: center; }
.steps img { display: block; width: auto; height: 17mm; margin-bottom: 1.6mm; }
.steps li:first-child img { height: 19.5mm; margin-top: -2.5mm; } /* 휴대폰 그림은 여백이 넓어 같은 높이면 작아 보인다 */
.steps b { display: flex; align-items: center; gap: 1.4mm; font-size: 11pt; font-weight: 900; letter-spacing: -.02em; }
.steps i { display: inline-grid; place-items: center; width: 4.8mm; height: 4.8mm; border-radius: 50%; background: #FF2E88; color: #fff; font-style: normal; font-size: 7.5pt; font-weight: 900; }
.steps span { margin-top: .8mm; font-size: 8.3pt; font-weight: 600; color: #4A4453; }
.foot { flex: none; margin-top: 2.6mm; font-size: 7.6pt; line-height: 1.5; color: #5B5466; }
.foot p { margin: 0; }
.foot p + p { display: flex; justify-content: space-between; gap: 3mm; margin-top: .6mm; font-weight: 700; color: #17121F; }
.foot p + p span:last-child { font-weight: 600; color: #8E8799; }
@media print {
  html, body { width: 297mm; height: 210mm; overflow: hidden; background: #fff; }
  .bar { display: none; }
  .stage { display: block; padding: 0; }
  .sheet { box-shadow: none; zoom: 1 !important; }
}`;

/** 화면에서는 종이를 창 폭에 맞춰 줄이고(인쇄할 때는 원래 크기), 인쇄 버튼을 단다 */
const SCRIPT = `(function () {
  var s = document.getElementById("sheet");
  function fit() { s.style.zoom = ""; var z = Math.min(1, (window.innerWidth - 32) / s.getBoundingClientRect().width); if (z < 1) s.style.zoom = String(z); }
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("beforeprint", function () { s.style.zoom = ""; });
  window.addEventListener("afterprint", fit);
  document.getElementById("print").addEventListener("click", function () { window.print(); });
})();`;

export type PosterSheet = { qr: QrMatrix; issuedAt: string | null | undefined };

/** A4 한 장(A5 포스터 둘) 전체 문서. 강사가 둘보다 적으면 있는 사람으로 채운다 */
export function posterSheetHtml({ qr, issuedAt }: PosterSheet): string {
  const svg = qrSvg(qr);
  const issued = issuedLabel(issuedAt);
  const people: Who[] = [0, 1].map((k) => {
    const i = site.instructors[k % site.instructors.length];
    const c = i.casual[0];
    return { name: i.name, part: i.part, src: c.src, width: c.width, height: c.height };
  });

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>출석 QR 포스터 | ${esc(site.name)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" crossorigin="anonymous">
<style>${CSS}</style>
</head>
<body>
<div class="bar">
  <a href="/admin/attendance/poster">← 포스터 관리</a>
  <p><b>인쇄 설정</b> — 용지 A4 · 방향 가로 · 여백 기본값 · 배율 100%. 가운데 점선을 자르면 A5 두 장이에요.${issued ? ` 이 QR 은 <b>${esc(issued)}</b> — 새로 뽑으면 이 종이는 찍히지 않아요.` : ""}</p>
  <button type="button" id="print">인쇄하기</button>
</div>
<main class="stage">
  <div class="sheet" id="sheet">${people.map((p) => poster(p, svg, issued)).join("")}
    <div class="cut" aria-hidden="true"></div>
  </div>
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}
