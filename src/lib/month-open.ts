import type { Database } from "@/lib/supabase/database.types";
import { sectionKeyOf, timeBlockOf } from "@/components/admin/sections/bulk";
import { seasonOfMonth } from "./timetable";
import { fieldsFor, slotKinds, type SlotKind } from "./timetable-month";
import { isContainerProgram } from "./two-week";

/**
 * **평달은 반이 저절로 열린다 — 방학달(1 · 2 · 7 · 8월)만 강사가 직접 연다** (2026-10-22 Alan — "방학달 1,2,7,8월만 강사가 직접 반을 열어야하고
 * 나머지는 자동으로 세팅되도록 부탁해!"). 그날 아침 11월 달력을 저장해 두고 "11월 시간표 다 넣어놨는데 왜 안잡히는거야?" 였다 —
 * 달력(날짜)과 시간표 · 반 개설이 따로라서다.
 *
 * 평달 달력을 저장하면(개강일 · 종강일이 있고 그 달 반이 하나도 없을 때) 서버가 그 자리에서
 * ① 그 달 시간표가 없으면 시간표 설정의 'N월 시간표 만들기' 와 같은 규칙으로 만들고(`chooseMonthSource` · `draftMonth`)
 * ② 새 반 개설 표에서 **강좌마다 '전체 선택'** 을 누른 것과 같은 반을 연다 (`autoOpenCells` — 시간표 줄 × 월수금 · 화목금, 모집 중).
 * 반이 열리면 받아 둔 그 달 수강증이 저절로 배정된다 (`rematchHeldVerifications`). 서버 쪽은 `src/app/admin/sections/_lib/open-month.ts`.
 *
 * 방학달은 시간표가 해마다 달라(통짜 120분 · 7월과 8월이 다르다) 짐작하지 않는다 — 예전처럼 시간표 설정에서 고른 뒤 새 반 개설에서 연다.
 * 순수 함수 (`month-open.test.ts`).
 */

/** 이 달 반을 저절로 여나 — 평달만. 방학달은 `VACATION_MONTHS`(src/lib/timetable.ts) 한곳이 정한다 */
export const autoOpensMonth = (month: number): boolean => seasonOfMonth(month) === "regular";

/** 그 달 시간표 한 줄 (DB timetable_slots 의 칸 이름 그대로) */
export type OpenSlot = {
  id: number;
  level: number;
  program: string;
  start_time: string;
  end_time: string;
  ttf_recorded: boolean | null;
  book_set: string | null;
  subject_mwf: string | null;
  subject_ttf: string | null;
};
export type OpenCourse = { id: number; program: string; target_score: number | null };
export type OpenTrack = "mwf" | "ttf";
const TRACKS: readonly OpenTrack[] = ["mwf", "ttf"];

/**
 * 저절로 여는 칸 — **새 반 개설 표에서 강좌마다 '전체 선택' 을 누른 것과 같다**: 강좌(레벨 · 과정)에 맞는 그 달 시간표 줄마다 월수금 · 화목금.
 * 이미 있는 (강좌 · 트랙 · 시간대)는 건너뛴다. 시간표 줄이 없는 강좌는 열지 않는다 — 화면의 '시간대 없음' 줄처럼 시간 없는 반을 만들지 않는다.
 * 순서는 강좌 → 시간표 줄 → 월수금 · 화목금 (넣는 순서일 뿐 뜻은 없다)
 */
export function autoOpenCells(courses: readonly OpenCourse[], slots: readonly OpenSlot[], taken: ReadonlySet<string>) {
  const out: { course: OpenCourse; slot: OpenSlot; track: OpenTrack }[] = [];
  const seen = new Set(taken);
  for (const course of courses) {
    if (course.target_score == null) continue;
    const mine = slots
      .filter((s) => s.level === course.target_score && s.program === course.program)
      .sort((a, b) => a.start_time.localeCompare(b.start_time) || b.end_time.localeCompare(a.end_time));
    for (const slot of mine) {
      for (const track of TRACKS) {
        const key = sectionKeyOf(course.id, track, timeBlockOf(slot.start_time, slot.end_time));
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ course, slot, track });
      }
    }
  }
  return out;
}

