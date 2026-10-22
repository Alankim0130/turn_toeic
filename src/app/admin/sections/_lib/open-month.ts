import "server-only";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rematchHeldVerifications } from "@/lib/rematch-held";
import { sectionKeyOf } from "@/components/admin/sections/bulk";
import { heldCountable } from "@/lib/month-setup";
import { autoOpenInserts, autoOpensMonth, type AutoOpenSummary } from "@/lib/month-open";
import { chooseMonthSource, draftMonth, madeMonths, ymLabel, type MonthSource, type SlotValues, type YM } from "@/lib/timetable-month";

type Client = Awaited<ReturnType<typeof createClient>>;
type DraftRow = SlotValues & { year: number; month: number };

const SLOT_COLUMNS = "id, year, month, level, program, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf";

/**
 * 그 달 시간표 초안 — 시간표 설정의 'N월 시간표 만들기'(`createMonthTimetable`)와 평달 자동 세팅(`autoOpenMonth`)이 같이 쓴다.
 * 출발점은 `chooseMonthSource`(앞선 같은 계절 달 · 없으면 기본 줄), 줄은 `draftMonth`(과정은 달 수만큼 뒤집기 · 과목 그대로, 끊긴 방학달은 시간만).
 * 만든 달 목록은 **최근 달부터** 읽는다 — 시간표가 쌓여 1,000줄(PostgREST 상한)을 넘어도 가까운 달이 빠지지 않게.
 */
export async function draftMonthTimetable(supabase: Client, ym: YM): Promise<{ exists: boolean; source: MonthSource; rows: DraftRow[] }> {
  const [{ data: dated }, { data: templates }, { count }] = await Promise.all([
    supabase.from("timetable_slots").select("year, month").not("year", "is", null).order("year", { ascending: false }).order("month", { ascending: false }).limit(1000),
    supabase.from("timetable_slots").select("season").is("year", null),
    supabase.from("timetable_slots").select("id", { count: "exact", head: true }).eq("year", ym.y).eq("month", ym.m),
  ]);
  const source = chooseMonthSource(ym, madeMonths(dated ?? []), (s) => (templates ?? []).some((r) => r.season === s));
  if ((count ?? 0) > 0) return { exists: true, source, rows: [] };

  let rows: SlotValues[] = [];
  if (source.kind === "month") {
    const { data } = await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("year", source.from.y).eq("month", source.from.m);
    rows = data ?? [];
  } else if (source.kind === "template") {
    const { data } = await supabase.from("timetable_slots").select(SLOT_COLUMNS).is("year", null).eq("season", source.season);
    rows = data ?? [];
  }
  return { exists: false, source, rows: draftMonth(source, rows).map((r) => ({ ...r, year: ym.y, month: ym.m })) };
}

/**
 * **평달 자동 세팅** (2026-10-22 Alan — "방학달 1,2,7,8월만 강사가 직접 반을 열어야하고 나머지는 자동으로 세팅되도록 부탁해!").
 * 평달 달력을 저장할 때(`saveTermSchedule`) · 시간표 설정에서 그 달 시간표를 만들 때(`createMonthTimetable`) · 반 편성 맨 위 카드의
 * '한 번에 만들기'(`openMonthClasses`)가 부른다. 규칙은 `src/lib/month-open.ts`.
 *
 * 하는 일은 **그 달 반이 하나도 없을 때만** — 개강일 · 종강일이 있고 · 종강 전이고 · 반이 0개. 반이 하나라도 있으면 손대지 않는다 —
 * 강사가 몇 개를 지웠어도 빈자리를 다시 채우지 않는다 (강사가 짠 반을 기계가 덮지 않는다). 다 지운 달만 다음 저장 때 다시 연다.
 * ① 시간표가 없으면 만든다 ② 강좌마다 '전체 선택' 과 같은 반을 연다(모집 중) ③ 받아 둔 그 달 수강증을 다시 맞춘다(`after`).
 * 쓰기는 **로그인한 사람의 세션으로** — 시간표 · 반 쓰기 정책(is_staff)이 한 번 더 막는다. 부르는 쪽이 `requireStaff()` 를 먼저 한다.
 *
 * 돌려주는 것: 할 일이 없으면 null · 방학달이면 vacation(강사가 연다) · 열었으면 opened · 못 열었으면 failed(까닭).
 * 실패해도 던지지 않는다 — 달력 저장 · 시간표 만들기는 그대로 성공이다.
 */
