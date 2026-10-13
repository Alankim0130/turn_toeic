/**
 * 비대면 스터디를 열라는 알림 (2026-10-13 Alan — 11월 준비 리허설 뒤 "개강이 다가오는데 비대면 스터디가 안 열려 있으면 알려 드릴까요?" 에
 * "응 비대면 스터디 올리라고 강사님에게 알려주면 좋겠어").
 *
 * 비대면 스터디는 **개강일부터 사흘만** 신청을 받는다 (`onlineStudyWindow` — DB `private.study_signup_open`). 그 달 스터디를 강사가
 * 열어 두지 않으면(아직 없거나 '준비 중') 학생은 그 사흘 동안 신청할 곳이 없고, 사흘이 지나면 늦게 열어도 **그 달은 아무도 신청할 수 없다**.
 * 그래서 **개강 7일 전부터 신청 마지막 날까지** 그 달 비대면 스터디가 '신청 받는 중' 이 아니면 강사 · 관리자에게 알린다 —
 * 대시보드 맨 위 경고 + 밤 9시 하루 요약 푸시 (`daily-digest.ts`).
 * - **신청 기간이 지나면 알리지 않는다** — 할 수 있는 것이 없다.
 * - **'신청 마감'(closed)은 일부러 닫은 것이라 알리지 않는다.**
 * - **개강일이 없는 기수(달력을 아직 안 정함)도 알리지 않는다** — 열 스터디의 날짜가 없다.
 * 순수 함수 (`online-study-reminder.test.ts`). 읽기만 `loadOnlineStudyReminders` 가 한다.
 */
import type { createAdminClient } from "./supabase/admin";
import { shiftDate } from "./term-window";
import { ONLINE_SIGNUP_DAYS, onlineStudyWindow, shortDay } from "./study-rounds";

type Client = Pick<ReturnType<typeof createAdminClient>, "from">;

/** 개강 며칠 전부터 알리나 — 다음 달 편성(개강 2주 전쯤)을 하고 나서도 비대면만 빠뜨린 것을 잡는다 */
export const ONLINE_REMINDER_LEAD_DAYS = 7;

export type ReminderTerm = { id: number; year: number; month: number; enrollment_opens_at: string | null };
export type ReminderStudy = { term_id: number; kind: string; status: string };

export type OnlineStudyReminder = {
  termId: number;
  year: number;
  month: number;
  /** missing = 그 달 비대면 스터디가 아직 없다 · draft = 만들었는데 '준비 중' (학생에게 안 보인다) */
  state: "missing" | "draft";
  /** 신청 첫날 = 개강일 */
  signupFrom: string;
  /** 신청 마지막 날 = 개강일 + 2 */
  signupUntil: string;
};

/** "2026-11-04" → 그날의 날 번호 (날짜끼리 며칠 차이인지 셀 때) */
function dayNumber(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day) / 86_400_000;
}

/** 알릴 기수를 찾는 개강일 범위 — 신청이 아직 안 끝났고(개강일 ≥ 오늘 − 2) 개강이 7일 안(개강일 ≤ 오늘 + 7) */
export function reminderOpensRange(today: string): { from: string; to: string } {
  return { from: shiftDate(today, -(ONLINE_SIGNUP_DAYS - 1)), to: shiftDate(today, ONLINE_REMINDER_LEAD_DAYS) };
}

/** 오늘 알릴 기수들 — 개강 7일 전 ~ 신청 마지막 날이고, 그 달 비대면 스터디가 없거나 '준비 중'. 개강일 순 */
export function onlineStudyReminders(terms: readonly ReminderTerm[], studies: readonly ReminderStudy[], today: string): OnlineStudyReminder[] {
  const { from, to } = reminderOpensRange(today);
  const online = new Map(studies.filter((s) => s.kind === "online").map((s) => [s.term_id, s.status]));
  return terms
    .flatMap((t): OnlineStudyReminder[] => {
      const opens = t.enrollment_opens_at;
      if (!opens || opens < from || opens > to) return [];
      const status = online.get(t.id);
      // 신청 받는 중이면 됐다 · 마감은 일부러 닫은 것이다
      if (status === "open" || status === "closed") return [];
      const w = onlineStudyWindow(opens);
      return [{ termId: t.id, year: t.year, month: t.month, state: status === "draft" ? "draft" : "missing", signupFrom: w.signupFrom, signupUntil: w.signupUntil }];
    })
    .sort((a, b) => a.signupFrom.localeCompare(b.signupFrom));
}