/**
 * **같은 레벨 · 과정의 '사용 중' 강좌가 둘 이상**이고 그 달 시간표에 그 레벨 · 과정 줄이 있으면 — 어느 강좌로 열지 모른다 (2026-10-22 오류 점검).
 * `autoOpenCells` 는 강좌마다 연다 — 그대로 두면 그 레벨 반이 강좌 둘에 한 벌씩 생기고, 수강증은 같은 시간 · 트랙 반이 둘이라 자동 등업이 멈춘다.
 * 그래서 그 달은 저절로 열지 않고(`duplicate_course`) 강사가 새 반 개설에서 강좌를 골라 연다. 반 편성의 '강좌 추가' 는 과정을 고르지 않아(점수보장반)
 * 레벨만 같은 강좌를 하나 더 만들면 여기 걸린다. 시간표 줄이 없는 레벨 · 과정은 어차피 열지 않으니 세지 않는다. 걸린 것 `레벨:과정` 을 돌려준다
 */
export function duplicateCourseKeys(courses: readonly OpenCourse[], slots: readonly OpenSlot[]): string[] {
  const count = new Map<string, number>();
  for (const c of courses) {
    if (c.target_score == null) continue;
    if (!slots.some((s) => s.level === c.target_score && s.program === c.program)) continue;
    const key = `${c.target_score}:${c.program}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n > 1).map(([key]) => key);
}

type SectionInsert = Database["public"]["Tables"]["class_sections"]["Insert"];

/**
 * 반 한 줄 — 새 반 개설(`bulkCreateSections`)과 평달 자동 세팅이 **같은 값**으로 만든다 (두 곳에 베껴 두면 반드시 갈라진다).
 * - 과정 A/B · 과목 LC/RC 는 시간표 줄의 것 (`fieldsFor` — 한달완성 · 스파르타 · 2주완성 줄은 비어 있다)
 * - 저녁 줄(화목금 인강)의 화목금 반은 인강, 그 줄의 불라방은 라이브만 (다시보기는 오전 짝 반 것을 본다)
 * - 그릇 반(한달완성 묶음 · 스파르타 · 2주완성)은 담당이 한 명이 아니라 비운다. 나머지는 고른 사람만 — 비우면 DB 가 과목으로 정한다
 * - 회차 수는 그 트랙 수업일 수(없으면 1) — 반이 들어가는 순간 DB 트리거(sync_section_schedule)가 달력대로 다시 센다
 */
export function sectionInsertOf(input: {
  term: { id: number; enrollment_opens_at: string; closes_at: string };
  course: { id: number; program: string };
  slot: OpenSlot | null;
  kind: SlotKind | null;
  track: OpenTrack;
  sessions: number;
  capacity: number | null;
  status: string;
  instructorId: string | null;
}): SectionInsert {
  const { term, course, slot, kind, track } = input;
  const plan = slot && kind ? fieldsFor(kind, slot) : { book_set: null, subject_mwf: null, subject_ttf: null };
  const evening = !!slot?.ttf_recorded;
  return {
    term_id: term.id,
    course_id: course.id,
    track,
    time_block: slot ? timeBlockOf(slot.start_time, slot.end_time) : null,
    enrollment_opens_at: term.enrollment_opens_at,
    closes_at: term.closes_at,
    target_sessions: Math.max(1, input.sessions),
    instructor_id: kind === "package" || isContainerProgram(course.program) ? null : input.instructorId,
    capacity: input.capacity,
    status: input.status,
    book_set: plan.book_set,
    subject: track === "mwf" ? plan.subject_mwf : plan.subject_ttf,
    recorded: evening && track === "ttf",
    live_to_replay: !evening,
    bundle_id: null,
  };
}

/** 저절로 여는 반 전부 — `autoOpenCells` 를 반 줄로 (모집 중 · 정원 없음 · 담당은 DB 가 과목으로) */
export function autoOpenInserts(input: {
  term: { id: number; enrollment_opens_at: string; closes_at: string };
  courses: readonly OpenCourse[];
  slots: readonly OpenSlot[];
  taken: ReadonlySet<string>;
  /** 트랙별 그 달 수업일 수 */
  sessions: Record<OpenTrack, number>;
}): SectionInsert[] {
  const kinds = slotKinds([...input.slots]);
  return autoOpenCells(input.courses, input.slots, input.taken).map(({ course, slot, track }) =>
    sectionInsertOf({
      term: input.term,
      course,
      slot,
      kind: kinds.get(slot.id) ?? null,
      track,
      sessions: input.sessions[track],
      capacity: null,
      status: "open",
      instructorId: null,
    }),
  );
}

/** 저절로 세팅한 결과 — 서버 액션이 화면으로 돌려준다 (Map 없이 글자 · 숫자만) */
export type AutoOpenSummary =
  /** 반을 열었다. timetableMade = 그 달 시간표도 이번에 만들었다 · from = 가져온 달 ('2026년 10월') · held = 반을 기다리던 그 달 수강증 수 */
  | { kind: "opened"; month: number; sections: number; timetableMade: boolean; from: string | null; held: number }
  /** 방학달 — 강사가 직접 연다 */
  | { kind: "vacation"; month: number }
  /** 열지 못했다 — 까닭 */
  | { kind: "failed"; month: number; reason: AutoOpenFailure };

export type AutoOpenFailure = "no_timetable" | "timetable_error" | "sections_error" | "forbidden" | "duplicate_course";

/**
 * 못 연 까닭 — 저장 · 시간표 만들기 뒤 한 줄과 반 편성 카드가 쓴다. **누르라는 말을 적지 않는다** (2026-10-22 Alan "버튼을 안눌러도 자동으로 세팅되도록") —
 * 반이 없는 평달은 10분마다 DB 가 다시 열어 본다 (`/api/cron/month-auto-open`). 사람이 할 일이 있는 까닭만 그 일을 적는다.
 */
export const AUTO_OPEN_FAILURE: Record<AutoOpenFailure, string> = {
  no_timetable: "가져올 시간표가 없어요. 시간표 설정에서 이 달 시간대를 넣으면 10분 안에 반이 저절로 열려요.",
  timetable_error: "시간표를 만들지 못했어요. 10분 안에 저절로 다시 해 봐요.",
  sections_error: "반을 열지 못했어요. 10분 안에 저절로 다시 해 봐요.",
  forbidden: "이 계정(테스트 등급)으로는 열 수 없었어요. 10분 안에 저절로 다시 해 봐요.",
  duplicate_course: "같은 레벨 · 과정의 강좌가 둘 이상 '사용 중' 이라 어느 강좌로 열지 몰라 저절로 열지 않았어요. 새 반 개설에서 강좌를 골라 직접 열어 주세요.",
};

/** 10분 확인의 마지막 결과 (DB month_auto_open_state.error — 그 check 와 같은 목록, `month-open.test.ts`). no_sections = 시간표에 이 달 강좌의 시간대가 없다 */
export type AutoOpenStateError = AutoOpenFailure | "no_sections";
export const AUTO_OPEN_STATE_ERRORS: readonly AutoOpenStateError[] = ["no_timetable", "timetable_error", "sections_error", "forbidden", "no_sections", "duplicate_course"];
export const AUTO_OPEN_STATE_MESSAGE: Record<AutoOpenStateError, string> = {
  ...AUTO_OPEN_FAILURE,
  no_sections: "시간표에 이 달 강좌의 시간대가 없어요. 시간표 설정에서 시간대를 넣으면 10분 안에 반이 저절로 열려요.",
};

/** 10분 확인이 남길 결과 — 할 일이 없었으면(반이 있음 · 방학달 · 끝난 달) null (남기지 않는다) */
export function autoOpenStateOf(s: AutoOpenSummary | null): { error: AutoOpenStateError | null; sections: number } | null {
  if (!s || s.kind === "vacation") return null;
  if (s.kind === "failed") return { error: s.reason, sections: 0 };
  return s.sections > 0 ? { error: null, sections: s.sections } : { error: "no_sections", sections: 0 };
}

/** 저장 · 시간표 만들기 뒤 한 줄 — "11월 시간표를 만들고 반 38개를 저절로 열었어요 …" */
export function autoOpenMessage(s: AutoOpenSummary): string {
  if (s.kind === "vacation") return `${s.month}월은 방학달이라 반은 직접 열어요 — 맨 위 '다음 할 일' 대로 시간표를 만들고 새 반 개설에서 열어 주세요`;
  if (s.kind === "failed") return `${s.month}월 반은 아직 열지 못했어요 — ${AUTO_OPEN_FAILURE[s.reason]}`;
  if (s.sections === 0) return `${s.month}월 시간표에 열 반이 없어요 — 시간표 설정을 확인해 주세요`;
  const made = s.timetableMade ? `${s.month}월 시간표를 ${s.from ? `${s.from} 시간표에서 가져와 ` : ""}만들고 ` : `${s.month}월 시간표대로 `;
  const held = s.held > 0 ? ` 받아 둔 ${s.month}월 수강증 ${s.held}장은 곧 그 반에 배정돼요.` : "";
  return `${made}반 ${s.sections}개를 저절로 열었어요.${held} 과정 · 과목이 맞는지는 시간표 설정에서 확인하세요 — 고치면 반도 따라 바뀌어요`;
}
