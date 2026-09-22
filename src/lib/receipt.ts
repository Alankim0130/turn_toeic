/**
 * 수강증 글자 판독기 — OCR 이 뽑은 원문에서 판정에 쓰는 키를 읽는다.
 *
 * 무엇을 보고 판정하는지는 CLAUDE.md "수강증 OCR 자동 등업 › 수강증 표기 규칙" (2026-09-16 Alan 확정)이 진실의 원천이다.
 *  - 수강 방식: 강의실이 `온라인 강의` 면 불라방(live), 아니면 현장(onsite) (2026-09-18 Alan). `라이브방송` 이 붙어서 읽히면 보조 신호.
 *    `인강` 은 불라방이 아니다 (화목금 인강 = 오전 녹화본).
 *  - 주3일/주5일 · 트랙: 회차 `월18회`(주5일) · `월9회`(주3일)를 먼저, 그다음 `주5일` 을 본다 — 주5일 표기 안에도 `월수금`·`화목금`
 *    글자가 있어서 트랙부터 보면 주3일로 오독한다. `주5일` 은 숫자 5 가 꼭 있어야 한다 (`25일`·`일주일` 은 주5일이 아니다).
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
  /**
   * 수강 방식을 **무엇을 보고** 정했나 (2026-09-22). `online` = 강의실 칸의 `온라인 강의` · `room` = 강의실 칸의 호실(`701호`) ·
   * `live` = 강의실 칸을 못 읽었는데 `라이브방송`·`온라인 강의` 글자는 어딘가에 있음 · `null` = 아무것도 못 읽어 기본값(현장).
   * **자동 승인은 강의실 칸을 읽었을 때(`online`·`room`)만 한다** — 불라방 학생이 현장으로 들어가면 교재주문·수업 알림이 막히고,
   * 광고 배너의 `온라인 강의` 글자로 현장 학생이 불라방이 되면 안 된다 (firsttoeic 사고 2: 배너 글자로 오배정).
   */
  modeEvidence: "online" | "room" | "live" | null;
  /**
   * 수강증 **카드의 칸 라벨**(`수강생` · `수강센터` · `수강시간`)이 다 보이나 (2026-09-22, firsttoeic 사고 2 "마이페이지 광고 배너의
   * `550+ 1단계` 로 오배정"). 카드가 없는 화면의 글자로 반을 정하지 않게 — 없으면 자동 승인하지 않는다 (거절은 아니다).
   */
  card: boolean;
  /**
   * `역전토익` 글자를 **그대로** 읽었나 (2026-09-22, firsttoeic 사고 3 "다른 과정 수강증이 승인됐다").
   * 게이트 G2 는 한 글자 오인식(`실전토익`)과 강사명만으로도 통과시키지만(덜 거절하려고), **자동 승인은 이 글자가 있어야** 한다 —
   * 같은 강사가 맡은 다른 과정이나 `실전토익` 같은 비슷한 이름의 과정이 시간대만 맞아 자동으로 붙지 않게.
   */
  brandExact: boolean;
  /**
   * 다시보기권처럼 **등업이 아닌 상품**의 표시가 보이나 — `다시보기`(라벨이 사이에 끼어 `다시수강요일보기` 로 읽힌 것 포함) · `00:00~23:59`
   * (2026-09-22, firsttoeic 사고 4 "다시보기권이 정규반으로 등업됐다"). 자동 승인하지 않고 승인 화면에 적는다.
   */
  replayPass: boolean;
  /** 5 = 주5일, 3 = 주3일, null = 못 읽음 */
  weekly: 5 | 3 | null;
  tracks: Track[];
  /** 수강증에 적힌 레벨 숫자들 (보통 하나) */
  levels: number[];
  level: number | null;
  /** 과정명이 말하는 레벨 (`중급속성` = 650 · `실전속성` = 750). 없으면 null. 숫자와 다르면 자동 승인하지 않는다 */
  courseLevel: number | null;
  program: Program;
  times: ReceiptTime[];
  /** 첫 시간 범위 */
  time: ReceiptTime | null;
  /**
   * 수강증에 적힌 날짜들의 (연·월) — 수강 기간·결제일·발행일이 있으면 함께 걸린다.
   * 판정은 "이 중 하나라도 열린 기수면 통과" 로 쓴다 — 8월에 결제한 9월 강좌를 거절하지 않게.
   *
   * **캡처 시각(`현재시간 …`)은 뺀다** (2026-09-22). 캡처한 날은 수강월이 아니다 — 9월 25일에 10월 강좌를 등록하고 캡처하면
   * 날짜는 9월이다. 이걸 수강 날짜로 세면 배지를 못 읽었을 때 **10월 수강생을 9월 반에 자동 배정**하거나,
   * 8월 말에 캡처한 9월 수강증을 9월에 올렸을 때 **"날짜가 달라요" 로 거절**한다 (둘 다 재현했다).
   * 실물 수강증에는 캡처 시각 말고 연도가 붙은 날짜가 없어서 보통 빈 배열이다 — 수강월은 `courseMonth`·`startMonth` 가 정한다.
   */
  months: { year: number; month: number }[];
  /**
   * 수강증 맨 위 배지 `09월 과정` 의 달 (1~12). 연도는 없다.
   * **수강월을 가리키는 가장 직접적인 신호**다.
   */
  courseMonth: number | null;
  /**
   * 수강요일 줄 `[4주-09/04]` 의 개강일 달 (1~12). 배지를 못 읽었을 때 수강월로 쓴다 (2026-09-22).
   * 개강일은 그 달 안에 잡힌다 (9월 9.3·9.4, 10월 10.6·10.7 — CLAUDE.md 미확정 1).
   */
  startMonth: number | null;
  /**
   * 수강증 맨 위 `현재시간 2026-08-07 16:19:02` 의 날짜 (YYYY-MM-DD). 캡처한 시각이다.
   * 너무 오래된 캡처(지난달 것을 다시 올리기)를 자동 승인에서 빼는 데 쓴다 — 위조 판별은 아니다.
   */
  capturedOn: string | null;
  /**
   * 같은 줄의 **초까지** (`2026-08-07T16:19:02`). 시각이 안 읽혔으면 null.
   * 두 계정이 **같은 초**의 수강증을 냈으면 한쪽이 복사본이다 — 사람이 같은 초에 두 번 캡처할 수는 없다.
   * 파일 해시와 달리 **글자를 고쳐도 살아남아**, 친구 수강증의 이름만 바꾼 경우를 잡는다 (2026-09-19).
   */
  capturedAt: string | null;
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
 *
 * 시각의 앞자리는 **더 긴 숫자나 날짜의 일부가 아니어야** 한다 — 없으면 `2026.09.16` 의 `26.09` 를
 * 시각으로 보고 `2026:09.16` 으로 망가뜨려 날짜를 통째로 못 읽었다 (2026-09-22 재현).
 * 막는 것은 **앞에 숫자** 또는 **`숫자.`** 가 붙은 경우뿐이다 — `수강시간.10.00` 처럼 라벨 뒤 잡점은 그대로 시각으로 고친다.
 */
