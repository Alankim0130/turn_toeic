import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHECKIN_MAX_FEEDBACK, checkinFolder, isCheckinChecked, missingCheckinMessage, studyCheckedMessage } from "./study-checkin";

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

/** 마이그레이션 파일을 순서대로 — 주석(-- …)은 뺀다 */
const SQLS = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) =>
    readFileSync(`supabase/migrations/${f}`, "utf8")
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n"),
  );

describe("비대면스터디 인증 게시판 — 확인 완료 (2026-10-08 Alan \"숙제 점검 처럼 게시판\")", () => {
  it("확인 완료 알림 — 코멘트가 있으면 그것이 본문, 없으면 날짜 · 회차 안내. 알림함 한도 안이다", () => {
    const plain = studyCheckedMessage({ date: "2026-10-12", seq: 3 });
    expect(plain.title).toBe("10월 12일 비대면 스터디 인증을 확인했어요");
    expect(plain.body).toBe("10월 12일 (3회차) 비대면 스터디 인증을 확인했어요. 수고하셨어요!");
    const withNote = studyCheckedMessage({ date: "2026-10-12", seq: 3, feedback: "  풀이가 깔끔해요 " });
    expect(withNote.body).toBe("풀이가 깔끔해요");
    expect(studyCheckedMessage({}).title).toBe("비대면 스터디 인증을 확인했어요");
    const long = studyCheckedMessage({ date: "2026-10-12", seq: 30, feedback: "가".repeat(CHECKIN_MAX_FEEDBACK) });
    expect(long.title.length).toBeLessThanOrEqual(80);
    expect(long.body.length).toBeLessThanOrEqual(1000);
  });
  it("확인 완료는 checked 하나뿐이다", () => {
    expect(isCheckinChecked("checked")).toBe(true);
    for (const s of ["submitted", "", null, undefined, "CHECKED"]) expect(isCheckinChecked(s), String(s)).toBe(false);
  });
  it("DB 와 같은 값 — 코멘트 길이 · 상태 둘 · 알림 종류 study_checked (마지막 정의)", () => {
    const all = SQLS.join("\n");
    expect(all).toMatch(new RegExp(`study_checkins_feedback_check check \\(feedback is null or char_length\\(feedback\\) <= ${CHECKIN_MAX_FEEDBACK}\\)`));
    expect(all).toContain("study_checkins_status_check check (status in ('submitted', 'checked'))");
    const kinds = SQLS.filter((t) => t.includes("add constraint student_messages_kind_check")).at(-1) ?? "";
    expect(kinds).toContain("'study_checked'");
  });
  it("알림함은 알림 종류마다 할 일 버튼을 그린다 — 새 종류를 DB 에 더하면 화면도 (general 은 버튼이 없다)", () => {
    const last = SQLS.filter((t) => t.includes("add constraint student_messages_kind_check")).at(-1) ?? "";
    const kinds = [...(last.match(/student_messages_kind_check\s+check \(kind in \(([^)]+)\)\)/)?.[1] ?? "").matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(kinds.length, "알림 종류 목록을 못 찾았다").toBeGreaterThan(5);
    const page = readFileSync("src/app/my/notifications/page.tsx", "utf8");
    const missing = kinds.filter((k) => k !== "general" && !page.includes(`m.kind === "${k}"`));
    expect(missing, `알림함에 버튼이 없는 종류: ${missing.join(", ")}`).toEqual([]);
  });
  it("확인 · 취소는 앱의 서버 액션이 한다 — 확인 전인 인증만 바꾸고(알림 두 번 막기) 알림은 study_checked 로", () => {
    const src = readFileSync("src/app/admin/study-checkins/actions.ts", "utf8");
    expect(src).toContain('.eq("status", "submitted")');
    expect(src).toContain('kind: "study_checked"');
    expect(src).toContain("related: { checkinId: c.id");
  });
});
