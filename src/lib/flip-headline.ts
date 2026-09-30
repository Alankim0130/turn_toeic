/**
 * 랜딩 헤드라인 — 두 문구가 번갈아, **글자가 사방으로 흩어졌다가 사방에서 날아와 뒤집히며 선다**.
 *  - 2026-09-30 Alan: "지금 문구 '시작 점수가 달라도, 끝은 역전!' 이거 바꾸기 전 문구랑 지금 문구랑 교차로 계속 나오도록 …
 *    역전이 팀 이름이니 … 해당 글자들이 역전! 즉, 뒤짚어지면서 새로운 글자들도 확 바뀌는 느낌"
 *  - 같은 날 다시: "'점수를 뒤집는 가장 확실한 방법, 역전토익' 이 문구가 먼저 나오고 그 다음 '시작…'" · "변화 속도가 쫌 느려" ·
 *    "애니메이션 효과가 약해 … 글자가 역전, 즉 돌아가기는 하는데 사방에서 글자가 날라오는 듯한 느낌은 어때? 확실히 뭔가가 바뀐다는 느낌을 주고 싶어!"
 *
 * 바뀔 때: 지금 문구의 글자들이 **사방으로 튕겨 나가고**(돌며 뒤집히며 작아진다) 거의 동시에 새 문구의 글자들이 **사방에서 날아와**
 * 뒤집히며 제자리에 선다. 분홍 낱말(`역전토익` · `역전!`)은 마지막에 크게 튀어 오른다.
 * 그리는 것은 `FlipHeadline`, 움직임은 globals.css 의 `.fly-ch`. 순수 함수 (`flip-headline.test.ts`).
 */

export type HeadlineRun = { t: string; em?: boolean };
/** 한 줄 = 조각들. `em` 조각은 브랜드 그라데이션 */
export type Headline = HeadlineRun[][];

/**
 * 번갈아 서는 헤드라인. **첫 번째가 서버가 그리는 것**이다 (자바스크립트가 돌기 전 · 움직임 줄이기 · 검색에 먼저 잡히는 것).
 * 예전 문구가 먼저다 (2026-09-30 Alan). 문구는 여기 한곳 — 둘 다 h1 안에 글자로 들어 있어 화면 낭독기와 검색이 읽는다.
 */
export const HEADLINES: Headline[] = [
  [[{ t: "점수를 뒤집는" }], [{ t: "가장 확실한 방법," }], [{ t: "역전토익", em: true }]],
  [[{ t: "시작 점수가 달라도," }], [{ t: "끝은 " }, { t: "역전!", em: true }]],
];

/** 글자 하나. `i` 는 문구 전체에서의 차례(왼쪽 위부터). `emPos`·`emLen` 은 분홍 낱말 안의 자리 */
export type FlipChar = { ch: string; i: number; em: boolean; emPos: number; emLen: number };
/** 한 줄 = 낱말들, 낱말 = 글자들. 낱말은 줄 안에서 쪼개지지 않는다 (좁은 화면에서 `달라` / `도,` 로 갈리지 않게) */
export type FlipLine = FlipChar[][];

/** 문구 → 줄 · 낱말 · 글자. 빈칸은 낱말 사이로만 남는다 */
export function layoutHeadline(h: Headline): { lines: FlipLine[]; count: number } {
  let i = 0;
  const lines = h.map((runs) => {
    const words: FlipChar[][] = [[]];
    for (const r of runs) {
      const chars = [...r.t];
      const emLen = r.em ? chars.filter((c) => c !== " ").length : 0;
      let emPos = 0;
      for (const ch of chars) {
        if (ch === " ") {
          if (words[words.length - 1].length) words.push([]);
          continue;
        }
        words[words.length - 1].push({ ch, i: i++, em: !!r.em, emPos: r.em ? emPos++ : 0, emLen });
      }
    }
    return words.filter((w) => w.length > 0);
  });
  return { lines, count: i };
}

/** 화면에 보이는 그대로의 글 (줄은 빈칸으로 잇는다) */
export const headlineText = (h: Headline) => h.map((line) => line.map((r) => r.t).join("").trim()).join(" ");

/**
 * 분홍 낱말의 그라데이션을 글자마다 나눠 칠한다 — 글자마다 따로 날아서 낱말 하나에 칠할 수 없다.
 * 배경을 낱말 길이만큼 늘이고 글자 자리만큼 옮기면 글자들을 이어 붙였을 때 낱말 하나의 그라데이션이 된다.
 */
