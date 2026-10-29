import { HOMEWORK_SUBJECTS, isSubject } from "@/lib/homework";
import { parseTimeBlock } from "@/lib/time-blocks";

/**
 * 숙제업로드 — **어느 수업의 숙제로 내는가** (2026-10-30 문라경 학생 — "역전 토익 홈페이지에 항상 당일에 숙제를 업로드하는데 미제출 연락이 와서
 * 들어가 보면 숙제 제출이 안 되어 있어요" · "분명 제출하고 확인했는데 그 이후에 들어갔을 때 제출란에 아무것도 없었습니다. … 지금까지 총 2번").
 *
 * 숙제는 수업에서 내 주고 **같은 트랙 다음 수업일 오후 5시까지** 낸다 (`homework-missing.ts`). 그래서 학생이 숙제를 올리는 때는 대개
 * 수업이 없는 날(주말 · 월수금 학생의 화요일 · 자정 넘어)이거나 **다음 수업일(기한 날) 오전**인데, 달력은 내 시간표와 같은 규칙(`initialDay` —
 * 오늘 수업이 있으면 오늘, 없으면 **다음 수업일**)으로 날짜를 골라 두었다. 날짜를 바꾸지 않고 내면:
 *  - 토요일에 금요일 숙제 → **다음 주 월요일** 숙제로 저장 · 화요일 새벽에 월요일 숙제 → 수요일 숙제로 저장
 *  - 수요일 오전에 월요일 숙제 → **수요일** 숙제로 저장
 * 낸 직후에는 그 날짜 아래 '낸 숙제' 에 보여 냈다고 확인하지만, 원래 수업(금요일 · 월요일)은 비어 있어 기한이 지나면 '안 냄' → 미제출 알림이 가고,
 * 알림의 날짜를 눌러 보면 아무것도 없다. 서버도 그 날짜가 내 수업일인지만 봐서 **아직 하지 않은 수업 날짜**로도 받았다.
 *
 * 지금은 셋으로 막는다 — 처음 고르는 날(`homeworkStartDay`) · 아직 안 한 수업 날짜는 받지 않기(화면 · `submitHomework`) · 제출 버튼에 날짜를 적기.
 * 강사 숙제점검의 이름 검색은 `sentBeforeClass` 로 **수업 전에 낸 숙제**(= 날짜를 잘못 골랐을 숙제)에 표시를 단다.
 */

/** 숙제 칸 하나 — "레벨|과목" (`650|rc`) */
export const slotOf = (level: number, subject: string) => `${level}|${subject}`;
/** 낸 숙제 하나 — "날짜|레벨|과목" */
export const sentKey = (date: string, level: number, subject: string) => `${date}|${slotOf(level, subject)}`;

/** 그 날 내 반 하나 — 레벨 · 과목 칸 · 시간대 · 인강 반인가 */
export type DaySection = { level: number | null; subject: string | null; timeBlock: string | null; recorded: boolean };

/**
 * 그 날 낼 숙제 칸 — 레벨마다 **그 날 내 시간 단위 반의 과목** (미제출 판정 `homework-missing.ts` 와 같은 뜻 — 주5일 60분은 그 트랙의 과목 하나,
 * 120분 · 속성반은 두 과목). 묶음 반 · 속성반(그릇)은 과목 칸이 비어 있어 품은 시간 단위 반이 과목을 준다. 과목을 아는 반이 하나도 없는 레벨
 * (방학달 통짜 반 · 아직 안 고름)은 RC · LC 둘 다.
 */
export function expectedSlotsOfDay(levels: readonly number[], sections: readonly Pick<DaySection, "level" | "subject">[]): string[] {
  const out: string[] = [];
  for (const level of levels) {
    const subjects = new Set(sections.flatMap((s) => (s.level === level && s.subject && isSubject(s.subject) ? [s.subject] : [])));
    for (const subject of HOMEWORK_SUBJECTS) if (subjects.size === 0 || subjects.has(subject)) out.push(slotOf(level, subject));
  }
  return out;
}

