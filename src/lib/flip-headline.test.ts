import { describe, expect, it } from "vitest";
import { charDelay, emSlice, FLIP, flipInMs, flipOutMs, hash01, headlineText, HEADLINES, layoutHeadline, scatter, type Headline } from "./flip-headline";

describe("HEADLINES — 번갈아 서는 두 문구", () => {
  it("예전 문구가 먼저, 지금 문구가 다음 (서버가 그리는 것은 첫 번째 — 2026-09-30 Alan)", () => {
    expect(headlineText(HEADLINES[0])).toBe("점수를 뒤집는 가장 확실한 방법, 역전토익");
    expect(headlineText(HEADLINES[1])).toBe("시작 점수가 달라도, 끝은 역전!");
  });

  it("분홍 낱말은 한 문구에 하나 — 역전", () => {
    for (const h of HEADLINES) {
      const em = h.flat().filter((r) => r.em);
      expect(em).toHaveLength(1);
      expect(em[0].t.startsWith("역전")).toBe(true);
    }
  });
});

describe("layoutHeadline — 줄 · 낱말 · 글자", () => {
  const { lines, count } = layoutHeadline(HEADLINES[1]);

  it("빈칸은 낱말 사이로만 남고 글자로 세지 않는다", () => {
    expect(lines.map((l) => l.map((w) => w.map((c) => c.ch).join("")))).toEqual([["시작", "점수가"], ["달라도,"], ["끝은", "역전!"]]);
    expect(count).toBe(14);
  });

  it("글자 차례는 왼쪽 위부터 하나씩", () => {
    expect(lines.flat(2).map((c) => c.i)).toEqual(Array.from({ length: count }, (_, k) => k));
  });

  it("분홍 낱말 안의 자리", () => {
    const em = lines.flat(2).filter((c) => c.em);
    expect(em.map((c) => [c.ch, c.emPos, c.emLen])).toEqual([
      ["역", 0, 3],
      ["전", 1, 3],
      ["!", 2, 3],
    ]);
  });

  it("조각 경계에서 낱말이 붙지 않는다 (\"끝은 \" + \"역전!\")", () => {
    expect(lines[2]).toHaveLength(2);
  });
});

describe("두 문구 다 3줄 — 휴대폰 · PC 모두 (2026-10-03 Alan \"똑같이 3줄로\" · \"pc에서도 3줄로\")", () => {
  const lineText = (h: Headline) => layoutHeadline(h).lines.map((words) => words.map((w) => w.map((c) => c.ch).join("")).join(" "));

  it("`점수를 뒤집는 / 가장 확실한 방법, / 역전토익` ↔ `시작 점수가 / 달라도, / 끝은 역전!`", () => {
    expect(lineText(HEADLINES[0])).toEqual(["점수를 뒤집는", "가장 확실한 방법,", "역전토익"]);
    expect(lineText(HEADLINES[1])).toEqual(["시작 점수가", "달라도,", "끝은 역전!"]);
  });
});

describe("emSlice — 낱말 하나의 그라데이션을 글자마다", () => {
  it("첫 글자는 왼쪽 끝, 마지막 글자는 오른쪽 끝", () => {
    expect(emSlice(0, 4)).toEqual({ backgroundSize: "400% 100%", backgroundPosition: "0% 0" });
    expect(emSlice(3, 4)).toEqual({ backgroundSize: "400% 100%", backgroundPosition: "100% 0" });
    expect(emSlice(1, 4).backgroundPosition).toBe("33.33% 0");
  });
  it("한 글자 낱말도 깨지지 않는다", () => {
    expect(emSlice(0, 1)).toEqual({ backgroundSize: "100% 100%", backgroundPosition: "0% 0" });
  });
});

describe("scatter — 사방에서 날아오고 사방으로 흩어진다", () => {
  const all = Array.from({ length: 18 }, (_, i) => scatter(i, "in", 0));

  it("결정적이다 — 서버와 브라우저가 같은 자리를 낸다 (하이드레이션)", () => {
    expect(scatter(5, "in", 3)).toEqual(scatter(5, "in", 3));
    expect(hash01(7, 11)).toBe(hash01(7, 11));
  });

  it("0 이상 1 미만", () => {
    for (let a = 0; a < 200; a++) {
      const v = hash01(a, a * 3 + 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("한 문구의 글자들이 적어도 세 방향 이상에서 온다 (한쪽에서만 오지 않는다)", () => {
    const quadrants = new Set(all.map((s) => `${Math.sign(Math.round(s.x))}:${Math.sign(Math.round(s.y))}`));
    expect(quadrants.size).toBeGreaterThanOrEqual(3);
  });

  it("제자리에서 충분히 먼 곳에서 온다 (2em 이상)", () => {
    for (const s of all) expect(Math.hypot(s.x, s.y)).toBeGreaterThanOrEqual(2);
  });

  it("출발 지연은 흩어짐 폭 안 · 도는 각도는 ±270° 안", () => {
    for (const s of all) {
      expect(s.delay).toBeGreaterThanOrEqual(0);
      expect(s.delay).toBeLessThanOrEqual(FLIP.inSpread);
      expect(Math.abs(s.r)).toBeLessThanOrEqual(270);
    }
    for (let i = 0; i < 18; i++) expect(scatter(i, "out", 0).delay).toBeLessThanOrEqual(FLIP.outSpread);
  });

  it("바뀔 때마다(seed) 방향이 달라진다", () => {
    const a = Array.from({ length: 18 }, (_, i) => scatter(i, "in", 1));
    const b = Array.from({ length: 18 }, (_, i) => scatter(i, "in", 2));
    expect(a).not.toEqual(b);
  });
});

describe("시간", () => {
  it("분홍 낱말이 가장 늦게 선다 · 새 글자는 옛 글자가 튕겨 나가기 시작한 뒤 출발한다", () => {
    expect(charDelay({ i: 0, em: true }, "in", 1)).toBeGreaterThanOrEqual(FLIP.overlapDelay + FLIP.emExtraDelay);
    expect(charDelay({ i: 0, em: false }, "in", 1)).toBeGreaterThanOrEqual(FLIP.overlapDelay);
    expect(charDelay({ i: 0, em: false }, "in", 0, true)).toBeGreaterThanOrEqual(FLIP.firstDelay);
  });

  it("다 서는 시간은 가장 늦은 글자까지 덮는다", () => {
    for (let i = 0; i < 18; i++) {
      expect(charDelay({ i, em: true }, "in", 4) + FLIP.emDuration).toBeLessThanOrEqual(flipInMs());
      expect(charDelay({ i, em: false }, "in", 4) + FLIP.inDuration).toBeLessThanOrEqual(flipInMs());
      expect(charDelay({ i, em: false }, "out", 4) + FLIP.outDuration).toBeLessThanOrEqual(flipOutMs());
    }
  });

  it("한 문구가 한 바퀴 도는 데 5초가 안 걸린다 (2026-09-30 Alan \"변화 속도가 쫌 느려\" — 그전엔 약 6초)", () => {
    expect(flipInMs() + FLIP.hold).toBeLessThan(5000);
  });
});
