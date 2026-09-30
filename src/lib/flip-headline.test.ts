import { describe, expect, it } from "vitest";
import { charDelay, emSlice, FLIP, flipInMs, flipOutMs, headlineText, HEADLINES, layoutHeadline } from "./flip-headline";

describe("HEADLINES — 번갈아 서는 두 문구", () => {
  it("지금 문구가 먼저, 예전 문구가 다음 (서버가 그리는 것은 첫 번째)", () => {
    expect(headlineText(HEADLINES[0])).toBe("시작 점수가 달라도, 끝은 역전!");
    expect(headlineText(HEADLINES[1])).toBe("점수를 뒤집는 가장 확실한 방법, 역전토익");
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
  const { lines, count } = layoutHeadline(HEADLINES[0]);

  it("빈칸은 낱말 사이로만 남고 글자로 세지 않는다", () => {
    expect(lines.map((l) => l.map((w) => w.map((c) => c.ch).join("")))).toEqual([["시작", "점수가", "달라도,"], ["끝은", "역전!"]]);
    expect(count).toBe(14);
  });

  it("뒤집히는 순서는 왼쪽 위부터 하나씩", () => {
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
    expect(lines[1]).toHaveLength(2);
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

describe("시간", () => {
  it("넘어가기는 마지막 글자가 다 넘어간 뒤 끝난다", () => {
    expect(flipOutMs(15)).toBe(14 * FLIP.outStagger + FLIP.outDuration);
    expect(charDelay({ i: 14, em: false }, "out")).toBe(14 * FLIP.outStagger);
  });
  it("서기는 분홍 낱말까지 다 선 뒤 끝난다 · 처음 열 때는 조금 늦게", () => {
    const last = charDelay({ i: 14, em: true }, "in") + FLIP.inDuration;
    expect(flipInMs(15)).toBe(last);
    expect(flipInMs(15, true)).toBe(last + FLIP.firstDelay);
  });
  it("한 번 도는 데 7초를 넘지 않는다 (두 문구가 번갈아 자주 보이게)", () => {
    for (const h of HEADLINES) {
      const n = layoutHeadline(h).count;
      expect(flipInMs(n) + FLIP.hold + flipOutMs(n)).toBeLessThan(7000);
    }
  });
});
