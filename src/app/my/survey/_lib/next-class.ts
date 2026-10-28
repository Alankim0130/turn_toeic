import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  enrollBlockMinutes,
  KIND_CHOICE_LABEL,
  kindOfSections,
  resolveEnrollChoice,
  termKeyOf,
  TRACK_CHOICE_LABEL,
  type EnrollSection,
  type EnrollTrack,
} from "@/lib/enroll-options";
import { chooseMonthSource, draftMonth, madeMonths, shiftYm, slotLabelOf, type SlotValues, type YM } from "@/lib/timetable-month";

type Client = SupabaseClient<Database>;

/**
 * 수강생 설문의 "다음 달 수강 예정 — 어떤 반?" (2026-10-28 Alan "수강을 한다면, 어떤반을 생각중인지 클릭만 하도록!").
 *
 * 다음 달 반은 아직 열리지 않았을 때가 많아서(평달 반은 그 달 달력을 저장할 때 열린다) **반이 아니라 다음 달 시간표로** 고를 것을 만든다 —
 * 그 달 시간표가 있으면 그것, 없으면 시간표 설정의 'N월 시간표 만들기' 와 같은 출발점(`chooseMonthSource` · `draftMonth` — 앞선 같은 계절 달)에서.
 * 시간표 한 줄 = 월수금 반 하나 + 화목금 반 하나로 펼쳐(반 개설 '전체 선택' 과 같은 모양) 수동 등업신청과 **같은 고르기**(`enroll-options` —
 * 레벨 → 종합 · 단과 → 요일 → 시간대)에 넣는다. 코드에 레벨 · 시간을 적지 않는다 (작업 원칙 4).
 *
 * 고른 것은 반 id 가 아니라 **글자로** 남긴다(`next_class.label` — 시간표가 나중에 바뀌어도 그때 고른 말이 그대로 보인다) — 반은 아직 없다.
 */

const SLOT_COLUMNS = "level, program, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf";

/** 다음 달 시간표 줄 — 그 달 줄이 있으면 그것, 없으면 초안. 읽다 실패하면 빈 목록 (그때는 레벨만 고른다) */
async function nextMonthSlots(supabase: Client, ym: YM): Promise<SlotValues[]> {
  const own = await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("year", ym.y).eq("month", ym.m);
  if (own.error) return [];
  if ((own.data ?? []).length > 0) return own.data ?? [];

  const [dated, templates] = await Promise.all([
    supabase.from("timetable_slots").select("year, month").not("year", "is", null).order("year", { ascending: false }).order("month", { ascending: false }).limit(1000),
    supabase.from("timetable_slots").select("season").is("year", null),
  ]);
  if (dated.error || templates.error) return [];
  const source = chooseMonthSource(ym, madeMonths(dated.data ?? []), (s) => (templates.data ?? []).some((r) => r.season === s));
  let read: { data: SlotValues[] | null; error: unknown } = { data: [], error: null };
  if (source.kind === "month") read = await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("year", source.from.y).eq("month", source.from.m);
  else if (source.kind === "template") read = await supabase.from("timetable_slots").select(SLOT_COLUMNS).is("year", null).eq("season", source.season);
  if (read.error) return [];
  return draftMonth(source, read.data ?? []);
}

/**
 * 다음 달에 고를 수 있는 반 (흉내 반 — id 는 차례 번호). 강좌는 쓰는 중인 강좌(`courses.is_active`)를 (레벨 · 과정)으로 잇는다 —
 * 시간표 줄에 맞는 강좌가 없으면 그 줄은 뺀다. 같은 (레벨 · 과정) 강좌가 둘이면 먼저 만든 것.
 */
export async function nextClassSections(supabase: Client, ym: YM): Promise<EnrollSection[]> {
  const [slots, { data: courses }] = await Promise.all([
    nextMonthSlots(supabase, ym),
    supabase.from("courses").select("id, name, program, target_score, course_type").eq("is_active", true).order("id"),
  ]);
  const courseOf = (level: number, program: string) => (courses ?? []).find((c) => c.target_score === level && c.program === program) ?? null;
  const term = { year: ym.y, month: ym.m };
  const out: EnrollSection[] = [];
  for (const row of slots) {
    const course = courseOf(row.level, row.program);
    if (!course) continue;
    const time_block = slotLabelOf(row);
    out.push({ id: out.length + 1, track: "mwf", time_block, subject: row.subject_mwf, term, course });
    out.push({ id: out.length + 1, track: "ttf", time_block, subject: row.subject_ttf, term, course });
  }
  return out;
}

