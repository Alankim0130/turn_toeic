import "server-only";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { rematchHeldVerifications } from "@/lib/rematch-held";
import { heldCountable } from "@/lib/month-setup";
import { autoOpenInserts, autoOpensMonth, duplicateCourseKeys, type AutoOpenSummary } from "@/lib/month-open";
import { chooseMonthSource, draftMonth, madeMonths, ymLabel, type MonthSource, type SlotValues, type YM } from "@/lib/timetable-month";

/** 강사 · 관리자의 세션(달력 저장 · 시간표 만들기) 또는 서버(10분 확인 `/api/cron/month-auto-open`) */
type Client = SupabaseClient<Database>;
type DraftRow = SlotValues & { year: number; month: number };

const SLOT_COLUMNS = "id, year, month, level, program, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf";

/**
 * 그 달 시간표 초안 — 시간표 설정의 'N월 시간표 만들기'(`createMonthTimetable`)와 평달 자동 세팅(`autoOpenMonth`)이 같이 쓴다.
 * 출발점은 `chooseMonthSource`(앞선 같은 계절 달 · 없으면 기본 줄), 줄은 `draftMonth`(과정은 달 수만큼 뒤집기 · 과목 그대로, 끊긴 방학달은 시간만).
 * 만든 달 목록은 **최근 달부터** 읽는다 — 시간표가 쌓여 1,000줄(PostgREST 상한)을 넘어도 가까운 달이 빠지지 않게.
 * **하나라도 읽다 실패하면 초안을 만들지 않는다**(`readError`, 2026-10-22 오류 점검) — 만든 달 목록이 비어 보이면 앞선 달이 아니라 기본 줄에서 시간만
 * 가져와 과정 A/B · 과목이 빈 시간표가 생기고, 그 달 반이 그대로 열린다 (그 뒤에는 반이 있어 저절로 고쳐지지 않는다).
 */
export async function draftMonthTimetable(supabase: Client, ym: YM): Promise<{ exists: boolean; source: MonthSource; rows: DraftRow[]; readError: boolean }> {
  const [dated, templates, existing] = await Promise.all([
    supabase.from("timetable_slots").select("year, month").not("year", "is", null).order("year", { ascending: false }).order("month", { ascending: false }).limit(1000),
    supabase.from("timetable_slots").select("season").is("year", null),
    supabase.from("timetable_slots").select("id", { count: "exact", head: true }).eq("year", ym.y).eq("month", ym.m),
  ]);
  const source = chooseMonthSource(ym, madeMonths(dated.data ?? []), (s) => (templates.data ?? []).some((r) => r.season === s));
  if (dated.error || templates.error || existing.error) return { exists: false, source, rows: [], readError: true };
  if ((existing.count ?? 0) > 0) return { exists: true, source, rows: [], readError: false };

  let read: { data: SlotValues[] | null; error: unknown } = { data: [], error: null };
  if (source.kind === "month") read = await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("year", source.from.y).eq("month", source.from.m);
  else if (source.kind === "template") read = await supabase.from("timetable_slots").select(SLOT_COLUMNS).is("year", null).eq("season", source.season);
  if (read.error) return { exists: false, source, rows: [], readError: true };
  return { exists: false, source, rows: draftMonth(source, read.data ?? []).map((r) => ({ ...r, year: ym.y, month: ym.m })), readError: false };
}

type SectionInsert = Database["public"]["Tables"]["class_sections"]["Insert"];

/**
 * **반 넣기 — DB 함수 `open_month_sections` 한곳** (마이그레이션 20261022100000). 기수마다 잠금을 건 뒤 넣고,
 * 이미 있는 (강좌 · 트랙 · 시간대)는 건너뛴다 — `onlyIfEmpty` 면 그 기수에 반이 하나라도 있을 때 아무것도 넣지 않는다 (자동 세팅).
 * 달력 저장 · 10분 확인 · 새 반 개설이 같은 순간에 돌아도 같은 반이 두 벌 생기지 않는다 (class_sections 에는 그 unique 가 없다). 넣은 수를 돌려준다.
 * 함수가 아직 없으면(PGRST202 — 배포 사이에 새 코드가 마이그레이션보다 먼저 뜬 경우) 예전처럼 표에 바로 넣는다.
 */
