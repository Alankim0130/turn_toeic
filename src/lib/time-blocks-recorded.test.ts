import { describe, expect, it } from "vitest";
import { buildBlockTree, isRecordedBlock } from "./time-blocks";

// 평달 650: 오전 묶음 + 저녁 묶음. 저녁 세 줄만 인강 (마이그레이션 20260917090000)
const LABELS = ["10:00~12:10", "10:00~11:00", "11:10~12:10", "18:30~20:40", "18:30~19:30", "19:40~20:40"];
const FLAGGED = new Set(["18:30~20:40", "18:30~19:30", "19:40~20:40"]);

describe("isRecordedBlock — 시간대 줄이 화목금 인강인가", () => {
  const tree = buildBlockTree(LABELS, { nest: true });
  const by = Object.fromEntries(tree.map((n) => [n.label, n]));

  it("저녁 묶음 줄만 인강이고 오전 줄은 아니다 — 카드 전체가 아니라 줄마다 판정한다", () => {
    expect(isRecordedBlock(by["18:30~20:40"], FLAGGED)).toBe(true);
    expect(isRecordedBlock(by["10:00~12:10"], FLAGGED)).toBe(false);
  });

  it("묶음 자신이 안 켜져 있어도 안의 시간 단위가 전부 켜져 있으면 인강", () => {
    const partsOnly = new Set(["18:30~19:30", "19:40~20:40"]);
    expect(isRecordedBlock(by["18:30~20:40"], partsOnly)).toBe(true);
  });

  it("안의 시간 단위 중 하나만 켜져 있으면 묶음은 인강이 아니다", () => {
    expect(isRecordedBlock(by["18:30~20:40"], new Set(["18:30~19:30"]))).toBe(false);
  });

  it("아무것도 안 켜져 있으면(스파르타·850) 어느 줄도 인강이 아니다", () => {
    for (const n of tree) expect(isRecordedBlock(n, new Set())).toBe(false);
  });
});