/** "11/4(수) ~ 11/6(금)" */
export function reminderRange(r: OnlineStudyReminder): string {
  return `${shortDay(r.signupFrom)} ~ ${shortDay(r.signupUntil)}`;
}

/**
 * 지금 어디쯤인가 + 왜 서두르나 — 대시보드 경고의 앞 글.
 * 개강 전: "개강까지 3일 남았어요. … 그 전에 열어 두어야" · 신청 기간: "지금 열면 남은 날 동안" · 마지막 날: "오늘 열지 않으면 이 달은 아무도"
 */
export function reminderLead(r: OnlineStudyReminder, today: string): string {
  const range = reminderRange(r);
  if (today < r.signupFrom) {
    const d = dayNumber(r.signupFrom) - dayNumber(today);
    const when = d === 1 ? "내일 개강이에요." : `개강까지 ${d}일 남았어요.`;
    return `${when} 비대면 스터디는 개강일부터 사흘(${range})만 신청을 받아서, 그 전에 열어 두어야 학생이 신청할 수 있어요.`;
  }
  if (today >= r.signupUntil) return `오늘이 비대면 신청 마지막 날(${shortDay(r.signupUntil)})이에요. 오늘 열지 않으면 이 달은 아무도 비대면 스터디를 신청할 수 없어요.`;
  return `지금 비대면 신청 기간(${range})인데 학생이 신청할 곳이 없어요. 지금 열면 남은 날 동안 신청을 받아요.`;
}

/**
 * 대시보드 경고 글 — `lead` 다음에 링크 '스터디 시간 설정' 을 두고 `action` 을 잇는다 (교재 계좌 경고와 같은 꼴).
 * 버튼 이름은 그 화면의 것 그대로 — 없으면 `N월 비대면 스터디 열기`(준비 중으로 만들어진다) → 공개 상태 `신청 받기` 저장
 */
export function onlineReminderText(r: OnlineStudyReminder, today: string): { title: string; lead: string; action: string } {
  const m = `${r.month}월`;
  return {
    title: r.state === "missing" ? `${m} 비대면 스터디를 아직 열지 않았어요` : `${m} 비대면 스터디가 아직 '준비 중' 이에요`,
    lead: reminderLead(r, today),
    action:
      r.state === "missing"
        ? `에서 '${m} 비대면 스터디 열기' 를 누른 뒤 공개 상태를 '신청 받기' 로 저장해 주세요.`
        : `에서 공개 상태를 '신청 받기' 로 저장해 주세요 — '준비 중' 은 학생에게 안 보여요.`,
  };
}

/** 푸시 한 줄 — "11월 비대면 스터디를 열어 주세요 · 신청 11/4(수) ~ 11/6(금) · 개강까지 3일" (`daily-digest.ts`) */
export function reminderPushLine(r: OnlineStudyReminder, today: string): { title: string; body: string } {
  let when: string;
  if (today < r.signupFrom) {
    const d = dayNumber(r.signupFrom) - dayNumber(today);
    when = d === 1 ? "내일 개강" : `개강까지 ${d}일`;
  } else {
    when = today >= r.signupUntil ? "오늘이 신청 마지막 날" : "지금 신청 기간";
  }
  return { title: `${r.month}월 비대면 스터디를 열어 주세요`, body: `신청 ${reminderRange(r)} 사흘뿐 · ${when}` };
}

/**
 * 오늘 알릴 기수들 — 대시보드 · 하루 요약 크론이 함께 쓴다. **읽지 못하면 빈 목록** — 모르는 채로 경고를 띄우지 않는다 (교재 계좌 경고와 같다).
 * 대시보드도 **서비스 롤로 읽는다** (가드 `requireStaff` 뒤) — 테스트 등급을 켠 강사 · 관리자는 RLS 가 학생으로 보아
 * '준비 중' 스터디를 못 읽어서, 세션으로 읽으면 이미 만든 스터디를 "아직 열지 않았어요" 로 잘못 알린다. 기수 · 스터디 상태는 민감한 값이 아니다
 */
export async function loadOnlineStudyReminders(client: Client, today: string): Promise<OnlineStudyReminder[]> {
  const { from, to } = reminderOpensRange(today);
  const terms = await client.from("terms").select("id, year, month, enrollment_opens_at").gte("enrollment_opens_at", from).lte("enrollment_opens_at", to);
  if (terms.error || !terms.data?.length) return [];
  const studies = await client
    .from("studies")
    .select("term_id, kind, status")
    .eq("kind", "online")
    .in(
      "term_id",
      terms.data.map((t) => t.id),
    );
  if (studies.error) return [];
  return onlineStudyReminders(terms.data, studies.data ?? [], today);
}
