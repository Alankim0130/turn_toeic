/**
 * 수강증 글자 판독기 — OCR 이 뽑은 원문에서 판정에 쓰는 키를 읽는다.
 *
 * 무엇을 보고 판정하는지는 CLAUDE.md "수강증 OCR 자동 등업 › 수강증 표기 규칙" (2026-09-16 Alan 확정)이 진실의 원천이다.
 *  - 수강 방식: `라이브방송` 이 있으면 불라방(live), 없으면 현장(onsite). `인강` 은 불라방이 아니다 (화목금 인강 = 오전 녹화본).
 *  - 주3일/주5일 · 트랙: `주5일` 을 먼저 본다 — 주5일 표기 안에도 `월수금`·`화목금` 글자가 있어서 트랙부터 보면 주3일로 오독한다.
 *  - 레벨: 650 · 750 · 850 숫자. `프리미어반` 이 붙으면 스파르타(program = sparta).
 *  - 수업 시간: `HH:MM~HH:MM` 을 **그대로** 돌려준다. 60/120분으로 가르지 않는다 — 실제 길이가 70·130·140·190·260분 등 다양해서
 *    숫자 기준선을 두면 850 70분이 60분으로, 스파르타가 120분으로 섞인다. 판정은 반의 `time_block` 라벨과 같은지로 한다.
 *
 * 이 파일은 순수 함수만 둔다 (DB · 엔진 없음). OCR 엔진은 미확정(CLAUDE.md 미확정 5)이라 인터페이스(OcrEngine)만 있다.
 * 한 글자 오인식에 무너지지 않도록 키워드는 편집거리 ≤ 1 로 찾는다 (G2 와 같은 방식).
 */

export type Track = "mwf" | "ttf";
export type EnrollMode = "onsite" | "live";
export type Program = "score" | "sparta";

export type ReceiptTime = {
  /** "10:00" */
  start: string;
  /** "12:10" */
  end: string;
  /** 시작~끝 분. 참고용 — 판정에는 timeBlock 문자열을 쓴다 */
  minutes: number;
  /** class_sections.time_block 과 같은 형식 "10:00~12:10" */
  timeBlock: string;
};

export type ParsedReceipt = {
  /** 정규화한 원문 (줄바꿈·공백 유지) */
  text: string;
  /** 공백을 뺀 원문 — 키워드 검색용 */
  compact: string;
  /** 게이트 G1 · G2 (텍스트로 판정 가능한 것만. G3 는 receiptHasName, G4 는 DB) */
  gates: { academy: boolean; brand: boolean };
  mode: EnrollMode;
  /** 5 = 주5일, 3 = 주3일, null = 못 읽음 */
  weekly: 5 | 3 | null;
  tracks: Track[];
  /** 수강증에 적힌 레벨 숫자들 (보통 하나) */
  levels: number[];
  level: number | null;
  program: Program;
  times: ReceiptTime[];
  /** 첫 시간 범위 */
  time: ReceiptTime | null;
  receiptNo: string | null;
  /** 참고용. 판정에 쓰지 않는다 (수강료는 선택 항목) */
  tuition: number | null;
  warnings: string[];
};

/** 수강증에 찍히는 키워드. 값이 바뀌면 CLAUDE.md 표기 규칙 표도 같이 고친다 */
export const RECEIPT_KEYWORDS = {
  live: "라이브방송",
  weekly5: "주5일",
  sessions18: "월18회",
  sessions9: "월9회",
  mwf: "월수금",
  ttf: "화목금",
  sparta: "프리미어",
  brand: "역전토익",
  instructors: ["이혜영", "이영수"],
  academy: "YBM",
  academyPlaces: ["서면", "부산"],
} as const;

export const LEVELS = [650, 750, 850] as const;

/* ─── 문자열 도구 ────────────────────────────────────────────────────────── */

