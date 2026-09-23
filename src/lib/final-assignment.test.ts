import { describe, expect, it } from "vitest";
import { planManualApproval, preselectForApproval } from "./final-assignment";

// 9월 기수(term 9) · 10월 기수(term 10). 알런 계정의 실제 모양: 스태프 배정으로 9월 650 주5일 10:00~12:10 (97 화목금 · 105 월수금)
const SEPT = 9;
const OCT = 10;
const existing = [
  { id: 111, order_id: 79, section_id: 97, term_id: SEPT },
  { id: 112, order_id: 79, section_id: 105, term_id: SEPT },
];
const selectable = new Set([97, 105, 98, 106, 200]);

describe("수동 승인 = 그 달의 최종 배정 (2026-09-23 Alan — '이미 같은 반에 배정된 수강생입니다' 가 뜨던 것)", () => {
  it("이미 있는 반을 그대로 체크하면 새로 넣지 않고 이 승인으로 옮겨 온다 — 막히지 않는다", () => {
    const plan = planManualApproval({ chosen: [{ id: 97, term_id: SEPT }, { id: 105, term_id: SEPT }], existing, selectable });
    expect(plan.absorb.map((e) => e.id)).toEqual([111, 112]);
    expect(plan.insert).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it("반을 바꾸면 새 반은 넣고, 체크를 뺀 기존 반은 뺀다", () => {
    const plan = planManualApproval({ chosen: [{ id: 98, term_id: SEPT }, { id: 106, term_id: SEPT }], existing, selectable });
    expect(plan.absorb).toEqual([]);
    expect(plan.insert).toEqual([98, 106]);
    expect(plan.remove.map((e) => e.id)).toEqual([111, 112]);
  });

  it("주5일 → 주3일: 남긴 반은 옮기고 뺀 반만 뺀다", () => {
    const plan = planManualApproval({ chosen: [{ id: 105, term_id: SEPT }], existing, selectable });
    expect(plan.absorb.map((e) => e.id)).toEqual([112]);
    expect(plan.remove.map((e) => e.id)).toEqual([111]);
  });

  it("다른 달의 배정은 건드리지 않는다", () => {
    const plan = planManualApproval({ chosen: [{ id: 200, term_id: OCT }], existing, selectable });
    expect(plan).toEqual({ absorb: [], insert: [200], remove: [] });
  });

  it("승인 화면에 뜰 수 없던 반(닫힌 반)은 체크가 없어도 빼지 않는다 — 스태프가 볼 수 없던 것이다", () => {
    const closed = [{ id: 120, order_id: 80, section_id: 999, term_id: SEPT }];
    const plan = planManualApproval({ chosen: [{ id: 98, term_id: SEPT }], existing: closed, selectable });
    expect(plan.remove).toEqual([]);
    expect(plan.insert).toEqual([98]);
  });
});

describe("승인 화면에 미리 체크해 둘 반", () => {
  const sel = [
    { id: 97, term_id: SEPT },
    { id: 105, term_id: SEPT },
    { id: 98, term_id: SEPT },
    { id: 200, term_id: OCT },
  ];
  const mine = [
    { section_id: 97, term_id: SEPT, opens_at: "2026-09-03", closes_at: "2026-10-03" },
    { section_id: 105, term_id: SEPT, opens_at: "2026-09-03", closes_at: "2026-10-03" },
  ];

  it("고른 반이 없으면 지금 수강 중인 달의 기존 배정을 체크해 둔다 — 그대로 누르면 그 배정이 최종이 된다", () => {
    expect(preselectForApproval({ suggested: [], existing: mine, selectable: sel, today: "2026-09-23" })).toEqual([97, 105]);
  });

  it("학생·OCR 이 고른 반에 같은 달 기존 배정을 더한다 (아무것도 안 건드리면 기존 배정이 빠지지 않게)", () => {
    expect(preselectForApproval({ suggested: [98], existing: mine, selectable: sel, today: "2026-09-23" })).toEqual([98, 97, 105]);
  });

  it("고른 반이 다른 달이면 그 달만 — 두 달이 섞이면 승인이 막힌다", () => {
    expect(preselectForApproval({ suggested: [200], existing: mine, selectable: sel, today: "2026-09-23" })).toEqual([200]);
  });

  it("끝난 배정 · 화면에 뜨지 않는 반은 체크하지 않는다", () => {
    const old = [{ section_id: 97, term_id: SEPT, opens_at: "2026-09-03", closes_at: "2026-09-20" }];
    expect(preselectForApproval({ suggested: [], existing: old, selectable: sel, today: "2026-09-23" })).toEqual([]);
    expect(preselectForApproval({ suggested: [555], existing: [], selectable: sel, today: "2026-09-23" })).toEqual([]);
  });

  it("지금 수강 중인 달이 곧 시작할 달보다 먼저다", () => {
    const both = [
      { section_id: 200, term_id: OCT, opens_at: "2026-10-06", closes_at: "2026-11-03" },
      ...mine,
    ];
    expect(preselectForApproval({ suggested: [], existing: both, selectable: sel, today: "2026-09-23" })).toEqual([97, 105]);
  });
});
