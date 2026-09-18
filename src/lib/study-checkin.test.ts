import { describe, expect, it } from "vitest";
import { checkinFolder, missingCheckinMessage } from "./study-checkin";

describe("비대면 스터디 인증", () => {
  it("저장 폴더는 본인 id 가 첫 칸이다 (버킷 정책이 이걸 본다)", () => {
    expect(checkinFolder("u-1", 12)).toBe("u-1/12");
  });
  it("미인증 안내 문구는 날짜와 할 일을 말한다", () => {
    const m = missingCheckinMessage("2026-09-18");
    expect(m.title).toBe("9월 18일 비대면 스터디 인증이 아직 없어요");
    expect(m.body).toContain("9월 18일");
    expect(m.body).toContain("인증하기");
    expect(m.title.length).toBeLessThanOrEqual(80);
    expect(m.body.length).toBeLessThanOrEqual(1000);
  });
});