/** 그 날 내 첫 수업이 시작하는 때 (0시부터 몇 분째) — 인강 반(녹화본을 보는 날)은 빼고. 모르면 null */
export function firstClassStart(sections: readonly Pick<DaySection, "timeBlock" | "recorded">[]): number | null {
  let best: number | null = null;
  for (const s of sections) {
    if (s.recorded) continue;
    const span = parseTimeBlock(s.timeBlock);
    if (span && (best == null || span.start < best)) best = span.start;
  }
  return best;
}

/** 시각(ISO 문자열 · ms) → 한국 날짜와 그 날 몇 분째. 읽을 수 없으면 null */
export function kstDayMinute(at: string | number): { day: string; minute: number } | null {
  const ms = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  const k = new Date(ms + 9 * 3_600_000);
  return { day: k.toISOString().slice(0, 10), minute: k.getUTCHours() * 60 + k.getUTCMinutes() };
}

/**
 * 수업 전에 낸 숙제인가 — 그 수업 날짜보다 먼저 냈거나(그 날 수업이 아직 오지 않았다), 같은 날 첫 수업 시작(`starts`, 분) 전에 냈다.
 * 숙제는 수업에서 내 주므로 이런 숙제는 거의 다 **지난 수업 숙제를 날짜를 잘못 골라** 낸 것이다. `starts` 를 모르면(인강 날 · 시간 없는 반) 날짜만 본다.
 */
export function sentBeforeClass(classDate: string, sentAt: string | number, starts: number | null): boolean {
  const k = kstDayMinute(sentAt);
  if (!k) return false;
  if (classDate > k.day) return true;
  return classDate === k.day && starts != null && k.minute < starts;
}

/** 아직 오지 않은 수업 날짜인가 — 그 날짜로는 숙제를 받지 않는다 (화면 · 서버 같은 규칙) */
export const isFutureClass = (classDate: string, today: string) => classDate > today;

/** 오늘 첫 수업(`starts`, 분)이 아직 시작 전인가 — 한국 시각으로 본다. 화면이 "오늘 수업은 10:00 에 시작해요" 를 말할 때 쓴다 */
export function classNotStartedYet(starts: number, now: number = Date.now()): boolean {
  const k = kstDayMinute(now);
  return !!k && k.minute < starts;
}

/** 600 → "10:00" */
export function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/**
 * 숙제업로드 달력이 **처음 고르는 날** — 숙제를 낼 수업:
 *  1. 오늘까지의 수업일 중 **기한이 아직 안 지났고(`overdue` 거짓) 다 내지 않은**(낼 칸 `expect` 중 안 낸 것이 있는) **가장 이른 날** — 기한이 먼저 오는 숙제
 *  2. 없으면 오늘까지의 **마지막 수업일** (수업이 있는 날이면 오늘)
 *  3. 그것도 없으면(개강 전) 첫 수업일 — 그 날짜로는 아직 낼 수 없다는 안내가 뜬다
 * **다음 수업일(아직 오지 않은 날)은 고르지 않는다** — 예전 규칙(`initialDay`)이 그래서 숙제가 엉뚱한 날짜로 저장됐다 (머리말).
 * `from`(배정일) 앞의 날은 1 에서 뺀다 — 그 수업은 내 것이 아니었다 (미제출 판정도 배정일부터 센다).
 * 기한을 못 읽은 날(`due` 가 undefined)도 1 에서 뺀다 — 기한을 모르고 오래된 날을 고르지 않게.
 */
export function homeworkStartDay(
  days: readonly { date: string; expect: readonly string[]; due?: string | null; overdue?: boolean }[],
  sent: ReadonlySet<string>,
  today: string,
  from: string | null = null,
): string | null {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const past = sorted.filter((d) => d.date <= today);
  if (past.length === 0) return sorted[0].date;
  const open = past.find((d) => (!from || d.date >= from) && d.due !== undefined && !d.overdue && d.expect.some((slot) => !sent.has(`${d.date}|${slot}`)));
  return (open ?? past[past.length - 1]).date;
}
