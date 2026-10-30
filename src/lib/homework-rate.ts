import { HOMEWORK_SUBJECTS, type HomeworkSubject, isSubject, SUBJECT_LABEL } from "@/lib/homework";
import { expectedSlots, isOverdue, type MissingEnrollment, type MissingSection, type MissingSlot, type MissingSubmission, shortDay } from "@/lib/homework-missing";

/**
 * **학생 한 명의 숙제 제출률 — 기수(달)마다** (2026-10-30 Alan 이 받은 연락 — "이 학생이 이떄까지 숙제를 어떻게 했는지 보이고/ 숙제 제출률 이런거 있자나요.
 * 퍼센트로 보이게, 각 달별루요! 그래서 숙제 달성률 이런거 보면 본인이 이번달에 얼마나 열씨미 했는지도 볼수있게").
 * 강사 · 관리자의 학생 관리(`/admin/students/[id]`)는 달마다, 학생 숙제제출(`/my/homework`) · 마이페이지는 이번 달을 이것으로 센다.
 *
 * **숙제 미제출 알림(`homework-missing.ts` 의 `buildMissingBoard`)과 같은 셈법이다 — 다른 셈을 만들지 말 것.** 같은 학생 · 같은 달이면 그 화면의
 * 제출률(레벨 탭마다)과 숫자가 같아야 한다 (`homework-rate.test.ts` 가 견준다):
 *  - 낼 숙제 = 직접 배정된 반의 회차 날짜마다 그 반이 품은 시간 단위 반의 과목 × 그 반의 레벨 (`expectedSlots` 그대로) — **반에 들어온 날부터 종강일까지**
 *  - **기한(같은 트랙 다음 수업일 오후 5시)이 지난 숙제만** 제출률에 센다 — 기한 전 숙제는 따로 센다(`upcoming`). 다음 수업일이 달력에 없으면 기한을 몰라 세지 않는다
 *  - **늦게 낸 숙제도 냄이다** (기한 뒤에 내도 낸 것 — 따로 표시하지 않는다, CLAUDE.md 7 "숙제 미제출 알림")
 *  - 숙제 레벨은 교재 레벨 목록(`lc_levels`)에 있는 것만 — 미제출 알림의 레벨 탭과 같다 (그 밖의 레벨로는 숙제를 낼 수도 없다)
 * 미제출 알림은 레벨 탭마다 따로 세고, 여기서는 그 달 레벨을 다 더한 것이 그 달의 제출률이다 (속성반 650 · 850 을 함께). 레벨 × 과목 줄도 함께 준다.
 */

/** 반 하나 — 미제출 알림의 반에 기수를 더한 것 */
export type RateSection = MissingSection & { termId: number };

/** 레벨 × 과목 한 줄 — 그 달 그 과목에서 기한이 지난 숙제 · 그중 낸 것 · 기한 전 숙제 · 그중 이미 낸 것 */
export type HomeworkRateLine = { level: number; subject: HomeworkSubject; past: number; done: number; upcoming: number; upcomingDone: number };

/** 안 낸 숙제 하나 (기한 지남) — 레벨도 적는다 (속성반은 한 날짜에 레벨이 둘이다) */
export type HomeworkRateMissing = MissingSlot & { level: number };

export type HomeworkTermRate = {
  termId: number;
  /** 그 달 내 반(직접 배정)의 가장 이른 개강일 · 가장 늦은 종강일 (2주완성은 앞 절반 마지막 날) */
  opens: string;
  closes: string;
  /** 직접 배정된 반 id (정렬) — 관리자 화면이 반 이름을 붙인다 */
  sectionIds: number[];
  /** 그 달 낼 숙제 칸 전부 (기한이 지난 것 + 기한 전) */
  total: number;
  /** 기한이 지난 숙제 · 그중 낸 것 — 제출률은 이것으로 */
  past: number;
  done: number;
  /** 아직 기한 전인 숙제 · 그중 이미 낸 것 */
  upcoming: number;
  upcomingDone: number;
  /** 제출률 % — 기한이 지난 숙제가 없으면 null (0% 로 적지 않는다) */
  rate: number | null;
  /** 이 달에 낸 숙제 전부 (늦게 낸 것 · 기한 전에 낸 것 포함) ÷ 낼 숙제 전부 — 막대에 쓴다 (출석률 카드의 '이번 달 N회 중 몇 회 채웠나' 와 같은 뜻) */
  fill: number;
  /** 레벨 × 과목 (레벨 · RC 먼저) */
  lines: HomeworkRateLine[];
  /** 기한이 지났는데 안 낸 숙제 — 날짜 순, 같은 날은 레벨 · RC 먼저 */
  missing: HomeworkRateMissing[];
};

/** 화면에 그리는 한 달 — 기수의 해 · 달과 (관리자 화면이면) 그 달 직접 배정된 반 이름을 더한 것 */
export type HomeworkMonthRate = HomeworkTermRate & {
  year: number;
  month: number;
  /** 그 달 직접 배정된 반 — `650+ · 주5일 10:00~12:10` (주5일은 한 줄). 학생 화면은 적지 않는다 */
  classes?: string[];
};

/** 안 낸 숙제 한 줄 — `10/27(화) LC`, 그 달 숙제 레벨이 여럿이면(속성반) `10/27(화) 850 LC` */
export function missingSlotLabel(m: Pick<HomeworkRateMissing, "date" | "level" | "subject">, withLevel: boolean): string {
  return [shortDay(m.date), withLevel ? String(m.level) : null, SUBJECT_LABEL[m.subject]].filter(Boolean).join(" ");
}

