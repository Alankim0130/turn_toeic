import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { looksLikeRegression, parseYbmReviewStats, parseYbmReviewTags, parseYbmReviewTotal, tagsFromJson, YBM_TAG_COUNT, YbmParseError } from "./ybm-stats";

// 2026-10-01 실제 페이지에서 잘라 낸 조각 — 상단 제목 + 후기 탭 통계 블록 + #classCount
const FIXTURE = readFileSync("src/lib/__fixtures__/ybm-review-stats.html", "utf8");

describe("YBM 수강후기 통계 읽기 (parseYbmReviewStats)", () => {
  it("실물 조각에서 총수와 태그 8개를 그대로 읽는다", () => {
    const s = parseYbmReviewStats(FIXTURE);
    expect(s.total).toBe(7359);
    expect(s.tags).toHaveLength(YBM_TAG_COUNT);
    expect(s.tags.map((t) => t.key)).toEqual(["w01", "w02", "w03", "w04", "w05", "w06", "w07", "w08"]);
    expect(s.tags[0]).toEqual({ key: "w01", label: "커리큘럼이 탄탄해요", count: 1041 });
    expect(s.tags[7]).toEqual({ key: "w08", label: "수업 분위기가 좋아요", count: 229 });
    expect(s.tags.map((t) => t.count)).toEqual([1041, 254, 558, 187, 402, 269, 514, 229]);
  });

  it("총수는 #classCount 가 먼저고, 없으면 위쪽 제목의 괄호 숫자다", () => {
    expect(parseYbmReviewTotal('<span class="count" id="classCount">수강후기 7,359건</span>')).toBe(7359);
    expect(parseYbmReviewTotal('<em class="title">실시간 수강후기 (12,000건)</em>')).toBe(12000);
    expect(parseYbmReviewTotal("<p>후기가 없어요</p>")).toBeNull();
  });

  it("후기 카드에 되풀이되는 숫자 없는 태그 칸은 통계로 세지 않는다", () => {
    const html = `
      <div class="aw_box"><div class="text w01"><span>커리큘럼이 탄탄해요</span></div></div>
      <div class="icon_wordfix">
        <div class="text w01"><span>커리큘럼이 탄탄해요</span><em class="num">1,041</em></div>
        <div class="text w02"><span>피드백이 상세해요</span><em class="num">254</em></div>
      </div>
      <div class="layerwrap"><div class="text w03"><span>밖의 것</span><em class="num">9</em></div></div>`;
    expect(parseYbmReviewTags(html)).toEqual([
      { key: "w01", label: "커리큘럼이 탄탄해요", count: 1041 },
      { key: "w02", label: "피드백이 상세해요", count: 254 },
    ]);
  });

  it("태그가 8개가 아니거나 총수를 못 찾으면 던진다 — 크론이 숫자를 덮어쓰지 않게", () => {
    const seven = FIXTURE.replace(/<div class="text w08">[\s\S]*?<\/div>/, "");
    expect(() => parseYbmReviewStats(seven)).toThrow(YbmParseError);
    const noTotal = FIXTURE.replace(/수강후기 7,359건/g, "수강후기").replace(/\(7,359건\)/, "");
    expect(() => parseYbmReviewStats(noTotal)).toThrow(/총 후기 수/);
    expect(() => parseYbmReviewStats("<html></html>")).toThrow(YbmParseError);
  });

  it("누적 후기가 반 넘게 줄면 페이지가 바뀐 것으로 본다", () => {
    expect(looksLikeRegression(7359, 7360)).toBe(false);
    expect(looksLikeRegression(7359, 7000)).toBe(false);
    expect(looksLikeRegression(7359, 12)).toBe(true);
    expect(looksLikeRegression(null, 12)).toBe(false);
  });

  it("저장된 jsonb 가 어긋나면 빈 목록이다 (랜딩이 깨지지 않게)", () => {
    expect(tagsFromJson([{ key: "w01", label: "a", count: 1 }, { key: 1 }, null, "x"])).toEqual([{ key: "w01", label: "a", count: 1 }]);
    expect(tagsFromJson("nope")).toEqual([]);
  });
});