export function normalizeReceiptText(raw: string): { text: string; compact: string } {
  let t = (raw ?? "").normalize("NFKC").replace(/\r\n?/g, "\n");
  t = t.replace(/(?<!\d)(?<!\d\.)(\d{1,2})\s*[.;:]\s*(\d{2})(?!\d)/g, "$1:$2");
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

/** 이름 비교용: 글자만 남긴다. 한글 이름이면 한글만 — OCR 이 줄 끝에 붙이는 `_` `|` `l` 같은 찌꺼기를 떼어 낸다 */
function nameLetters(s: string, hangulOnly: boolean): string {
  const t = (s ?? "").normalize("NFKC");
  return hangulOnly ? t.replace(/[^가-힣]/g, "") : t.replace(/[^\p{L}]/gu, "").toLowerCase();
}

/** 수강증 칸 라벨의 첫머리. 수강생 값이 다음 줄로 내려갔을 때 그 줄이 라벨이면 값이 아니고, 값 뒤에 붙어 읽힌 다음 라벨은 떼어 낸다 */
const RECEIPT_LABEL_LINE = /^(수강|강사|레벨|강의실)/;

/**
 * 게이트 G3: 가입 실명이 수강증의 **`수강생` 칸 값**과 같은가 (공백 무시, 정확 일치 — 두세 글자 이름에 편집거리를 허용하면 동명이인이 섞인다).
 *
 * **원문 어딘가에 들어 있는지로 보지 않는다** (2026-09-22). 그렇게 보면 수강증의 다른 줄이 이름을 대신 채운다:
 *  - 강사 줄 `이영수 .이혜영` — 학생 이름이 **이혜영·이영수**(흔한 이름이다)거나 그 안에 든 `이영`·`이혜` 면 **남의 수강증으로도 늘 통과**한다.
 *  - 화면의 고정 글자 `이용약관` · `최근 본 강의` · `수강신청` — 이름이 `이용`·`최근`·`신청` 이면 늘 통과한다.
 * 실물 화면을 OCR 로 읽으면 `수강생 _ 김민수` 처럼 라벨과 값이 한 줄로 나온다 (폭 700 · 원본 크기 둘 다 확인).
 * 값이 다음 줄로 내려간 경우만 다음 줄을 본다. 라벨을 못 읽었으면 **통과시키지 않는다** — 자동 승인만 안 될 뿐 거절은 아니다.
 */
export function receiptHasName(text: string, name: string | null | undefined): boolean {
  const raw = (name ?? "").normalize("NFKC").replace(/\s+/g, "");
  const hangulOnly = /^[가-힣]+$/.test(raw);
  const want = nameLetters(raw, hangulOnly);
  if (want.length < 2) return false;

  const lines = (text ?? "").normalize("NFKC").split("\n").map((l) => l.replace(/\s+/g, ""));
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].indexOf("수강생");
    if (at < 0) continue;
    let value = nameLetters(lines[i].slice(at + "수강생".length), hangulOnly);
    if (!value && i + 1 < lines.length && !RECEIPT_LABEL_LINE.test(lines[i + 1])) value = nameLetters(lines[i + 1], hangulOnly);
    // 값 뒤에 다음 칸 라벨이 한 줄로 붙어 읽혔으면(`김민수수강센터부산…`) 이름까지만 본다 — 이름 뒤가 라벨로 시작할 때만.
    // `김민` 학생이 `김민수` 의 수강증을 내면 뒤가 `수수강센터…` 라 라벨이 아니어서 통과하지 않는다
    if (value === want || (value.startsWith(want) && RECEIPT_LABEL_LINE.test(value.slice(want.length)))) return true;
  }
  return false;
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
  // 앞뒤에 숫자·콜론이 붙으면 레벨이 아니다 — "16:50" 의 6:50, "1650원" 의 650 을 걸러낸다.
  // **금액의 세 자리 묶음도 레벨이 아니다** (2026-09-22) — `650,000원` · `1,850,000원` 의 650·850 을 레벨로 읽어
  // 750 수강증이 [650, 750] 이 되고 앞의 650 반에 자동 배정될 뻔했다 (재현). 그래서 앞뒤의 `,` 와 뒤의 `원` 도 막는다.
  // `.` 은 막지 않는다 — OCR 이 글자 앞에 잡점을 찍는다(`강사 _ 이영수 .이혜영`). `레벨 .650+` 를 놓치면 안 된다
  const found = new Set<number>();
  for (const m of compact.matchAll(/(?<![\d:,])(650|750|850)(?![\d:,원])/g)) found.add(Number(m[1]));
  return LEVELS.filter((l) => found.has(l));
}

