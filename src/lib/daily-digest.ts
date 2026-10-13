/**
 * 하루 요약 푸시의 글 (Vercel Cron `/api/cron/daily-digest`, 매일 21:00 KST — 도메인 규칙 8). 받는 사람은 강사 · 관리자다 (`notifyStaff`).
 * 최근 24시간 스터디 신청 · 숙제업로드 · 신규 가입 수를 적는다.
 * **비대면 스터디를 열라는 알림이 있으면 그것을 제목으로 올리고 누르면 그 달 스터디 시간 설정으로 간다** (2026-10-13 Alan —
 * "응 비대면 스터디 올리라고 강사님에게 알려주면 좋겠어", `online-study-reminder.ts`) — 그날 활동이 0건이어도 보낸다.
 * 알림이 없고 활동도 0건이면 보내지 않는다 (예전 그대로). 순수 함수 (`daily-digest.test.ts`).
 */
import { termParam } from "./study";
import { reminderPushLine, type OnlineStudyReminder } from "./online-study-reminder";

export type DigestCounts = { study: number; homework: number; signups: number };
export type DigestPush = { title: string; body: string; url: string; tag: string };

export const DIGEST_TITLE = "오늘의 역전토익 요약";

export function digestCountsLine(c: DigestCounts): string {
  return `스터디 신청 ${c.study}건 · 숙제업로드 ${c.homework}건 · 신규 가입 ${c.signups}명`;
}

/** 보낼 글 — 보낼 것이 없으면 null */
export function digestPush(counts: DigestCounts, reminders: readonly OnlineStudyReminder[], today: string): DigestPush | null {
  const active = counts.study + counts.homework + counts.signups > 0;
  const first = reminders[0];
  if (!first) return active ? { title: DIGEST_TITLE, body: digestCountsLine(counts), url: "/admin", tag: "daily-digest" } : null;

  const line = reminderPushLine(first, today);
  const others = reminders.length > 1 ? ` · 다른 달 ${reminders.length - 1}개도 아직이에요` : "";
  return {
    title: line.title,
    // 해야 할 일이 첫 줄 — 잠금 화면에서 접혀도 보이게. 오늘 요약은 그 아래
    body: `${line.body}${others}${active ? `\n오늘 ${digestCountsLine(counts)}` : ""}`,
    url: `/admin/study/plan?term=${termParam(first.year, first.month)}`,
    tag: "daily-digest",
  };
}
