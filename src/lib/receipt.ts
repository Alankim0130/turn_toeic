/**
 * 수강증 글자 판독기 — OCR 이 뽑은 원문에서 판정에 쓰는 키를 읽는다.
 *
 * 무엇을 보고 판정하는지는 CLAUDE.md "수강증 OCR 자동 등업 › 수강증 표기 규칙" (2026-09-16 Alan 확정)이 진실의 원천이다.
 *  - 수강 방식: 강의실이 `온라인 강의` 면 불라방(live), 아니면 현장(onsite) (2026-09-18 Alan). `라이브방송` 이 붙어서 읽히면 보조 신호.
 *    `인강` 은 불라방이 아니다 (화목금 인강 = 오전 녹화본).
 *  - 주3일/주5일 · 트랙: `주5일` 을 먼저 본다 — 주5일 표기 안에도 `월수금`·`화목금` 글자가 있어서 트랙부터 보면 주3일로 오독한다.
 *  - 레벨: 650 · 750 · 850 숫자. `프리미어반`·`스파르타`·`중급속성`·`실전속성` 중 하나라도 있으면 스파르타(program = sparta).
 *    `중급속성` = 650, `실전속성` = 750 — 숫자를 못 읽으면 이걸로 레벨을 정하고, 숫자와 다르면 경고를 남긴다.
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
  /**
   * 수강증에 적힌 날짜들의 (연·월) — **수강 기간뿐 아니라 결제일·발행일도 함께 걸린다.**
   * 어느 줄이 수강 기간인지는 실물 샘플을 봐야 알 수 있어서(미확정 5) 가려내지 않고 모은다.
   * 판정은 "이 중 하나라도 열린 기수면 통과" 로 쓴다 — 8월에 결제한 9월 강좌를 거절하지 않게.
   */
  months: { year: number; month: number }[];
  /**
   * 수강증 맨 위 배지 `09월 과정` 의 달 (1~12). 연도는 없다.
   * **수강월을 가리키는 가장 직접적인 신호**다 — `months` 는 캡처 시각·결제일도 섞여 있다.
   */
  courseMonth: number | null;
  /** 참고용. 판정에 쓰지 않는다 (수강료는 선택 항목) */
  tuition: number | null;
  warnings: string[];
};

