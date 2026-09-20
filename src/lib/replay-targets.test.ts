import { describe, it, expect } from "vitest";
import { replayTargets } from "./replay-targets";
import { sectionPackages } from "./time-blocks";
import { subjectOf } from "./instructor-subject";
import { groupHasBookSet, groupKeyOf } from "./section-type";

/**
 * 2026년 10월 650 편성 그대로 (CLAUDE.md 도메인 규칙 1 · 미확정 1 편성표).
 * 10월은 9월과 A·B 가 뒤바뀐다 — 화목금 10:00 이 B, 월수금 11:10 이 A 다.
 */
const term = { year: 2026, month: 10 };
const c650 = { name: "650+ 왕기초반", program: "score", target_score: 650 };
const sec = (id: number, track: string, time_block: string, book_set: string | null, extra: object = {}) =>
  ({ id, track, time_block, book_set, course_id: 1, term_id: 10, term, course: c650, ...extra }) as never;

const PKG_MWF = sec(1, "mwf", "10:00~12:10", null);
const PKG_TTF = sec(2, "ttf", "10:00~12:10", null);
const MWF_1000 = sec(3, "mwf", "10:00~11:00", null); // RC
const TTF_1000 = sec(4, "ttf", "10:00~11:00", "B"); // LC
const MWF_1110 = sec(5, "mwf", "11:10~12:10", "A"); // LC
const TTF_1110 = sec(6, "ttf", "11:10~12:10", null); // RC
const SPARTA = {
  id: 7, track: "mwf", time_block: "10:00~13:40", book_set: null, course_id: 4, term_id: 10, term,
  course: { name: "스파르타 650+ 중급속성", program: "sparta", target_score: 650 },
} as never;

const OCT650 = [PKG_MWF, PKG_TTF, MWF_1000, TTF_1000, MWF_1110, TTF_1110, SPARTA];
const packages = sectionPackages(OCT650 as never);

describe("올릴 수 있는 반 — 시간 단위 반만 (도메인 규칙 1 '반 권한')", () => {
  it("스파르타 반은 뺀다 — 포함 레벨의 시간 단위 반 녹화본을 그대로 본다 (2026-09-20 Alan)", () => {
    expect(replayTargets.isSparta(SPARTA)).toBe(true);
    expect(replayTargets.uploadable(SPARTA, packages)).toBe(false);
  });

  it("묶음 반(120분)도 뺀다 — 안에 든 시간 단위 반에 올린다", () => {
    expect(replayTargets.isPackage(PKG_MWF, packages)).toBe(true);
    expect(replayTargets.uploadable(PKG_MWF, packages)).toBe(false);
    expect(replayTargets.uploadable(PKG_TTF, packages)).toBe(false);
  });

  it("**남는 것은 시간 단위 반 넷뿐이다** — 36개가 쏟아지던 목록이 여기까지 줄어든다", () => {
    const kept = OCT650.filter((s) => replayTargets.uploadable(s, packages));
    expect(kept.map((s: { id: number }) => s.id)).toEqual([MWF_1000, TTF_1000, MWF_1110, TTF_1110].map((s: { id: number }) => s.id));
  });
});

describe("레벨당 LC 는 둘뿐이다 (2026-09-20 Alan: '650에서 두개밖에 없는거 잖아. 맞지?')", () => {
  it("LC 2개 · RC 2개 — 과목은 반의 LC 교재가 말해 준다", () => {
    const hasBook = groupHasBookSet(OCT650 as never);
    const subjects = OCT650.filter((s) => replayTargets.uploadable(s, packages)).map((s: never) => ({
      id: (s as { id: number }).id,
      subject: subjectOf({
        bookSet: (s as { book_set: string | null }).book_set,
        isPackage: false,
        groupHasBook: hasBook.has(groupKeyOf(s)),
      }),
    }));
    expect(subjects.filter((x) => x.subject === "lc").map((x) => x.id)).toEqual([4, 5]); // 화목금 10:00(B) · 월수금 11:10(A)
    expect(subjects.filter((x) => x.subject === "rc").map((x) => x.id)).toEqual([3, 6]);
  });
});

describe("묶음 이름 · 순서", () => {
  it("기수와 레벨로 묶는다 — `10월 · 650`", () => {
    expect(replayTargets.groupLabel(MWF_1000)).toBe("10월 · 650");
    expect(replayTargets.groupLabel(SPARTA)).toBe("10월 · 스파르타 650");
  });

  it("레벨을 모르면 강좌 이름으로 대신한다 — 짐작해 적지 않는다", () => {
    expect(replayTargets.groupLabel({ id: 9, track: "mwf", time_block: null, term, course: { name: "특별반" } })).toBe("10월 · 특별반");
    expect(replayTargets.groupLabel({ id: 9, track: "mwf", time_block: null })).toBe("기수 미지정 · 강좌");
  });

  it("기수는 최신이 위, 그 안에서 레벨 오름차순 → 시간 → 트랙(월수금 먼저)", () => {
    const s850 = sec(8, "mwf", "12:30~13:40", null, { course: { name: "850", program: "score", target_score: 850 } });
    const sep = sec(9, "mwf", "10:00~11:00", null, { term: { year: 2026, month: 9 } });
    const sorted = [sep, s850, TTF_1000, MWF_1000].sort(replayTargets.compare).map((s: { id: number }) => s.id);
    expect(sorted).toEqual([3, 4, 8, 9]); // 10월 650 월수금 → 10월 650 화목금 → 10월 850 → 9월
  });

  it("같은 레벨이면 스파르타가 뒤로 간다", () => {
    expect([SPARTA, MWF_1000].sort(replayTargets.compare).map((s: { id: number }) => s.id)).toEqual([3, 7]);
  });
});
