import { describe, it, expect } from "vitest";
import { replayTargets } from "./replay-targets";
import { sectionPackages } from "./time-blocks";
import { subjectOf } from "./instructor-subject";

/**
 * 2026년 10월 650 편성 그대로 (CLAUDE.md 도메인 규칙 1 · 미확정 1 편성표).
 * 10월은 9월과 A·B 과정이 뒤바뀐다 — 10:00 이 B 과정, 11:10 이 A 과정이고 과목은 월수금 RC · 화목금 LC / 월수금 LC · 화목금 RC 그대로 (2026-09-23).
 */
const term = { year: 2026, month: 10 };
const c650 = { name: "650+ 왕기초반", program: "score", target_score: 650 };
const sec = (id: number, track: string, time_block: string, book_set: string | null, subject: string | null, extra: object = {}) =>
  ({ id, track, time_block, book_set, subject, course_id: 1, term_id: 10, term, course: c650, ...extra }) as never;

const PKG_MWF = sec(1, "mwf", "10:00~12:10", null, null);
const PKG_TTF = sec(2, "ttf", "10:00~12:10", null, null);
const MWF_1000 = sec(3, "mwf", "10:00~11:00", "B", "rc"); // B 과정 RC
const TTF_1000 = sec(4, "ttf", "10:00~11:00", "B", "lc"); // B 과정 LC
const MWF_1110 = sec(5, "mwf", "11:10~12:10", "A", "lc"); // A 과정 LC
const TTF_1110 = sec(6, "ttf", "11:10~12:10", "A", "rc"); // A 과정 RC
const SPARTA = {
  id: 7, track: "mwf", time_block: "10:00~13:40", book_set: null, subject: null, course_id: 4, term_id: 10, term,
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
  it("LC 2개 · RC 2개 — 과목은 반의 과목 칸이 말해 준다", () => {
    const subjects = OCT650.filter((s) => replayTargets.uploadable(s, packages)).map((s: never) => ({
      id: (s as { id: number }).id,
      subject: subjectOf({ subject: (s as { subject: string | null }).subject, isPackage: false }),
    }));
    expect(subjects.filter((x) => x.subject === "lc").map((x) => x.id)).toEqual([4, 5]); // 화목금 10:00(B) · 월수금 11:10(A)
    expect(subjects.filter((x) => x.subject === "rc").map((x) => x.id)).toEqual([3, 6]);
  });
});

describe("저녁 줄은 뺀다 (2026-09-20 Alan: '굳이 저녁시간을 나타낼 필요가 없잖아')", () => {
  /** 저녁 줄은 시간표의 `ttf_recorded` 가 표시한다 — 시각을 코드에 적지 않는다 */
  const EVENING = new Set(["18:30~19:30", "19:40~20:40", "18:30~20:40"]);
  const ttf1830 = sec(10, "ttf", "18:30~19:30", "B", "lc", { recorded: true });
  const mwf1940 = sec(11, "mwf", "19:40~20:40", "A", "lc");

  it("인강이든 현장이든 저녁 줄이면 뺀다 — 오전 라이브가 그대로 다시보기가 된다", () => {
    expect(replayTargets.isEvening(ttf1830, EVENING)).toBe(true);
    expect(replayTargets.isEvening(mwf1940, EVENING)).toBe(true);
    expect(replayTargets.uploadable(ttf1830, packages, EVENING)).toBe(false);
    expect(replayTargets.uploadable(mwf1940, packages, EVENING)).toBe(false);
  });

  it("오전 줄은 그대로 남는다", () => {
    expect(replayTargets.isEvening(TTF_1000, EVENING)).toBe(false);
    expect(replayTargets.uploadable(TTF_1000, packages, EVENING)).toBe(true);
  });

  it("**시간표를 못 읽었으면 아무도 빼지 않는다** — 근거 없이 지우면 올릴 데가 사라진다", () => {
    expect(replayTargets.uploadable(ttf1830, packages, new Set())).toBe(true);
    expect(replayTargets.uploadable(ttf1830, packages)).toBe(true);
  });
});

describe("레벨 버튼 (2026-09-20 Alan: '위에 따로 레벨 버튼을 만들어서 구분하게 해줘')", () => {
  it("목록에 있는 레벨만 오름차순으로 — 코드에 650·750·850 을 적지 않는다", () => {
    const s850 = sec(8, "mwf", "12:30~13:40", "B", "rc", { course: { name: "850", program: "score", target_score: 850 } });
    expect(replayTargets.levels([s850, MWF_1000, SPARTA])).toEqual([650, 850]);
  });

  it("레벨을 모르는 반은 탭을 만들지 않는다", () => {
    expect(replayTargets.levelOf({ id: 9, track: "mwf", time_block: null })).toBeNull();
    expect(replayTargets.levels([{ id: 9, track: "mwf", time_block: null }])).toEqual([]);
  });
});

describe("묶음 이름 · 순서", () => {
  it("묶음은 **기수만** — 레벨은 위 탭이 이미 갈랐다 (2026-09-20 Alan)", () => {
    expect(replayTargets.groupLabel(MWF_1000)).toBe("10월");
    expect(replayTargets.groupLabel(SPARTA)).toBe("10월 · 스파르타");
  });

  it("기수를 모르면 그렇게 적는다 — 짐작해 적지 않는다", () => {
    expect(replayTargets.groupLabel({ id: 9, track: "mwf", time_block: null })).toBe("기수 미지정");
  });

  it("기수는 최신이 위, 그 안에서 레벨 오름차순 → 시간 → 트랙(월수금 먼저)", () => {
    const s850 = sec(8, "mwf", "12:30~13:40", "B", "rc", { course: { name: "850", program: "score", target_score: 850 } });
    const sep = sec(9, "mwf", "10:00~11:00", "A", "rc", { term: { year: 2026, month: 9 } });
    const sorted = [sep, s850, TTF_1000, MWF_1000].sort(replayTargets.compare).map((s: { id: number }) => s.id);
    expect(sorted).toEqual([3, 4, 8, 9]); // 10월 650 월수금 → 10월 650 화목금 → 10월 850 → 9월
  });

  it("같은 레벨이면 스파르타가 뒤로 간다", () => {
    expect([SPARTA, MWF_1000].sort(replayTargets.compare).map((s: { id: number }) => s.id)).toEqual([3, 7]);
  });
});
