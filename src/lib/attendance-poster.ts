/**
 * 인쇄용 출석 QR 포스터의 글자와 이름 (2026-09-21 Alan — "QR을 A5 크기로 2개 해서 A4로 인쇄할 수 있도록 디자인해서 만들어줘. 힉스필드로 제작부탁해!",
 * 2026-09-22 — "QR 자동으로 바뀌는 거는 없애줘 … 새로 만들기 버튼을 누르면 인쇄까지 할 수 있도록 다운로드").
 *
 * 포스터는 **PDF 파일로 내려받는다** (`attendance-poster-pdf.ts` 가 그린다). 여기 있는 것은 순수 함수와 문구뿐이다 —
 * 문구를 한곳에 모아 두는 이유는 **PDF 에 넣는 글꼴이 이 글자들만 남긴 작은 파일**이기 때문이다 (`assets/poster-fonts/`).
 * 문구를 바꾸면 `node scripts/poster-fonts.mjs <Pretendard TTF 폴더>` 로 글꼴을 다시 만든다 — 안 만들면
 * 새 글자가 빈칸으로 찍히고 `attendance-poster.test.ts` 가 깨진다.
 *
 * 규칙 숫자(수업 30분 전부터 입실 · 7분 지각 · 입실 30분 뒤부터 퇴실 · 끝나고 30분까지)는 SQL `attendance_scan` 에 있다.
 * 바꾸면 아래 문구도 고친다 (`attendance.ts` 의 학생 화면 문구와 같은 규칙).
 */

/** 포스터에 찍는 글자 (강사 이름·발행 시각은 따로 — 이름은 `site.instructors`, 시각은 `issuedLabel`) */
export const POSTER_TEXT = {
  pill: "강의실 출석 QR",
  /** 큰 제목 두 줄. `em: true` 조각은 분홍 */
  title: [
    [{ t: "들어올 때 " }, { t: "찰칵", em: true }, { t: "," }],
    [{ t: "나갈 때 " }, { t: "찰칵", em: true }, { t: "!" }],
  ],
  sub: ["휴대폰 기본 카메라로 찍으면", "입실·퇴실이 기록돼요"],
  hint: "로그인한 휴대폰으로 찍어 주세요",
  steps: [
    { n: "1", title: "들어올 때 찰칵", body: "입실 · 수업 시작 30분 전부터" },
    { n: "2", title: "나갈 때 한 번 더", body: "퇴실까지 찍어야 출석 완료" },
  ],
  rules: ["수업 시작 7분이 지나면 지각 · 퇴실은 입실 30분 뒤부터 수업 끝나고 30분까지", "불라방·인강 날은 찍지 않아요"],
  help: "QR 이 안 찍히면 선생님께 말씀해 주세요",
} as const;

function kstParts(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
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
  return { y: p("year"), m: p("month"), d: p("day"), h: p("hour"), min: p("minute") };
}

/** 발행 시각 → `2026.09.21 16:40 발행` (한국 시간). 새로 만든 뒤 붙어 있는 옛 종이를 가려내는 표시 */
export function issuedLabel(iso: string | null | undefined): string {
  const t = kstParts(iso);
  return t ? `${t.y}.${t.m}.${t.d} ${t.h}:${t.min} 발행` : "";
}

/** 내려받는 파일 이름 — 발행 시각이 들어가 옛 파일과 헷갈리지 않는다. `역전토익_출석QR포스터_2026-09-21_1640.pdf` */
export function posterFileName(iso: string | null | undefined): string {
  const t = kstParts(iso);
  return t ? `역전토익_출석QR포스터_${t.y}-${t.m}-${t.d}_${t.h}${t.min}.pdf` : "역전토익_출석QR포스터.pdf";
}

/** `Content-Disposition` — 한글 이름(filename*)과 옛 브라우저용 영문 이름을 함께 준다 */
export function posterDisposition(iso: string | null | undefined): string {
  const name = posterFileName(iso);
  const ascii = name.replace("역전토익_출석QR포스터", "winnertoeic-attendance-qr").replace(/[^\x20-\x7e]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
