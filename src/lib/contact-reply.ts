/**
 * 문의 답변 (2026-09-30 Alan — "강사가 직접 답변을 해주는 공간이 없어. 혹시 비회원이라서 답변장소가 없는건가?
 * 만약 그렇다면, 회원가입을 하면 답변을 여기로 바로 받을 수 있다고 안내도 같이").
 *
 * - **회원 문의**(로그인하고 보낸 것, `contact_messages.user_id`)는 답변이 학생 알림함(`student_messages`, `contact_reply`)으로 간다.
 * - **비회원 문의**는 이 사이트로 전할 길이 없다 — 남긴 연락처로 직접 답하고, 답한 내용은 기록으로만 남긴다.
 * 순수 함수 (`contact-reply.test.ts`).
 */

/** 답변 길이 끝 — 알림함 본문 상한(student_messages.body 1,000자) · DB check 와 같다 */
export const CONTACT_REPLY_MAX = 1000;

/** 알림 제목 상한 — student_messages.title 80자 */
const TITLE_MAX = 80;
/** 제목에 넣는 문의 첫머리 길이 */
const SNIPPET = 20;

/** 학생 알림함에 가는 답변 — 제목에 무슨 문의였는지 첫머리를 적는다 (문의가 여럿이면 어느 것의 답인지 알 수 있게) */
export function contactReplyMessage({ question, reply }: { question: string; reply: string }): { title: string; body: string } {
  const flat = question.replace(/\s+/g, " ").trim();
  const head = [...flat].length > SNIPPET ? `${[...flat].slice(0, SNIPPET).join("")}…` : flat;
  const title = head ? `"${head}" 문의에 답변드려요` : "문의에 답변드려요";
  return {
    title: [...title].length > TITLE_MAX ? `${[...title].slice(0, TITLE_MAX - 1).join("")}…` : title,
    body: reply.trim(),
  };
}

/** 답변 글 검사 — 비었거나 너무 길면 까닭을, 괜찮으면 null */
export function contactReplyError(reply: string): string | null {
  const t = reply.trim();
  if (!t) return "답변을 적어 주세요.";
  if ([...t].length > CONTACT_REPLY_MAX) return `답변은 ${CONTACT_REPLY_MAX.toLocaleString("ko-KR")}자 안으로 적어 주세요.`;
  return null;
}