export async function insertSections(
  supabase: Client,
  termId: number,
  rows: SectionInsert[],
  opts: { onlyIfEmpty: boolean },
): Promise<{ count: number; error: { code?: string; message?: string } | null }> {
  if (rows.length === 0) return { count: 0, error: null };
  const { data, error } = await supabase.rpc("open_month_sections", { p_term: termId, p_rows: rows as unknown as Json, p_only_if_empty: opts.onlyIfEmpty });
  if (error?.code === "PGRST202") {
    const { error: direct } = await supabase.from("class_sections").insert(rows);
    return { count: direct ? 0 : rows.length, error: direct };
  }
  return { count: error ? 0 : (data ?? 0), error };
}

/**
 * **평달 자동 세팅** (2026-10-22 Alan — "방학달 1,2,7,8월만 강사가 직접 반을 열어야하고 나머지는 자동으로 세팅되도록 부탁해!"
 * → 같은 날 "버튼을 안눌러도 자동으로 세팅되도록 부탁해"). 규칙은 `src/lib/month-open.ts`. 부르는 곳은 셋이다:
 * 평달 달력을 저장할 때(`saveTermSchedule`) · 시간표 설정에서 그 달 시간표를 만들 때(`createMonthTimetable`) — 그 자리에서,
 * 그리고 **10분마다 DB 가 부르는 확인**(`/api/cron/month-auto-open`, pg_cron `month-auto-open`) — 그 전에 저장해 둔 달 · 그때 못 연 달 ·
 * 강사가 반을 다 지운 달을 버튼 없이 연다.
 *
 * 하는 일은 **그 달 반이 하나도 없을 때만** — 개강일 · 종강일이 있고 · 종강 전이고 · 반이 0개. 반이 하나라도 있으면 손대지 않는다 —
 * 강사가 몇 개를 지웠어도 빈자리를 다시 채우지 않는다 (강사가 짠 반을 기계가 덮지 않는다).
 * ① 시간표가 없으면 만든다 ② 강좌마다 '전체 선택' 과 같은 반을 연다(모집 중) ③ 받아 둔 그 달 수강증을 다시 맞춘다(`after`).
 * 반은 **DB 함수 `open_month_sections` 로만** 넣는다 — 기수마다 잠금을 건 뒤 "반이 하나도 없을 때만" 넣어서, 달력 저장과 10분 확인이
 * 같은 순간에 돌아도 반이 두 벌 생기지 않는다. 쓰기는 **부른 쪽의 클라이언트로** — 강사 · 관리자 세션이면 시간표 · 반 쓰기 정책(is_staff)이 한 번 더 막고
 * (부르는 쪽이 `requireStaff()` 를 먼저 한다), 10분 확인은 서버 권한이다 (라우트가 DB 의 비밀을 먼저 확인한다).
 *
 * 돌려주는 것: 할 일이 없으면 null · 방학달이면 vacation(강사가 연다) · 열었으면 opened · 못 열었으면 failed(까닭).
 * 실패해도 던지지 않는다 — 달력 저장 · 시간표 만들기는 그대로 성공이다.
 * `rematch: false` 면 받아 둔 수강증 다시 맞추기를 부른 쪽에 맡긴다 — 10분 확인은 여러 달을 돌고 끝에 한 번만 부른다 (2026-10-22 오류 점검:
 * 두 달이 한 번에 열리면 다시 맞추기가 둘 겹쳐 돌아 같은 수강증을 두 번 보고 스태프 알림 · '확인 필요' 가 두 번 갔다).
 */
