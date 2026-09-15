/**
 * 네이버 예약 알림(문자·메일·앱 알림 원문)에서 예약 정보를 뽑는다. 서버·브라우저 어디서나 쓰는 순수 함수.
 *
 * 네이버는 개별 사업자용 예약 조회 API 가 없어서, 네이버가 보내는 알림 원문을 받아 해석한다.
 * 알림 형식이 조금씩 달라도 동작하도록
 *   1) "이용일시·방문일시" 같은 예약 시각 줄을 우선하고 "신청일시·접수일시" 줄은 피한다
 *   2) 날짜를 못 찾으면 parsed=false 로 두고, 원문은 그대로 저장·알림한다 (정보를 버리지 않는다)
 */

export type ReservationStatus = "requested" | "confirmed" | "cancelled" | "changed" | "unknown";

export type ParsedReservation = {
  /** 예약 날짜를 찾았는지 */
  parsed: boolean;
  status: ReservationStatus;
  /** YYYY-MM-DD (한국 날짜) */
  date: string | null;
  /** HH:MM (24시간) */
  time: string | null;
  itemName: string | null;
  /** 가운데 글자를 가린 이름 */
  customerName: string | null;
  bookingNumber: string | null;
  /** 전화번호를 가리고 줄 공백을 정리한 원문 */
  text: string;
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  requested: "새 예약",
  confirmed: "예약 확정",
  cancelled: "예약 취소",
  changed: "예약 변경",
  unknown: "예약 알림",
};

// ─── 개인정보 가리기 ─────────────────────────────────────────────────────────

export function maskPhones(s: string) {
  return s.replace(/(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g, (_m, a: string, _b: string, c: string) => `${a}-****-${c}`);
}

export function maskName(name: string) {
  const n = name.trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${"*".repeat(n.length - 2)}${n[n.length - 1]}`;
}

// ─── HTML 메일 → 글자 ────────────────────────────────────────────────────────

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'");
}

// ─── 날짜·시각 ───────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 연도가 없는 "9월 20일" 은 오늘에서 가장 가까운(되도록 앞으로 올) 해로 정한다 */
function inferYear(m: number, d: number, today: string) {
  const [ty, tm, td] = today.split("-").map(Number);
  const base = Date.UTC(ty, tm - 1, td);
  let best = ty;
  let bestScore = Infinity;
  for (const y of [ty - 1, ty, ty + 1]) {
    if (!validDate(y, m, d)) continue;
    const diffDays = (Date.UTC(y, m - 1, d) - base) / 86_400_000;
    // 지난 날짜는 60일까지만 자연스럽다고 보고, 그 밖은 벌점을 크게 준다
    const score = diffDays >= -60 ? Math.abs(diffDays) : Math.abs(diffDays) * 10;
    if (score < bestScore) {
      bestScore = score;
      best = y;
    }
  }
  return best;
}

type DateHit = { date: string; end: number };

function findDate(line: string, today: string): DateHit | null {
  const full = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)\s*일?/.exec(line);
  if (full) {
    const [y, m, d] = [Number(full[1]), Number(full[2]), Number(full[3])];
    if (validDate(y, m, d)) return { date: `${y}-${pad(m)}-${pad(d)}`, end: full.index + full[0].length };
  }
  const md = /(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(line);
  if (md) {
    const [m, d] = [Number(md[1]), Number(md[2])];
    const y = inferYear(m, d, today);
    if (validDate(y, m, d)) return { date: `${y}-${pad(m)}-${pad(d)}`, end: md.index + md[0].length };
  }
  return null;
}

function findTime(s: string): string | null {
  const ko = /(오전|오후|낮|밤|저녁|새벽)\s*(\d{1,2})\s*(?::\s*(\d{2})|시(?:\s*(\d{1,2})\s*분)?|시)/.exec(s);
  if (ko) {
    let h = Number(ko[2]);
    const min = Number(ko[3] ?? ko[4] ?? 0);
    const pm = ko[1] === "오후" || ko[1] === "저녁" || ko[1] === "밤" || (ko[1] === "낮" && h < 12);
    if (pm && h < 12) h += 12;
    if (ko[1] === "오전" && h === 12) h = 0;
    if (h <= 23 && min <= 59) return `${pad(h)}:${pad(min)}`;
  }
  const hm = /(?<!\d)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?!\d)/.exec(s);
  if (hm) return `${pad(Number(hm[1]))}:${hm[2]}`;
  const si = /(?<!\d)([01]?\d|2[0-3])\s*시(?:\s*([0-5]?\d)\s*분)?/.exec(s);
  if (si) return `${pad(Number(si[1]))}:${pad(Number(si[2] ?? 0))}`;
  return null;
}

/** "HH:MM" → "오후 3:00" */
export function koreanTime(hhmm: string | null | undefined) {
  if (!hhmm) return "";
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${pad(m)}`;
}

// 예약 시각을 뜻하는 줄 / 예약 시각이 아닌 줄
const PREFER_LINE = /(이용|방문|예약|상담|수업|체험)\s*(일시|날짜|일자|시간|예정)|일\s*시|예약일|이용일|방문일/;
const AVOID_LINE = /(신청|접수|요청|결제|취소|변경|발송|작성|등록|처리)\s*(일시|일자|시간|날짜|시각)/;

// ─── 나머지 항목 ─────────────────────────────────────────────────────────────

function labelValue(lines: string[], label: RegExp) {
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i]);
    if (!m) continue;
    const after = lines[i].slice(m.index + m[0].length).replace(/^\s*[:：]\s*/, "").trim();
    if (after) return after;
    if (lines[i + 1]) return lines[i + 1].trim();
  }
  return null;
}

