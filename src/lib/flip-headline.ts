/**
 * 랜딩 헤드라인 뒤집기 (2026-09-30 Alan — "지금 문구 '시작 점수가 달라도, 끝은 역전!' 이거 바꾸기 전 문구랑 지금 문구랑 교차로 계속
 * 나오도록 … 그냥 바뀌면 재미가 없으니 애니메이션 효과를 넣어서" · "역전이 팀 이름이니 … 해당 글자들이 역전! 즉, 뒤짚어지면서
 * 새로운 글자들도 확 바뀌는 느낌").
 *
 * 글자 하나하나가 카드처럼 **뒤집힌다** — 지금 문구가 왼쪽 위부터 차례로 넘어가 사라지고, 새 문구가 같은 방향으로 넘어오며 선다.
 * 분홍 낱말(`역전!` · `역전토익`)은 마지막에 한 번 더 튀어 오른다. 그리는 것은 `FlipHeadline`, 움직임은 globals.css 의 `.flip-ch`.
 * 순수 함수 (`flip-headline.test.ts`).
 */

export type HeadlineRun = { t: string; em?: boolean };
/** 한 줄 = 조각들. `em` 조각은 브랜드 그라데이션 */
export type Headline = HeadlineRun[][];

/**
 * 번갈아 서는 헤드라인. **첫 번째가 서버가 그리는 것**이다 (자바스크립트가 돌기 전 · 움직임 줄이기 · 검색에 먼저 잡히는 것).
 * 문구는 여기 한곳 — 둘 다 h1 안에 글자로 들어 있어 화면 낭독기와 검색이 읽는다.
 */
export const HEADLINES: Headline[] = [
  [[{ t: "시작 점수가 달라도," }], [{ t: "끝은 " }, { t: "역전!", em: true }]],
  [[{ t: "점수를 뒤집는" }], [{ t: "가장 확실한 방법," }], [{ t: "역전토익", em: true }]],
];

/** 글자 하나. `i` 는 문구 전체에서의 차례(왼쪽 위부터) — 뒤집히는 순서다. `emPos`·`emLen` 은 분홍 낱말 안의 자리 */
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
 * 분홍 낱말의 그라데이션을 글자마다 나눠 칠한다 — 글자마다 따로 뒤집혀야 해서 낱말 하나에 칠할 수 없다.
 * 배경을 낱말 길이만큼 늘이고 글자 자리만큼 옮기면 글자들을 이어 붙였을 때 낱말 하나의 그라데이션이 된다.
 */
export function emSlice(emPos: number, emLen: number): { backgroundSize: string; backgroundPosition: string } {
  const n = Math.max(1, emLen);
  const pos = n === 1 ? 0 : (Math.min(emPos, n - 1) / (n - 1)) * 100;
  return { backgroundSize: `${n * 100}% 100%`, backgroundPosition: `${+pos.toFixed(2)}% 0` };
}

/** 움직임의 시간 (ms). 글자 수가 달라도 한 문구가 서 있는 시간(hold)은 같다 */
export const FLIP = {
  /** 처음 열 때 — 위 배지(60ms)가 들어온 뒤 */
  firstDelay: 150,
  inStagger: 35,
  inDuration: 560,
  /** 분홍 낱말은 조금 늦게, 튀어 오르며 선다 */
  emExtraDelay: 90,
  outStagger: 22,
  outDuration: 320,
  hold: 4200,
} as const;

/** 새 문구가 다 설 때까지 */
export function flipInMs(count: number, first = false): number {
  return (first ? FLIP.firstDelay : 0) + Math.max(0, count - 1) * FLIP.inStagger + FLIP.emExtraDelay + FLIP.inDuration;
}

/** 지금 문구가 다 넘어갈 때까지 */
export function flipOutMs(count: number): number {
  return Math.max(0, count - 1) * FLIP.outStagger + FLIP.outDuration;
}

/** 글자 하나의 지연 (ms) */
export function charDelay(c: Pick<FlipChar, "i" | "em">, phase: "in" | "out", first = false): number {
  if (phase === "out") return c.i * FLIP.outStagger;
  return (first ? FLIP.firstDelay : 0) + c.i * FLIP.inStagger + (c.em ? FLIP.emExtraDelay : 0);
}