/** 학생이 듣는 마지막 달 — 지금 수강 중 · 개강 전 등록의 반 기수 중 가장 늦은 것. 그 기수 id 가 설문 줄의 기수다 */
export async function mySurveyTerm(supabase: Client, userId: string, today: string): Promise<{ termId: number; latest: YM } | null> {
  const { data } = await supabase
    .from("enrollment_orders")
    .select("id, enrollments(section:class_sections!enrollments_section_id_fkey(term:terms(id, year, month)))")
    .eq("user_id", userId)
    .gte("access_until", today);
  let best: { termId: number; latest: YM } | null = null;
  for (const o of data ?? []) {
    for (const e of o.enrollments ?? []) {
      const t = e.section?.term;
      if (!t) continue;
      if (!best || t.year * 12 + t.month > best.latest.y * 12 + best.latest.m) best = { termId: t.id, latest: { y: t.year, m: t.month } };
    }
  }
  return best;
}

/** 다음 달 = 학생이 듣는 마지막 달의 다음 달. 등록이 없으면(미리 보기) 이번 달의 다음 달 */
export const nextMonthOf = (term: { latest: YM } | null, today: string): YM =>
  shiftYm(term?.latest ?? { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }, 1);

export type NextClassChoice = { courseId: number | null; kind?: string | null; track: string | null; timeBlock: string | null };

/**
 * 고른 반 → 저장할 값 (`next_class` jsonb). 서버가 화면과 같은 고르기로 다시 푼다 — 화면이 보낸 값을 그대로 믿지 않는다.
 * 시간표가 하나도 없어 고를 것이 없는 달이면(처음 여는 계절 · 읽기 실패) 레벨만 고르게 한다 — 그때는 강좌만 본다.
 */
export function resolveNextClass(
  sections: readonly EnrollSection[],
  courses: readonly { id: number; name: string }[],
  ym: YM,
  choice: NextClassChoice | null | undefined,
): { ok: true; value: Json } | { ok: false; error: string } {
  if (!choice?.courseId) return { ok: false, error: "다음 달에 들을 반의 레벨을 골라 주세요." };

  // 고를 시간표가 없다 — 레벨(강좌)만
  if (sections.length === 0) {
    const course = courses.find((c) => c.id === choice.courseId);
    if (!course) return { ok: false, error: "고르신 레벨을 찾지 못했어요. 다시 골라 주세요." };
    return { ok: true, value: { courseId: course.id, course: course.name, label: course.name } };
  }

  const term = termKeyOf({ year: ym.y, month: ym.m });
  const res = resolveEnrollChoice(sections, {
    term,
    courseId: choice.courseId,
    kind: choice.kind ?? undefined,
    track: choice.track ?? undefined,
    timeBlock: choice.timeBlock ?? undefined,
  });
  if (!res.ok) return { ok: false, error: res.reason.replace("열린 반이 없어요", "반이 없어요").replace("열려 있지 않아요", "없어요") };

  const picked = sections.filter((s) => res.sectionIds.includes(s.id));
  const course = picked[0]?.course;
  if (!course) return { ok: false, error: "고르신 반을 찾지 못했어요. 다시 골라 주세요." };
  const kind = kindOfSections(sections, picked);
  const track = choice.track as EnrollTrack;
  const minutes = enrollBlockMinutes(sections, term, course.id, choice.timeBlock!);
  const label = [
    course.name,
    // 단과만 적는다 — 종합이 기본이다 (학생명단 이름표와 같은 규칙)
    kind === "rc" || kind === "lc" ? KIND_CHOICE_LABEL[kind] : null,
    TRACK_CHOICE_LABEL[track],
    choice.timeBlock,
    minutes ? `${minutes}분` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    ok: true,
    value: {
      courseId: course.id,
      course: course.name,
      level: course.target_score,
      program: course.program,
      kind: kind ?? null,
      track,
      timeBlock: choice.timeBlock,
      minutes,
      label,
    },
  };
}