export async function autoOpenMonth(supabase: Client, ym: YM, today: string, opts: { rematch?: boolean } = {}): Promise<AutoOpenSummary | null> {
  const { data: term } = await supabase.from("terms").select("id, enrollment_opens_at, closes_at").eq("year", ym.y).eq("month", ym.m).maybeSingle();
  if (!term?.enrollment_opens_at || !term.closes_at) return null;
  if (term.closes_at < today) return null;
  const { count: sectionCount } = await supabase.from("class_sections").select("id", { count: "exact", head: true }).eq("term_id", term.id);
  if ((sectionCount ?? 0) > 0) return null;
  if (!autoOpensMonth(ym.m)) return { kind: "vacation", month: ym.m };

  // 읽다 실패하면(null) 못 연 것으로 — 빈 시간표로 보고 새로 만들지 않는다 (10분 확인이 다시 해 본다)
  const readSlots = async () => {
    const { data, error } = await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("year", ym.y).eq("month", ym.m);
    return error ? null : (data ?? []);
  };
  let slots = await readSlots();
  if (!slots) return { kind: "failed", month: ym.m, reason: "timetable_error" };
  let timetableMade = false;
  let from: string | null = null;
  if (slots.length === 0) {
    const draft = await draftMonthTimetable(supabase, ym);
    if (draft.readError) return { kind: "failed", month: ym.m, reason: "timetable_error" };
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
    if (!slots) return { kind: "failed", month: ym.m, reason: "timetable_error" };
    if (slots.length === 0) return { kind: "failed", month: ym.m, reason: "no_timetable" };
  }

  const [{ data: courses, error: coursesError }, { data: classDates }] = await Promise.all([
    supabase.from("courses").select("id, program, target_score").eq("is_active", true),
    supabase.from("term_class_dates").select("track").eq("term_id", term.id),
  ]);
  // 강좌를 못 읽으면 열 반이 0 으로 보여 '시간표에 이 달 강좌의 시간대가 없어요' 로 잘못 말한다
  if (coursesError || !courses) return { kind: "failed", month: ym.m, reason: "sections_error" };
  // 같은 레벨 · 과정 강좌가 둘이면 어느 쪽으로 열지 모른다 — 강사가 새 반 개설에서 고른다 (`duplicateCourseKeys`)
  if (duplicateCourseKeys(courses, slots).length > 0) return { kind: "failed", month: ym.m, reason: "duplicate_course" };
  const sessionsOf = (track: string) => (classDates ?? []).filter((d) => d.track === track).length;
  const inserts = autoOpenInserts({
    term: { id: term.id, enrollment_opens_at: term.enrollment_opens_at, closes_at: term.closes_at },
    courses,
    slots,
    taken: new Set(),
    sessions: { mwf: sessionsOf("mwf"), ttf: sessionsOf("ttf") },
  });
  let opened = 0;
  if (inserts.length > 0) {
    // 잠금을 건 뒤 "반이 하나도 없을 때만" — 반을 세고 나서 넣기까지의 틈에 다른 길(달력 저장 · 10분 확인)이 열었으면 0 이 온다
    const { count, error } = await insertSections(supabase, term.id, inserts, { onlyIfEmpty: true });
    if (error) return { kind: "failed", month: ym.m, reason: error.code === "42501" ? "forbidden" : "sections_error" };
    opened = count;
    if (opened === 0) return null;
  }

  // 반을 기다리던 그 달 수강증 — 학생에게도 열린 생성 칸 hold_month 라 세션으로 센다 (연도가 없어 0~2달 뒤인 달만)
  const { count: held } =
    opened > 0 && heldCountable(ym.y, ym.m, today)
      ? await supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).is("result", null).eq("hold_month", ym.m)
      : { count: 0 };
  // 모집 중인 반이 열렸다 — 받아 둔 다음 달 수강증을 올릴 때와 같은 조건으로 다시 맞춘다 (새 반 개설과 같은 길)
  if (opened > 0 && opts.rematch !== false) after(() => rematchHeldVerifications(createAdminClient(), { notify: true }));

  revalidatePath("/admin/sections", "layout");
  revalidatePath("/admin/timetable");
  revalidatePath("/admin/verifications");
  revalidatePath("/admin");
  revalidatePath("/");
  return { kind: "opened", month: ym.m, sections: opened, timetableMade, from, held: held ?? 0 };
}