/** 편집거리 (레벤슈타인). 한글은 음절 하나가 글자 하나라 OCR 오인식 한 음절 = 거리 1 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * hay 안에 needle 이 편집거리 maxDist 이내로 들어 있는가 (슬라이딩 윈도우).
 * `역전토익` ↔ `력전토익`·`역젼토익` 처럼 한 글자 오인식을 허용한다.
 */
export function fuzzyIncludes(hay: string, needle: string, maxDist = 1): boolean {
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  if (maxDist <= 0) return false;
  const n = needle.length;
  for (let len = Math.max(1, n - maxDist); len <= n + maxDist; len++) {
    for (let i = 0; i + len <= hay.length; i++) {
      if (levenshtein(hay.slice(i, i + len), needle) <= maxDist) return true;
    }
  }
  return false;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 정규화 (CLAUDE.md 파이프라인):
 *  - 전각 → 반각 (NFKC: ０→0, （→(, ：→:)
 *  - 시각 구분자 `. ; ：` → `:`  (숫자 사이에서만 — 금액 콤마·날짜는 건드리지 않는다)
 *  - 범위 구분자 `- – — ～` → `~` (시각 사이에서만 — 전화번호·날짜의 하이픈은 그대로)
 */
export function normalizeReceiptText(raw: string): { text: string; compact: string } {
  let t = (raw ?? "").normalize("NFKC").replace(/\r\n?/g, "\n");
  t = t.replace(/(\d{1,2})\s*[.;:]\s*(\d{2})(?!\d)/g, "$1:$2");
  t = t.replace(/(\d{1,2}:\d{2})\s*[-–—~～]\s*(\d{1,2}:\d{2})/g, "$1~$2");
  return { text: t, compact: t.replace(/\s+/g, "") };
}

/* ─── 판독 ───────────────────────────────────────────────────────────────── */

/** 게이트 G1: 학원명에 YBM 과 (서면 또는 부산) */
export function passesAcademyGate(compact: string): boolean {
  const upper = compact.toUpperCase();
  return upper.includes(RECEIPT_KEYWORDS.academy) && RECEIPT_KEYWORDS.academyPlaces.some((p) => compact.includes(p));
}

/** 게이트 G2: 역전토익(편집거리 ≤ 1) 또는 강사명 */
export function passesBrandGate(compact: string): boolean {
  return fuzzyIncludes(compact, RECEIPT_KEYWORDS.brand, 1) || RECEIPT_KEYWORDS.instructors.some((n) => compact.includes(n));
}

/** 게이트 G3: 가입 실명이 수강증에 있는가 (공백 무시, 정확 일치 — 두세 글자 이름에 편집거리를 허용하면 동명이인이 섞인다) */
export function receiptHasName(text: string, name: string | null | undefined): boolean {
  const n = (name ?? "").normalize("NFKC").replace(/\s+/g, "");
  if (n.length < 2) return false;
  return text.normalize("NFKC").replace(/\s+/g, "").includes(n);
}

function parseTimes(compact: string): ReceiptTime[] {
  const out: ReceiptTime[] = [];
  const seen = new Set<string>();
  for (const m of compact.matchAll(/(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})/g)) {
    const sh = Number(m[1]), sm = Number(m[2]), eh = Number(m[3]), em = Number(m[4]);
    if (sh > 23 || eh > 23 || sm > 59 || em > 59) continue;
    const start = `${pad2(sh)}:${pad2(sm)}`;
    const end = `${pad2(eh)}:${pad2(em)}`;
    const minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes <= 0) continue;
    const timeBlock = `${start}~${end}`;
    if (seen.has(timeBlock)) continue;
    seen.add(timeBlock);
    out.push({ start, end, minutes, timeBlock });
  }
  return out;
}

function parseLevels(compact: string): number[] {
  // 앞뒤에 숫자·콜론이 붙으면 레벨이 아니다 — "16:50" 의 6:50, "1650원" 의 650 을 걸러낸다
  const found = new Set<number>();
  for (const m of compact.matchAll(/(?<![\d:])(650|750|850)(?![\d:])/g)) found.add(Number(m[1]));
  return LEVELS.filter((l) => found.has(l));
}