/**
 * 주5일 표기 `주5일` — 한 글자 오인식(`주5알` · `추5일`)은 봐주되 **숫자 5 는 반드시 있어야** 한다 (2026-09-22).
 * 편집거리 1 로 찾으면 세 글자 중 두 글자만 맞아도 되어서 `5일`(날짜 `9월 25일`) · `주일`(`일주일`) · `주3일` 이
 * 전부 주5일로 읽혔다 — 휴대폰 화면 전체 캡처에는 알림 배너 같은 남의 글자가 섞인다. 날짜(`25일` · `9월 5일` · `D-5일`)는 뺀다.
 */
const WEEKLY5 = /주5(?!\d)|(?<![\d월\-~])5일/;

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

/**
 * `현재시간` 라벨. **`현재` 만 맞으면 라벨로 본다** (2026-09-22) — 실물 수강증을 폭 700 으로 읽으면 `현재산 2026-08-07 16:19:02` 처럼
 * `시간` 이 한 글자로 뭉개진다. 운영은 그 변형 하나로 판정 키가 다 나오면 멈추므로(`receiptComplete`) 라벨을 `현재시간` 으로만 찾으면
 * **캡처 시각(초)이 늘 비어 "같은 초 캡처" 위조 신호가 꺼져 있었다** (재현). `허재시간` 처럼 `현재` 가 깨지면 여전히 라벨로 보지 않는다.
 */