export async function autoOpenMonth(supabase: Client, ym: YM, today: string): Promise<AutoOpenSummary | null> {
  const { data: term } = await supabase.from("terms").select("id, enrollment_opens_at, closes_at").eq("year", ym.y).eq("month", ym.m).maybeSingle();
  if (!term?.enrollment_opens_at || !term.closes_at) return null;
  if (term.closes_at < today) return null;
  const { count: sectionCount } = await supabase.from("class_sections").select("id", { count: "exact", head: true }).eq("term_id", term.id);
  if ((sectionCount ?? 0) > 0) return null;
  if (!autoOpensMonth(ym.m)) return { kind: "vacation", month: ym.m };

  const readSlots = async () => (await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("year", ym.y).eq("month", ym.m)).data ?? [];
  let slots = await readSlots();
  let timetableMade = false;
  let from: string | null = null;
  if (slots.length === 0) {
    const draft = await draftMonthTimetable(supabase, ym);
    if (!draft.exists) {
      if (draft.rows.length === 0) return { kind: "failed", month: ym.m, reason: "no_timetable" };
      const { error } = await supabase.from("timetable_slots").insert(draft.rows);
      // 23505 = 같은 달 같은 시간 — 다른 창에서 막 만들었다. 그 시간표를 그대로 쓴다
      if (error && error.code !== "23505") return { kind: "failed", month: ym.m, reason: error.code === "42501" ? "forbidden" : "timetable_error" };
      if (!error) {
        timetableMade = true;
        from = draft.source.kind === "month" ? ymLabel(draft.source.from) : null;
      }
    }
    slots = await readSlots();
    if (slots.length === 0) return { kind: "failed", month: ym.m, reason: "no_timetable" };
  }

  const [{ data: courses }, { data: classDates }, { data: existing }] = await Promise.all([
    supabase.from("courses").select("id, program, target_score").eq("is_active", true),
    supabase.from("term_class_dates").select("track").eq("term_id", term.id),
    // 반을 세고 나서 사이에 다른 창이 열었을 수 있다 — 넣기 바로 전에 다시 본다
    supabase.from("class_sections").select("course_id, track, time_block").eq("term_id", term.id),
  ]);
  if ((existing ?? []).length > 0) return null;
  const sessionsOf = (track: string) => (classDates ?? []).filter((d) => d.track === track).length;
  const inserts = autoOpenInserts({
    term: { id: term.id, enrollment_opens_at: term.enrollment_opens_at, closes_at: term.closes_at },
    courses: courses ?? [],
    slots,
    taken: new Set((existing ?? []).map((s) => sectionKeyOf(s.course_id, s.track, s.time_block))),
    sessions: { mwf: sessionsOf("mwf"), ttf: sessionsOf("ttf") },
  });
  if (inserts.length > 0) {
    const { error } = await supabase.from("class_sections").insert(inserts);
    if (error) return { kind: "failed", month: ym.m, reason: error.code === "42501" ? "forbidden" : "sections_error" };
  }

  // 반을 기다리던 그 달 수강증 — 학생에게도 열린 생성 칸 hold_month 라 세션으로 센다 (연도가 없어 0~2달 뒤인 달만)
  const { count: held } =
    inserts.length > 0 && heldCountable(ym.y, ym.m, today)
      ? await supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).is("result", null).eq("hold_month", ym.m)
      : { count: 0 };
  // 모집 중인 반이 열렸다 — 받아 둔 다음 달 수강증을 올릴 때와 같은 조건으로 다시 맞춘다 (새 반 개설과 같은 길)
  if (inserts.length > 0) after(() => rematchHeldVerifications(createAdminClient(), { notify: true }));

  revalidatePath("/admin/sections", "layout");
  revalidatePath("/admin/timetable");
  revalidatePath("/admin/verifications");
  revalidatePath("/admin");
  revalidatePath("/");
  return { kind: "opened", month: ym.m, sections: inserts.length, timetableMade, from, held: held ?? 0 };
}
