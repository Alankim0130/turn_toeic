import { describe, expect, it } from "vitest";
import { autoApproveBlockers, BLOCKER_LABEL, type AutoApproveInput } from "./auto-approve";

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