export function emSlice(emPos: number, emLen: number): { backgroundSize: string; backgroundPosition: string } {
  const n = Math.max(1, emLen);
  const pos = n === 1 ? 0 : (Math.min(emPos, n - 1) / (n - 1)) * 100;
  return { backgroundSize: `${n * 100}% 100%`, backgroundPosition: `${+pos.toFixed(2)}% 0` };
}

/** 움직임의 시간 (ms). globals.css 의 `.fly-ch` 길이(0.7s · 0.85s · 0.45s)와 같아야 한다 */
export const FLIP = {
  /** 처음 열 때 — 위 배지(60ms)가 들어온 뒤 */
  firstDelay: 150,
  /** 바뀔 때 새 글자가 출발하는 때 — 옛 글자가 튕겨 나가기 시작한 뒤. 둘이 겹쳐야 "확 바뀐다" */
  overlapDelay: 160,
  /** 글자마다 출발이 이 안에서 흩어진다 (왼쪽부터가 아니라 뒤섞여 — 사방에서 오는 느낌) */
  inSpread: 360,
  inDuration: 700,
  /** 분홍 낱말은 조금 늦게, 크게 튀어 오르며 선다 */
  emExtraDelay: 220,
  emDuration: 850,
  outSpread: 200,
  outDuration: 450,
  /** 한 문구가 다 선 뒤 서 있는 시간 */
  hold: 2300,
} as const;

/**
 * 0 이상 1 미만의 **결정적** 난수 — 서버가 그린 글자와 브라우저가 이어받는 글자의 자리가 같아야 한다 (하이드레이션).
 * 정수 곱셈·비트 연산만 쓴다 (`Math.sin` 같은 것은 엔진마다 끝자리가 달라 스타일 문자열이 어긋날 수 있다).
 */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 여덟 방위 — 글자가 한쪽에서만 오지 않게 방위를 먼저 고른다 */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** 글자가 날아오는(in) · 날아가는(out) 자리. `x`·`y` 는 글자 크기 단위(em), `r` 은 도는 각도(deg), `delay` 는 출발 지연(ms) */
export type Scatter = { x: number; y: number; r: number; delay: number };

/**
 * 글자 하나의 흩어짐 — 여덟 방위 중 하나로 4~8em 떨어진 곳, ±270° 돌기. `seed` 는 몇 번째 바뀜인지라 바뀔 때마다 방향이 달라진다.
 * 글자 크기(em) 단위라 휴대폰(32px)에서는 가깝게, PC(60px)에서는 멀리 날아온다.
 */
export function scatter(i: number, phase: "in" | "out", seed: number): Scatter {
  const salt = seed * 97 + (phase === "in" ? 11 : 53);
  const [ux, uy] = DIRS[Math.floor(hash01(i, salt) * DIRS.length)];
  const dist = 4 + hash01(i + 1009, salt) * 4;
  const jitter = hash01(i + 2003, salt) - 0.5;
  const x = round2(ux * dist + jitter * 2);
  // 세로는 조금 덜 멀리 — 위아래로 너무 멀면 화면 밖에서 오느라 보이지 않는다
  const y = round2(uy * dist * 0.6 - jitter * 1.4);
  const r = Math.round((hash01(i + 3001, salt) - 0.5) * 540);
  const spread = phase === "in" ? FLIP.inSpread : FLIP.outSpread;
  const delay = Math.round(hash01(i + 4007, salt) * spread);
  return { x, y, r, delay };
}

/** 글자 하나의 지연 (ms) — 흩어진 출발 + 처음이면 배지 뒤 · 바뀔 때면 옛 글자가 튕겨 나간 뒤 · 분홍 낱말은 조금 더 */
export function charDelay(c: Pick<FlipChar, "i" | "em">, phase: "in" | "out", seed: number, first = false): number {
  const s = scatter(c.i, phase, seed).delay;
  if (phase === "out") return s;
  return (first ? FLIP.firstDelay : FLIP.overlapDelay) + s + (c.em ? FLIP.emExtraDelay : 0);
}

/** 새 문구가 다 설 때까지 (가장 늦은 글자 기준 — 흩어진 지연의 끝을 잡는다) */
export function flipInMs(first = false): number {
  return (first ? FLIP.firstDelay : FLIP.overlapDelay) + FLIP.inSpread + FLIP.emExtraDelay + Math.max(FLIP.inDuration, FLIP.emDuration);
}

/** 옛 문구가 다 날아갈 때까지 */
export function flipOutMs(): number {
  return FLIP.outSpread + FLIP.outDuration;
}