function detectStatus(head: string, all: string): ReservationStatus {
  const rules: [ReservationStatus, RegExp][] = [
    ["cancelled", /예약\s*(이|을|가)?\s*취소|취소\s*(되었|됐|완료|요청|처리)|예약취소/],
    ["changed", /예약\s*(이|을|가)?\s*변경|변경\s*(되었|됐|완료|요청)/],
    ["confirmed", /예약\s*(이|을|가)?\s*확정|확정\s*(되었|됐|완료)/],
    ["requested", /신청|접수|요청|새로운\s*예약|신규\s*예약|새\s*예약|예약\s*(이|가)\s*(들어|왔|도착)/],
  ];
  for (const src of [head, all]) {
    for (const [status, re] of rules) if (re.test(src)) return status;
  }
  return "unknown";
}

// ─── 본체 ────────────────────────────────────────────────────────────────────

export function parseNaverReservation(input: string, today: string): ParsedReservation {
  const text = maskPhones(input)
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  const lines = text.split("\n");

  // 날짜: 예약 시각 줄 우선, 신청·접수 시각 줄은 뒤로
  let best: { i: number; hit: DateHit; score: number } | null = null;
  lines.forEach((line, i) => {
    const hit = findDate(line, today);
    if (!hit) return;
    const labelArea = `${lines[i - 1] ?? ""} ${line.slice(0, hit.end)}`;
    let score = 0;
    if (PREFER_LINE.test(line) || (PREFER_LINE.test(lines[i - 1] ?? "") && !findDate(lines[i - 1] ?? "", today))) score += 2;
    if (AVOID_LINE.test(labelArea)) score -= 3;
    if (!best || score > best.score) best = { i, hit, score };
  });

  let date: string | null = null;
  let time: string | null = null;
  if (best) {
    const { i, hit } = best as { i: number; hit: DateHit };
    date = hit.date;
    time = findTime(lines[i].slice(hit.end)) ?? findTime(lines[i + 1] ?? "") ?? findTime(lines[i]);
  }

  const itemRaw =
    labelValue(lines, /(예약\s*상품|이용\s*상품|상품명|예약\s*항목|서비스명|예약명|상품)(?=\s*[:：]|\s*$)/) ??
    /([가-힣A-Za-z0-9/+ ]{0,20}(강사상담|방문상담|상담))/.exec(text)?.[1] ??
    null;
  const itemName = itemRaw ? itemRaw.replace(/^[\s·:：-]+|[\s·.,:：-]+$/g, "").slice(0, 60) || null : null;

  const nameRaw =
    labelValue(lines, /(예약자\s*(명|이름)?|고객\s*명|이용자\s*(명)?|성함|이름)(?=\s*[:：]|\s*$)/) ??
    /([가-힣]{2,4})\s*님(?:의|이|께서)?\s*(?:새로운\s*)?예약/.exec(text)?.[1] ??
    null;
  const nameClean = nameRaw ? nameRaw.replace(/[^가-힣A-Za-z\s]/g, "").trim().split(/\s+/)[0] ?? "" : "";
  const customerName = nameClean && !/^(고객|예약자|회원|사장|대표|관리자)$/.test(nameClean) ? maskName(nameClean.slice(0, 20)) : null;

  const bookingNumber = /(예약\s*번호|주문\s*번호|예약\s*No\.?)\s*[:：#]?\s*([A-Za-z0-9-]{4,})/i.exec(text)?.[2] ?? null;

  const head = lines.slice(0, 2).join(" ");
  const status = detectStatus(head, text);

  return { parsed: date !== null, status, date, time, itemName, customerName, bookingNumber, text };
}
