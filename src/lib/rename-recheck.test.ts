import { describe, expect, it } from "vitest";
import { planRenameRecheck, type StoredVerification } from "./rename-recheck";

/**
 * 이름을 고친 뒤 수강증 다시 보기 (2026-10-02 Alan — "수정의 기회"). 올릴 때 자동 승인됐을 조건 그대로여야 한다 —
 * 이름 하나 풀렸다고 다른 막는 이유(위조 신호 · 반 못 찾음 · 받아 둔 다음 달)까지 넘기면 오배정이다.
 */

// 실물 화면을 OCR 로 읽으면 `수강생 _ 김민서` 처럼 라벨과 값이 한 줄로 나온다 (receipt.ts receiptHasName)
const TEXT = "역전토익 650+ 왕기초반\n수강생 _ 김민서\n수강센터 YBM 부산서면센터\n수강시간 10:00~12:10";

const good = (): StoredVerification => ({
  ocrText: TEXT,
  parsed: { gates: { academy: true, brand: true }, brandExact: true, card: true, modeEvidence: "room", mode: "onsite" },
  candidates: {
    result: { kind: "match", sectionIds: [101, 102] },
    nameMatches: false,
    flags: { duplicateImage: false, staleCapture: false, sameCapture: false, paletteOff: false, alreadyEnrolled: [], decidedBefore: null },
    blockers: ["name"],
  },
});

describe("planRenameRecheck", () => {
  it("이름이 유일한 이유였고 고친 이름이 수강증과 맞으면 — 찾아 둔 반으로 승인한다", () => {
    expect(planRenameRecheck(good(), "김민서")).toEqual({ kind: "approve", sectionIds: [101, 102], mode: "onsite" });
    // 공백은 무시한다
    expect(planRenameRecheck(good(), "김 민서").kind).toBe("approve");
  });

  it("고친 이름도 수강증과 다르면 손대지 않는다", () => {
    expect(planRenameRecheck(good(), "김민수")).toEqual({ kind: "skip", why: "still_mismatch" });
  });

  it("이름 때문에 멈춘 것이 아니면 손대지 않는다 (다른 이유로 검토 중인 수강증)", () => {
    const row = good();
    row.candidates!.blockers = ["palette"];
    expect(planRenameRecheck(row, "김민서")).toEqual({ kind: "skip", why: "no_name_blocker" });
    const noText = good();
    noText.ocrText = null;
    expect(planRenameRecheck(noText, "김민서")).toEqual({ kind: "skip", why: "no_text" });
  });

  it("이름은 맞지만 다른 이유가 남으면 검토 대기 — 남은 이유만 적는다", () => {
    const row = good();
    row.candidates!.blockers = ["name", "palette"];
    row.candidates!.flags = { ...row.candidates!.flags!, paletteOff: true };
    expect(planRenameRecheck(row, "김민서")).toEqual({ kind: "review", blockers: ["palette"] });

    const noMatch = good();
    noMatch.candidates!.result = { kind: "none" };
    noMatch.candidates!.blockers = ["no_match", "name"];
    expect(planRenameRecheck(noMatch, "김민서")).toEqual({ kind: "review", blockers: ["no_match"] });
  });

  it("받아 둔 다음 달 수강증은 여기서 승인하지 않는다 — 그 달 반이 열릴 때 다시 맞춘다", () => {
    const row = good();
    row.candidates!.hold = 11;
    expect(planRenameRecheck(row, "김민서")).toEqual({ kind: "review", blockers: [] });
  });

  it("위조 신호를 남기지 않은 옛 기록은 다시 잴 수 없다 — 이름만 풀고 사람이 본다", () => {
    const row = good();
    row.candidates!.flags = undefined;
    row.candidates!.blockers = ["name", "card"];
    expect(planRenameRecheck(row, "김민서")).toEqual({ kind: "review", blockers: ["card"] });
  });

  it("수강 방식을 못 읽은 기록은 승인하지 않는다", () => {
    const row = good();
    row.parsed = { ...row.parsed, modeEvidence: null };
    expect(planRenameRecheck(row, "김민서")).toEqual({ kind: "review", blockers: ["mode"] });
  });
});