/** 그 달 숙제 레벨이 여럿인가 (속성반 650 · 850) — 안 낸 숙제 줄에 레벨을 적을지 */
export const hasManyLevels = (r: Pick<HomeworkTermRate, "lines">) => new Set(r.lines.map((l) => l.level)).size > 1;

const sentKey = (date: string, level: number, subject: string) => `${date}|${level}|${subject}`;

/**
 * 학생 한 명의 기수마다 제출률. 기수 순서는 넘긴 반의 개강일 순 (같으면 기수 id) — 화면이 다시 정렬해도 된다.
 * 낼 숙제가 하나도 없는 기수(그 달 반의 수업일이 아직 없음 · 레벨 목록에 없는 레벨뿐)는 빠진다.
 */
export function homeworkTermRates(input: {
  /** 지금 (ms) — 기한과 견준다. 안 주면 지금 시각 */
  now?: number;
  /** 수업일 → 그 날 숙제의 기한 날짜 (DB `homework_due_dates`). 없거나 null 이면 기한을 모른다 — 기한 전으로 센다 */
  due: ReadonlyMap<string, string | null>;
  /** 이 학생의 직접 배정 반과 그 반이 품은 반 — 회차 날짜 포함 */
  sections: ReadonlyMap<number, RateSection>;
  /** 반 → 품은 시간 단위 반 (DB `term_section_includes`) */
  includes: ReadonlyMap<number, readonly number[]>;
  /** 이 학생의 직접 배정 (`from` = 배정한 날, KST) */
  enrollments: readonly Pick<MissingEnrollment, "sectionId" | "from">[];
  /** 이 학생이 낸 숙제 (수업일 · 레벨 · 과목) */
  submissions: readonly Pick<MissingSubmission, "date" | "level" | "subject">[];
  /** 숙제 레벨 목록 (`lc_levels`). 안 주면 반이 주는 레벨 전부 */
  levels?: readonly number[];
}): HomeworkTermRate[] {
  const now = input.now ?? Date.now();
  const { sections, includes } = input;
  const allowed = input.levels ? new Set(input.levels) : null;

  const sent = new Set<string>();
  for (const s of input.submissions) if (isSubject(s.subject)) sent.add(sentKey(s.date, s.level, s.subject));

  // 기수 → 그 기수의 직접 배정
  const byTerm = new Map<number, Pick<MissingEnrollment, "sectionId" | "from">[]>();
  for (const e of input.enrollments) {
    const s = sections.get(e.sectionId);
    if (!s) continue;
    byTerm.set(s.termId, [...(byTerm.get(s.termId) ?? []), e]);
  }

  const out: HomeworkTermRate[] = [];
  for (const [termId, list] of byTerm) {
    const direct = [...new Set(list.map((e) => e.sectionId))].sort((a, b) => a - b);
    // 이 달 숙제 레벨 — 직접 배정된 반이 품은 시간 단위 반(없으면 그 반)의 레벨
    const levelSet = new Set<number>();
    for (const id of direct) {
      const inner = includes.get(id) ?? [];
      for (const leafId of inner.length > 0 ? inner : [id]) {
        const level = sections.get(leafId)?.level;
        if (level != null && (!allowed || allowed.has(level))) levelSet.add(level);
      }
    }
    const lines: HomeworkRateLine[] = [];
    const missing: HomeworkRateMissing[] = [];
    for (const level of [...levelSet].sort((a, b) => a - b)) {
      const slots = expectedSlots(list, level, includes, sections);
      for (const subject of HOMEWORK_SUBJECTS) {
        const line: HomeworkRateLine = { level, subject, past: 0, done: 0, upcoming: 0, upcomingDone: 0 };
        for (const date of [...slots.keys()].sort()) {
          if (!slots.get(date)!.has(subject)) continue;
          const due = input.due.get(date) ?? null;
          const submitted = sent.has(sentKey(date, level, subject));
          if (isOverdue(due, now)) {
            line.past++;
            if (submitted) line.done++;
            else missing.push({ date, subject, due: due!, level });
          } else {
            line.upcoming++;
            if (submitted) line.upcomingDone++;
          }
        }
        if (line.past + line.upcoming > 0) lines.push(line);
      }
    }
    if (lines.length === 0) continue;

    const sum = (k: "past" | "done" | "upcoming" | "upcomingDone") => lines.reduce((n, l) => n + l[k], 0);
    const [past, done, upcoming, upcomingDone] = [sum("past"), sum("done"), sum("upcoming"), sum("upcomingDone")];
    const total = past + upcoming;
    const own = direct.map((id) => sections.get(id)!);
    out.push({
      termId,
      opens: own.reduce((min, s) => (s.opens < min ? s.opens : min), own[0].opens),
      closes: own.reduce((max, s) => (s.closes > max ? s.closes : max), own[0].closes),
      sectionIds: direct,
      total,
      past,
      done,
      upcoming,
      upcomingDone,
      rate: past > 0 ? Math.round((done / past) * 100) : null,
      fill: total > 0 ? Math.round(((done + upcomingDone) / total) * 100) : 0,
      lines,
      missing: missing.sort(
        (a, b) => a.date.localeCompare(b.date) || a.level - b.level || HOMEWORK_SUBJECTS.indexOf(a.subject) - HOMEWORK_SUBJECTS.indexOf(b.subject),
      ),
    });
  }
  return out.sort((a, b) => a.opens.localeCompare(b.opens) || a.termId - b.termId);
}
