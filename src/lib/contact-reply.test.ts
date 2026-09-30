import { describe, expect, it } from "vitest";
import { CONTACT_REPLY_MAX, contactReplyError, contactReplyMessage } from "./contact-reply";

describe("contactReplyMessage — 학생 알림함에 가는 답변", () => {
  it("제목에 문의 첫머리 20자를 적는다 (줄바꿈·겹친 빈칸은 하나로)", () => {
    const m = contactReplyMessage({ question: "불라방   링크가\n안 열려요. 수업이 시작됐는데 입장이 안 돼요", reply: "  링크를 다시 넣었어요.  " });
    expect(m.title).toBe('"불라방 링크가 안 열려요. 수업이 시…" 문의에 답변드려요');
    expect(m.body).toBe("링크를 다시 넣었어요.");
  });

  it("짧은 문의는 그대로", () => {
    expect(contactReplyMessage({ question: "교재 문의", reply: "네" }).title).toBe('"교재 문의" 문의에 답변드려요');
  });

  it("문의가 비어 있어도 제목이 선다 (DB title 은 1자 이상)", () => {
    expect(contactReplyMessage({ question: "   ", reply: "네" }).title).toBe("문의에 답변드려요");
  });

  it("제목은 80자를 넘지 않는다", () => {
    expect([...contactReplyMessage({ question: "가".repeat(500), reply: "네" }).title].length).toBeLessThanOrEqual(80);
  });
});

describe("contactReplyError", () => {
  it("빈 답변은 막는다", () => expect(contactReplyError("  \n ")).toBe("답변을 적어 주세요."));
  it("상한까지는 받는다", () => expect(contactReplyError("가".repeat(CONTACT_REPLY_MAX))).toBeNull());
  it("상한을 넘으면 막는다 (알림함 본문 1,000자)", () => expect(contactReplyError("가".repeat(CONTACT_REPLY_MAX + 1))).toMatch(/1,000자/));
});