function parseReceiptNo(text: string): string | null {
  const m = text.match(/(?:영수증|승인|접수|주문|거래|결제)?\s*(?:번호|No\.?|NO\.?|#)\s*[:：]?\s*([A-Z0-9][A-Z0-9-]{5,})/i);
  return m ? m[1].toUpperCase() : null;
}

function parseTuition(compact: string): number | null {
  const m = compact.match(/(\d{1,3}(?:,\d{3})+|\d{5,})원/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * OCR 원문 → 판정 키. 못 읽은 항목은 null/빈 배열로 두고 warnings 에 이유를 남긴다.
 * 후보 대조(어느 반인가)는 여기서 하지 않는다 — 반 스키마(60분/120분 반·묶음 권한)가 정해진 뒤 별도 함수로 붙인다.
 */
export function parseReceipt(raw: string): ParsedReceipt {
  const { text, compact } = normalizeReceiptText(raw);
  const warnings: string[] = [];

  const gates = { academy: passesAcademyGate(compact), brand: passesBrandGate(compact) };
  if (!gates.academy) warnings.push("학원명(YBM 서면/부산)을 찾지 못했어요");
  if (!gates.brand) warnings.push("역전토익 또는 강사명을 찾지 못했어요");

  // 수강 방식 — 오직 `라이브방송` 으로만. `인강` 은 신호가 아니다
  const mode: EnrollMode = fuzzyIncludes(compact, RECEIPT_KEYWORDS.live, 1) ? "live" : "onsite";

  // 주5일 먼저, 그다음 트랙 글자
  let weekly: 5 | 3 | null = null;
  let tracks: Track[] = [];
  if (fuzzyIncludes(compact, RECEIPT_KEYWORDS.weekly5, 1) || compact.includes(RECEIPT_KEYWORDS.sessions18)) {
    weekly = 5;
    tracks = ["mwf", "ttf"];
  } else {
    const mwf = fuzzyIncludes(compact, RECEIPT_KEYWORDS.mwf, 1);
    const ttf = fuzzyIncludes(compact, RECEIPT_KEYWORDS.ttf, 1);
    if (mwf && ttf) {
      tracks = ["mwf", "ttf"];
      warnings.push("월수금·화목금이 함께 있는데 주5일 표기를 못 읽었어요");
    } else if (mwf || ttf) {
      weekly = 3;
      tracks = [mwf ? "mwf" : "ttf"];
    } else {
      warnings.push("트랙(월수금/화목금/주5일)을 찾지 못했어요");
    }
  }

  const levels = parseLevels(compact);
  const level = levels[0] ?? null;
  if (levels.length === 0) warnings.push("레벨(650/750/850)을 찾지 못했어요");
  if (levels.length > 1) warnings.push(`레벨이 여러 개 적혀 있어요: ${levels.join(", ")}`);

  const program: Program = fuzzyIncludes(compact, RECEIPT_KEYWORDS.sparta, 1) ? "sparta" : "score";

  const times = parseTimes(compact);
  if (times.length === 0) warnings.push("수업 시간(HH:MM~HH:MM)을 찾지 못했어요");

  return {
    text,
    compact,
    gates,
    mode,
    weekly,
    tracks,
    levels,
    level,
    program,
    times,
    time: times[0] ?? null,
    receiptNo: parseReceiptNo(text),
    tuition: parseTuition(compact),
    warnings,
  };
}

/* ─── OCR 엔진 자리 ──────────────────────────────────────────────────────── */

export type OcrResult = { text: string; engine: string; raw?: unknown };

/**
 * OCR 엔진 어댑터. 엔진은 미확정(CLAUDE.md 미확정 5) — 샘플 수강증과 키를 받은 뒤 구현한다.
 * 어떤 엔진이든 원문 text 만 돌려주면 parseReceipt 가 그 뒤를 맡는다.
 */
export interface OcrEngine {
  readonly name: string;
  recognize(input: { bytes: Uint8Array; mimeType: string }): Promise<OcrResult>;
}