/** 수강증에 찍히는 키워드. 값이 바뀌면 CLAUDE.md 표기 규칙 표도 같이 고친다 */
export const RECEIPT_KEYWORDS = {
  /** 불라방 판정 1순위: 강의실 칸이 `온라인 강의` 다 (2026-09-18 Alan). 한 줄에 딱 찍혀 줄바꿈으로 갈리지 않는다 */
  online: "온라인강의",
  /** 수강요일 줄의 `라이브방송` — 있으면 불라방이지만 화면 폭 때문에 두 줄로 갈려 못 읽는 일이 잦다. 보조 신호 */
  live: "라이브방송",
  weekly5: "주5일",
  sessions18: "월18회",
  sessions9: "월9회",
  mwf: "월수금",
  ttf: "화목금",
  /** 스파르타(프리미어)반 표기. 어느 하나만 읽혀도 sparta 다 — `프리미어반` 한 글자 오인식에 무너지지 않게 (2026-09-18 Alan 확인) */
  spartaWords: ["프리미어", "스파르타", "중급속성", "실전속성"],
  /** 과정명이 레벨을 정한다: 스파르타 650+ 중급속성 · 스파르타 750+ 실전속성 */
  spartaLevelWords: { 중급속성: 650, 실전속성: 750 } as Record<string, number>,
  brand: "역전토익",
  instructors: ["이혜영", "이영수"],
  academy: "YBM",
  /** 수강증 화면의 학원 줄 라벨. 값은 `수강센터  부산 서면센터` 처럼 찍힌다 */
  academyLabel: "수강센터",
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

/**
 * 게이트 G1: 우리 센터 수강증인가.
 *
 * **수강증 화면에는 `YBM` 글자가 없다** (2026-09-16 Alan 샘플로 확인) — 학원 줄은 `수강센터  부산 서면센터` 다.
 * `YBM` 을 필수로 두면 멀쩡한 수강증이 전부 거절된다. 그래서 지역(서면·부산)에 더해
 * `수강센터` 라벨이나 `YBM` 중 하나가 보이면 통과시킨다 — 지역 단어만 보면 아무 문서나 통과하므로 둘 다 본다.
 */
export function passesAcademyGate(compact: string): boolean {
  const upper = compact.toUpperCase();
  const place = RECEIPT_KEYWORDS.academyPlaces.some((p) => compact.includes(p));
  const academy = upper.includes(RECEIPT_KEYWORDS.academy) || fuzzyIncludes(compact, RECEIPT_KEYWORDS.academyLabel, 1);
  return place && academy;
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

/**
 * 수강증에 적힌 날짜의 (연·월)을 전부 모은다.
 *
 * `2026-09-01` · `2026.09.01` · `2026/09/01` · `2026년 9월 1일` 을 읽는다.
 * **뒤에 구분자가 오는 것만 센다** — 그래야 금액·영수증번호의 숫자 뭉치를 날짜로 오독하지 않는다.
 * 두 자리 연도(`26.09.01`)는 읽지 않는다: 금액·번호와 구분이 안 돼 잘못 읽을 위험이 더 크다.
 */
export function parseReceiptMonths(text: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]/g)) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year < 2020 || year > 2100 || month < 1 || month > 12) continue;
    const key = `${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ year, month });
  }
  return out;
}

/**
 * `09월 과정` · `9월과정` → 9. 수강증 화면 맨 위 배지 (2026-09-16 샘플).
 * 공백을 지운 원문에서는 바로 앞 줄의 캡처 시각 초(`…19:27:43`)가 `09` 에 붙어 `4309월과정` 이 되므로
 * "앞에 숫자가 없어야 한다" 는 조건을 두면 못 읽는다 — 가장 왼쪽에서 `월 과정` 에 붙는 한두 자리만 본다.
 */
export function parseCourseMonth(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*월\s*과정/);
  if (!m) return null;
  const month = Number(m[1]);
  return month >= 1 && month <= 12 ? month : null;
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
  if (!gates.academy) warnings.push("수강센터(부산 서면센터) 줄을 찾지 못했어요");
  if (!gates.brand) warnings.push("역전토익 또는 강사명을 찾지 못했어요");

  // 수강 방식 — **강의실이 `온라인 강의` 면 불라방** (2026-09-18 Alan: "온라인 강의로 판단하면 되겠네").
  // 수강요일 줄의 `라이브방송` 은 화면 폭 때문에 `라이` / `브방송` 으로 갈려 자주 안 읽히므로 붙어서 읽힌 경우에만 보조로 본다.
  // 조각을 맞추는 짓은 하지 않는다 (헷갈린다 — Alan). `인강` 은 신호가 아니다 (화목금 인강 = 오전 녹화본, 현장)
  const mode: EnrollMode =
    fuzzyIncludes(compact, RECEIPT_KEYWORDS.online, 1) || fuzzyIncludes(compact, RECEIPT_KEYWORDS.live, 1) ? "live" : "onsite";

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

  // 과정 — 프리미어 · 스파르타 · 중급속성 · 실전속성 중 하나라도 있으면 스파르타반
  const program: Program = RECEIPT_KEYWORDS.spartaWords.some((w) => fuzzyIncludes(compact, w, 1)) ? "sparta" : "score";
  // 과정명이 레벨을 말해 준다 (중급속성 = 650, 실전속성 = 750). 숫자를 못 읽었을 때 대신 쓰고, 읽었는데 다르면 경고
  const courseLevel =
    Object.entries(RECEIPT_KEYWORDS.spartaLevelWords).find(([word]) => fuzzyIncludes(compact, word, 1))?.[1] ?? null;

  const levels = parseLevels(compact);
  let level = levels[0] ?? null;
  if (level == null && courseLevel != null) {
    level = courseLevel;
    warnings.push(`레벨 숫자는 못 읽었지만 과정명으로 ${courseLevel} 으로 봤어요`);
  } else if (level == null) {
    warnings.push("레벨(650/750/850)을 찾지 못했어요");
  }
  if (levels.length > 1) warnings.push(`레벨이 여러 개 적혀 있어요: ${levels.join(", ")}`);
  if (courseLevel != null && level != null && courseLevel !== level) {
    warnings.push(`과정명(${courseLevel === 650 ? "중급속성" : "실전속성"} = ${courseLevel})과 레벨 숫자(${level})가 달라요`);
  }

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
    months: parseReceiptMonths(text),
    courseMonth: parseCourseMonth(text),
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