const NOW_LABEL = String.raw`현재[^\d\n]{0,6}`;
const YMD = String.raw`(\d{4})[-./](\d{1,2})[-./](\d{1,2})`;
const CAPTURED_ON = new RegExp(`${NOW_LABEL}${YMD}`);
const CAPTURED_AT = new RegExp(`${NOW_LABEL}${YMD}[^\\d]{0,4}(\\d{1,2})[:.](\\d{2})[:.](\\d{2})`);
/** 캡처 시각 자리 — 라벨이 붙은 날짜, 또는 초까지 붙은 날짜·시각. `months` 에서 뺀다 (캡처한 날은 수강월이 아니다) */
const CAPTURE_STAMP = new RegExp(`${NOW_LABEL}\\d{4}[-./]\\d{1,2}[-./]\\d{1,2}|\\d{4}[-./]\\d{1,2}[-./]\\d{1,2}[^\\d\\n]{0,3}\\d{1,2}[:.]\\d{2}[:.]\\d{2}`, "g");

function ymd(y: number, mo: number, d: number): string | null {
  if (y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `현재시간 2026-08-07 16:19:02` → "2026-08-07". 라벨이 안 읽혔으면 맨 처음 나오는 YYYY-MM-DD 로 본다 */
export function parseCapturedOn(text: string): string | null {
  const m = text.match(CAPTURED_ON) ?? text.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? ymd(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/**
 * `현재시간 2026-08-07 16:19:02` → "2026-08-07T16:19:02". 라벨이 붙은 줄에서 날짜·시·분·초를 **한 번에** 읽는다.
 * **초가 없으면 null** 이다 — 분까지만으로는 남과 겹칠 수 있다. 라벨을 못 읽었으면 엉뚱한 숫자를 시각으로 보지 않게 null.
 */
export function parseCapturedAt(text: string): string | null {
  const m = text.match(CAPTURED_AT);
  if (!m) return null;
  const day = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  const [h, mi, se] = [Number(m[4]), Number(m[5]), Number(m[6])];
  if (!day || h > 23 || mi > 59 || se > 59) return null;
  return `${day}T${[h, mi, se].map((v) => String(v).padStart(2, "0")).join(":")}`;
}

/**
 * 수강증이 말하는 수강월 (1~12) — 배지 `NN월 과정` → 수강요일 줄의 개강일 달. **캡처 시각은 쓰지 않는다** (2026-09-22).
 * 달 거절(`decideVerification`)과 반 대조(`matchSections`)가 같은 값을 본다 — 둘이 다른 달을 보면 거절은 안 됐는데 엉뚱한 달 반에 붙는다.
 */
export function receiptCourseMonth(p: Pick<ParsedReceipt, "courseMonth" | "startMonth">): number | null {
  return p.courseMonth ?? p.startMonth ?? null;
}

/**
 * 수강요일 줄 `[4주-09/04] 월수금 (월9회)` 의 개강일 달 → 9. 배지 `NN월 과정` 을 못 읽었을 때의 수강월이다 (2026-09-22).
 * `N주-` 가 앞에 있어야 한다 — 그냥 `MM/DD` 는 다른 숫자일 수 있다. OCR 이 `/` 를 `.` 로 읽어 시각처럼 `09:04` 가 돼도 읽는다.
 */
export function parseStartMonth(compact: string): number | null {
  const m = compact.match(/\d주[-~](\d{1,2})[/.:](\d{1,2})(?!\d)/);
  if (!m) return null;
  const [month, day] = [Number(m[1]), Number(m[2])];
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? month : null;
}

function parseTuition(compact: string): number | null {
  const m = compact.match(/(\d{1,3}(?:,\d{3})+|\d{5,})원/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 수강증 카드에만 있는 칸 라벨 — 셋 다 보여야 카드를 읽은 것이다 (`ParsedReceipt.card`) */
const CARD_LABELS = ["수강생", "수강센터", "수강시간"] as const;

/** 강의실 칸의 값이 `온라인 강의` 인가 — 라벨 바로 뒤(잡점 몇 자 허용)만 본다. 한 글자 오인식(`온라인 강으`)은 봐준다 */
function roomValueIsOnline(compact: string): boolean {
  for (let i = compact.indexOf("강의실"); i >= 0; i = compact.indexOf("강의실", i + 1)) {
    if (fuzzyIncludes(compact.slice(i + 3, i + 3 + 8), RECEIPT_KEYWORDS.online, 1)) return true;
  }
  return false;
}

/**
 * 다시보기권 표시 (firsttoeic 사고 4 에서 배운 것). 2단 배치를 OCR 이 읽으면 라벨이 값 사이에 끼어 `다시수강요일보기` 가 되므로
 * 칸 라벨을 지운 뒤에도 한 번 더 본다. 하루 종일(`00:00~23:59`) 시간도 같은 표시다.
 */
const CARD_FIELD_LABELS = /수강요일|수강시간|수강료|수강생|수강센터|강의실/g;
function isReplayPass(compact: string): boolean {
  return compact.includes("다시보기") || compact.replace(CARD_FIELD_LABELS, "").includes("다시보기") || compact.includes("00:00~23:59");
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
  //
  // **강의실 칸의 값이 먼저다** (2026-09-22) — 칸 밖의 글자(광고 배너 `온라인 강의 무료체험` 등)가 현장 학생을 불라방으로 바꾸지 못하게.
  // 칸의 값을 못 읽었을 때만 칸 밖의 `라이브방송`·`온라인 강의` 글자로 정하고(`live`), 그때는 자동 승인하지 않는다.
  const online = roomValueIsOnline(compact);
  // 현장이라는 **읽은 근거** — 강의실 칸의 호실 (`본관 701호`). 없으면 현장은 그냥 기본값이다
  const room = /강의실.{0,8}?\d{3,4}호/.test(compact);
  const liveWords = fuzzyIncludes(compact, RECEIPT_KEYWORDS.live, 1) || fuzzyIncludes(compact, RECEIPT_KEYWORDS.online, 1);
  const modeEvidence: ParsedReceipt["modeEvidence"] = online ? "online" : room ? "room" : liveWords ? "live" : null;
  const mode: EnrollMode = modeEvidence === "online" || modeEvidence === "live" ? "live" : "onsite";
  if (!modeEvidence) warnings.push("강의실(온라인 강의/호실)을 못 읽어 수강 방식을 현장으로 두었어요");
  else if (modeEvidence === "live") warnings.push("강의실 칸을 못 읽어 칸 밖의 글자로 불라방으로 봤어요");

  const card = CARD_LABELS.every((label) => compact.includes(label));
  if (!card) warnings.push(`수강증 카드의 칸(${CARD_LABELS.join("·")})이 다 보이지 않아요`);
  const brandExact = compact.includes(RECEIPT_KEYWORDS.brand);
  const replayPass = isReplayPass(compact);
  if (replayPass) warnings.push("다시보기권처럼 보이는 표시(다시보기 · 00:00~23:59)가 있어요");

  // 주5일 먼저, 그다음 트랙 글자.
  // **회차 표기가 1순위다** (2026-09-22): 주5일은 늘 `월18회`, 주3일은 늘 `월9회` 가 붙는다 — 숫자라 또렷하게 읽힌다.
  // `주5일` 글자는 회차를 못 읽었을 때만 보고, `월9회` 가 있으면 화면 어딘가의 `5일` 이 주3일을 주5일로 바꾸지 못한다
  let weekly: 5 | 3 | null = null;
  let tracks: Track[] = [];
  const has18 = compact.includes(RECEIPT_KEYWORDS.sessions18);
  const has9 = compact.includes(RECEIPT_KEYWORDS.sessions9);
  if (has18 && has9) {
    warnings.push("월18회(주5일)와 월9회(주3일)가 함께 읽혔어요");
  } else if (has18 || (!has9 && WEEKLY5.test(compact))) {
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

  // 수업 시간은 **수강시간 칸의 값**이다 (2026-09-22). 칸을 못 읽었을 때 시간이 하나뿐이면 그것을 쓰고,
  // 여럿이면(배너·다른 글자) 어느 것인지 모르니 비워 둔다 — 첫 번째를 골라 엉뚱한 시간대 반에 붙이지 않게
  const times = parseTimes(compact);
  const labeled = compact.match(/수강시간[^\d]{0,3}(\d{1,2}:\d{2}~\d{1,2}:\d{2})/);
  const time = (labeled ? parseTimes(labeled[1])[0] : undefined) ?? (times.length === 1 ? times[0] : null);
  if (times.length === 0) warnings.push("수업 시간(HH:MM~HH:MM)을 찾지 못했어요");
  else if (!time) warnings.push(`수업 시간이 여러 개라 어느 것인지 모르겠어요: ${times.map((t) => t.timeBlock).join(", ")}`);

  return {
    text,
    compact,
    gates,
    mode,
    modeEvidence,
    card,
    brandExact,
    replayPass,
    weekly,
    tracks,
    levels,
    level,
    courseLevel,
    program,
    times,
    time,
    // 캡처 시각은 수강 날짜가 아니다 — 지우고 센다 (ParsedReceipt.months 참고)
    months: parseReceiptMonths(text.replace(CAPTURE_STAMP, " ")),
    courseMonth: parseCourseMonth(text),
    startMonth: parseStartMonth(compact),
    capturedOn: parseCapturedOn(text),
    capturedAt: parseCapturedAt(text),
    tuition: parseTuition(compact),
    warnings,
  };
}

/**
 * 운영의 "여기서 읽기를 멈춰도 되나" — 판정 키(`receiptComplete`)에 더해 **학생 이름**까지 읽혔는가 (2026-09-22).
 * 이름은 자동 승인 조건(G3)인데 멈추는 기준에 없어서, 첫 변형이 이름만 잘못 읽으면 더 또렷한 변형을 읽지 않고 검토로 보냈다.
 * 이름이 수강증에 없으면(남의 수강증) 변형을 다 읽는다 — 느려질 뿐 결과는 같다.
 */
export function readEnoughFor(studentName: string | null | undefined): (text: string) => boolean {
  return (text) => receiptComplete(text) && (!studentName || receiptHasName(text, studentName));
}

/* ─── OCR 엔진 자리 ──────────────────────────────────────────────────────── */

export type OcrResult = { text: string; engine: string; raw?: unknown };

/**
 * OCR 엔진 어댑터. 엔진은 미확정(CLAUDE.md 미확정 5) — 샘플 수강증과 키를 받은 뒤 구현한다.
 * 어떤 엔진이든 원문 text 만 돌려주면 parseReceipt 가 그 뒤를 맡는다.
 */
export interface OcrEngine {
  readonly name: string;
  /** `enough`: 지금까지 읽은 원문으로 판정 키가 다 나왔으면 true — 엔진은 남은(더 느린) 변형을 건너뛴다. 없으면 전부 읽는다 */
  recognize(input: { bytes: Uint8Array; mimeType: string; enough?: (text: string) => boolean }): Promise<OcrResult>;
}

/**
 * 판정에 쓰는 키가 전부 읽혔는가 — OCR 이 값싼 변형부터 읽다가 여기서 true 가 나오면 나머지를 건너뛴다 (2026-09-18).
 * 실측(전체 화면 캡쳐 1242×2688): 폭 700 변형 하나(0.7초)로 전부 읽히고, 원본 크기 변형(1.4초)은 덤이었다 — 운영 CPU 는 더 느리다.
 * 방식을 정하는 `강의실` 줄은 **라벨이 아니라 값**(`온라인 강의` · `701호`)까지 읽혔는지 본다 — 못 읽으면 기본값 현장으로 잘못 정해진다.
 *
 * **캡처 시각(초)도 본다** (2026-09-22). 여기서 멈추면 뒤 변형은 읽지 않으므로, 멈추는 기준에 없는 값은 운영에서 조용히 비었다 —
 * 실물 수강증은 폭 700 변형 하나로 이 함수가 true 가 됐는데 그 변형에서는 캡처 시각을 못 읽어 "같은 초 캡처" 검사가 꺼져 있었다.
 * 학생 이름은 여기서 모른다 — 부르는 쪽(`submitVerification`)이 이름까지 읽혔는지 함께 본다.
 * 자동 승인에 필요한 것(`역전토익` 글자 · 카드 칸 라벨)도 여기 넣는다 — 첫 변형이 놓쳤으면 다음 변형이 읽을 기회를 준다.
 */
export function receiptComplete(text: string): boolean {
  const p = parseReceipt(text);
  return (
    p.gates.academy &&
    p.brandExact &&
    p.card &&
    p.level != null &&
    p.weekly != null &&
    p.time != null &&
    p.courseMonth != null &&
    p.capturedAt != null &&
    (p.modeEvidence === "online" || p.modeEvidence === "room")
  );
}
