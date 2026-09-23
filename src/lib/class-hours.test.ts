import { describe, expect, it } from "vitest";
import { classHours, toClassHours, type HourSection } from "./class-hours";

/** 2026년 9월 화목금 — 650 주5일 120분 학생이 등록한 반은 묶음 10:00~12:10 하나다 */
const sec = (id: number, course: number, block: string, subject: string | null, name: string): HourSection => ({
  id,
  course_id: course,
  time_block: block,
  subject,
  course: { name },
});

// 과목은 반의 과목 칸이 말해 준다 (2026-09-23) — 묶음 반은 두 과목을 이어 들어 비어 있다
const 내묶음 = sec(1, 1, "10:00~12:10", null, "650+ 왕기초반");
const 내10시 = sec(2, 1, "10:00~11:00", "lc", "650+ 왕기초반");
const 내11시 = sec(3, 1, "11:10~12:10", "rc", "650+ 왕기초반");
// 같은 날 열리지만 내 등록과 무관한 반들 (스태프는 RLS 로 이런 게 다 내려온다)
const 남750 = sec(4, 2, "10:00~11:00", "rc", "750+ 유형마스터");
const 남850 = sec(5, 3, "12:30~13:40", "lc", "850+ 문제마스터");
const 남저녁 = sec(6, 1, "18:30~19:30", "lc", "650+ 왕기초반");

const 그날 = [내묶음, 내10시, 내11시, 남750, 남850, 남저녁];
// DB 가 준 포함 관계: 묶음 1 → 시간 단위 2·3 만
const includes = new Map([[1, new Set([2, 3])]]);

describe("classHours — 내 반이 여는 시간만", () => {
  it("650 주5일 120분 → 딱 두 시간", () => {
    expect(classHours(1, 그날, includes).map((s) => s.time_block)).toEqual(["10:00~11:00", "11:10~12:10"]);
  });

  it("등록하지 않은 750·850·저녁반은 안 붙는다", () => {
    const names = classHours(1, 그날, includes).map((s) => s.course?.name);
    expect(names).not.toContain("750+ 유형마스터");
    expect(names).not.toContain("850+ 문제마스터");
    expect(classHours(1, 그날, includes).map((s) => s.id)).not.toContain(6);
  });

  it("시간 단위 반에 바로 등록했으면 함께 듣는 시간이 없다", () => {
    expect(classHours(2, 그날, includes)).toEqual([]);
  });

  it("시작 시각 순으로 나온다", () => {
    const 뒤섞임 = [내11시, 남750, 내10시];
    expect(classHours(1, 뒤섞임, includes).map((s) => s.time_block)).toEqual(["10:00~11:00", "11:10~12:10"]);
  });

  it("그 날 수업이 없는 반은 빠진다 (sameDay 에 없으면 안 나온다)", () => {
    expect(classHours(1, [내묶음, 내10시], includes).map((s) => s.time_block)).toEqual(["10:00~11:00"]);
  });

  it("스파르타처럼 여러 강좌를 열면 그것들만 나온다", () => {
    const sparta = new Map([[9, new Set([2, 3, 5])]]);
    const own = sec(9, 4, "10:00~13:40", null, "스파르타 650+ 중급속성");
    expect(classHours(9, [own, ...그날], sparta).map((s) => s.course?.name)).toEqual([
      "650+ 왕기초반",
      "650+ 왕기초반",
      "850+ 문제마스터",
    ]);
  });
});

describe("toClassHours — 화면 줄", () => {
  it("과목 칸 그대로 — 10:00 LC · 11:10 RC", () => {
    const rows = toClassHours(classHours(1, 그날, includes));
    expect(rows).toEqual([
      { block: "10:00–11:00", subject: "lc", course: "650+ 왕기초반" },
      { block: "11:10–12:10", subject: "rc", course: "650+ 왕기초반" },
    ]);
  });

  it("과목 칸이 비어 있으면 과목을 말하지 않는다", () => {
    const rows = toClassHours([sec(2, 1, "10:00~11:00", null, "650+ 왕기초반")]);
    expect(rows[0].subject).toBeNull();
  });
});
