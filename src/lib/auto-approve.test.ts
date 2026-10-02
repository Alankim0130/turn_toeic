import { describe, expect, it } from "vitest";
import { autoApproveBlockers, BLOCKER_LABEL, blockerLines, type AutoApproveInput } from "./auto-approve";

const quiet = { duplicateImage: false, staleCapture: false, sameCapture: false, paletteOff: false, alreadyEnrolled: [], decidedBefore: null } as const;
const ok: AutoApproveInput = {
  parsed: { gates: { academy: true, brand: true }, brandExact: true, card: true, modeEvidence: "online" },
  nameMatches: true,
  flags: quiet,
  matched: true,
};

describe("자동 승인 조건 — 수강증을 올린 자리와 예비 접수 다시 맞추기가 같은 조건을 본다", () => {
  it("전부 맞으면 막는 것이 없다 (강의실 호실로 읽은 현장도 된다)", () => {
    expect(autoApproveBlockers(ok)).toEqual([]);
    expect(autoApproveBlockers({ ...ok, parsed: { ...ok.parsed, modeEvidence: "room" } })).toEqual([]);
  });

  it("하나라도 어긋나면 그 까닭을 돌려준다", () => {
    expect(autoApproveBlockers({ ...ok, matched: false })).toEqual(["no_match"]);
    expect(autoApproveBlockers({ ...ok, nameMatches: false })).toEqual(["name"]);
    expect(autoApproveBlockers({ ...ok, nameMatches: null })).toEqual(["name"]);
    expect(autoApproveBlockers({ ...ok, parsed: { ...ok.parsed, brandExact: false } })).toEqual(["brand_word"]);
    expect(autoApproveBlockers({ ...ok, parsed: { ...ok.parsed, modeEvidence: "live" } })).toEqual(["mode"]);
    expect(autoApproveBlockers({ ...ok, flags: { ...quiet, alreadyEnrolled: [12] } })).toEqual(["already_enrolled"]);
    expect(autoApproveBlockers({ ...ok, flags: { ...quiet, decidedBefore: "rejected" } })).toEqual(["decided_before"]);
    expect(autoApproveBlockers({ ...ok, flags: { ...quiet, sameCapture: true, paletteOff: true } })).toEqual(["same_capture", "palette"]);
  });

  it("저장해 둔 예전 판독 결과에 칸이 없으면 막는 쪽으로 읽는다", () => {
    expect(autoApproveBlockers({ ...ok, parsed: { gates: { academy: true, brand: true } } })).toEqual(["brand_word", "card", "mode"]);
    expect(autoApproveBlockers({ ...ok, parsed: {}, nameMatches: undefined })).toEqual(["gate", "brand_word", "card", "name", "mode"]);
  });
});

describe("막은 까닭의 이름", () => {
  it("모든 까닭에 화면에 적을 말이 있다", () => {
    const all = autoApproveBlockers({
      parsed: {},
      nameMatches: false,
      matched: false,
      flags: { duplicateImage: true, staleCapture: true, sameCapture: true, paletteOff: true, alreadyEnrolled: [1], decidedBefore: "approved" },
    });
    expect(all).toHaveLength(Object.keys(BLOCKER_LABEL).length);
    for (const b of all) expect(BLOCKER_LABEL[b]?.length, b).toBeGreaterThan(0);
  });
});

describe("승인 화면의 까닭 한 줄 — 반 대조가 남긴 문장을 적는다 (2026-10-02 운영 #17)", () => {
  it("반을 못 맞춘 까닭이 있으면 '딱 맞는 반을 못 찾음' 대신 그 문장을, 기수 키는 N월 로", () => {
    // #17 에 저장된 그대로 — 9월 기수 종강 전이라 9월 · 10월 반이 함께 걸렸다
    expect(blockerLines(["no_match"], "수강월을 읽지 못해 어느 달인지 가릴 수 없어요 (2026-09, 2026-10)")).toEqual([
      "수강월을 읽지 못해 어느 달인지 가릴 수 없어요 (9월, 10월)",
    ]);
    expect(blockerLines(["no_match", "name"], "2026-10 월수금 반이 없어요")).toEqual(["10월 월수금 반이 없어요", BLOCKER_LABEL.name]);
  });

  it("수업 시각 · 레벨 숫자는 그대로 둔다", () => {
    expect(blockerLines(["no_match"], "850 12:30~13:40 에 열린 반이 없어요")).toEqual(["850 12:30~13:40 에 열린 반이 없어요"]);
    expect(blockerLines(["no_match"], "레벨 숫자가 여러 개 읽혔어요 (650, 750)")).toEqual(["레벨 숫자가 여러 개 읽혔어요 (650, 750)"]);
  });

  it("문장이 없으면(예전 기록 · 판독 실패) 일반 문구, 다른 까닭은 이름 그대로, 모르는 값은 뺀다", () => {
    expect(blockerLines(["no_match"], null)).toEqual([BLOCKER_LABEL.no_match]);
    expect(blockerLines(["no_match"])).toEqual([BLOCKER_LABEL.no_match]);
    expect(blockerLines(["mystery", "palette"], "수강월을 읽지 못해")).toEqual([BLOCKER_LABEL.palette]);
  });
});
