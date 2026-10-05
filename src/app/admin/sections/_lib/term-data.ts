import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { sectionTypeLabel } from "@/lib/section-type";
import { termKey } from "@/components/admin/sections/dates";
import { blockMinutes, buildBlockTree, minutesLabel, parseTimeBlock, sectionPackages } from "@/lib/time-blocks";
import { isContainerProgram } from "@/lib/two-week";
import { programRank } from "@/lib/timetable";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * 반 편성 묶음(달력 · 개설 반 · 새 반 개설 · 담당 강사)이 함께 읽는 그 달 데이터 (2026-10-02 Alan — "반 편성에서 일정표 편성만 딱,
 * 나머지는 페이지를 분리"). 한 화면에 다 있던 것을 넷으로 나누면서 읽는 코드는 여기 한곳에 뒀다 — 네 화면이 같은 반 목록·같은 판정을 쓴다.
 */

/** `?term=YYYY-MM` → 연·월. 없거나 이상하면 이번 달 */
export function parseTerm(term?: string): { y: number; m: number } {
  const match = term?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    if (y >= 2020 && y <= 2100 && m >= 1 && m <= 12) return { y, m };
  }
  const [y, m] = todayKST().split("-").map(Number);
  return { y, m };
}

export async function loadTermData(supabase: Client, y: number, m: number, opts: { instructors: boolean; includes: boolean }) {
  const [{ data: term }, { data: lecturers }, { data: courses }, { data: instructorRows }, { data: timetable }] = await Promise.all([
    supabase.from("terms").select("id, year, month, enrollment_opens_at, closes_at").eq("year", y).eq("month", m).maybeSingle(),
    supabase.from("lecturers").select("id, name").order("sort_order").order("name"),
    supabase
      .from("courses")
      .select("id, code, name, course_type, target_score, program, includes_levels")
      .eq("is_active", true)
      .order("program")
      .order("target_score")
      .order("name"),
    opts.instructors
      ? // 합쳐진 옛 계정(merged_into)은 담당 강사 목록에서 뺀다 — 같은 이름이 둘 보이면 어느 쪽인지 알 수 없다 (2026-10-02)
        supabase.from("profiles").select("id, name, role, subject").in("role", ["instructor", "admin"]).is("merged_into", null).order("name")
      : Promise.resolve({ data: null }),
    // 그 달 시간표 (2026-09-29 부터 달마다 한 벌) — 시간대 · 과정 · 트랙별 과목을 시간표 설정에서 정한다
    supabase
      .from("timetable_slots")
      .select("id, level, program, start_time, end_time, book_set, subject_mwf, subject_ttf")
      .eq("year", y)
      .eq("month", m)
      .order("level")
      .order("start_time")
      .order("end_time"),
  ]);

  const [{ data: classDates }, { data: lectureRows, error: lectureError }, { data: sectionRows }] = term
    ? await Promise.all([
        supabase.from("term_class_dates").select("date, track").eq("term_id", term.id).order("date"),
        supabase
          .from("special_lectures")
          .select("id, date, lecturer_id, content, kinds, signup, capacity, signup_opens_at, applied_count")
          .eq("term_id", term.id)
          .order("date")
          .order("id"),
        supabase
          .from("class_sections")
          .select(
            "id, bundle_id, track, time_block, book_set, subject, recorded, live_to_replay, course_id, capacity, status, instructor_id, closes_at, course:courses(name, course_type, target_score, program), instructor:profiles(name, subject), session_dates(count), section_live_links(section_id)",
          )
          .eq("term_id", term.id)
          .order("course_id")
          .order("track"),
      ])
    : [{ data: [] as never[] }, { data: [] as never[], error: null }, { data: [] as never[] }];

  // special_lectures.kinds 가 없으면 아직 마이그레이션이 적용되지 않은 것 — 저장이 전부 실패한다
  const needsMigration = !!lectureError && (lectureError.code === "42703" || lectureError.code === "PGRST204" || /kinds/.test(lectureError.message ?? ""));

  const sections = sectionRows ?? [];
  type Sec = (typeof sections)[number];
  const instructors = instructorRows ?? null;

  // 스파르타 · 2주완성 반이 권한을 함께 주는 반 (DB 의 private.section_includes 와 같은 판정) — 카드에 보여 준다
  const hasSparta = sections.some((s) => isContainerProgram(s.course?.program));
  const { data: includeRows } = term && hasSparta && opts.includes ? await supabase.rpc("term_section_includes", { p_term_id: term.id }) : { data: [] };
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const includedBySection = new Map<number, string[]>();
  for (const r of includeRows ?? []) {
    const inc = sectionById.get(r.included_id);
    if (!inc) continue;
    const label = [inc.course?.name ?? "강좌", inc.time_block].filter(Boolean).join(" ");
    includedBySection.set(r.section_id, [...(includedBySection.get(r.section_id) ?? []), label]);
  }

  // 묶음 반(120분·140분) ↔ 시간 단위 반(60분·70분): 같은 강좌·트랙에서 시간이 안에 들어오는 반 (2026-09-16 Alan)
  const packages = sectionPackages(sections);
  // 종합/단과는 반마다 다르다 (2026-09-18 Alan) — 시간 단위 반은 강사 한 명의 단과(LC·RC), 묶음·스파르타만 종합. 과목은 반의 과목 칸으로 (2026-09-23)
  const typeLabelOf = (s: Sec) => sectionTypeLabel(s, { isPackage: (packages.get(s.id)?.parts.length ?? 0) > 0 });
  // 묶음 반(120분·140분)·스파르타 반은 담당이 한 명이 아니라 DB 에는 비어 있다 (도메인 규칙 1 "담당 강사").
  // **화면에는 두 강사 이름을 다 적는다** (2026-09-18 Alan "종합에는 LC·RC 둘 다 수업을 하니 두 쌤 이름을 다") —
  // 안에 든 시간 단위 반의 담당을 모으고, 아직 아무도 없으면 과목 강사(이혜영 LC · 이영수 RC) 둘을 적는다
  const subjectInstructorNames = (instructors ?? [])
    .filter((i) => i.subject === "lc" || i.subject === "rc")
    .map((i) => i.name)
    .sort((a, b) => a.localeCompare(b, "ko"));
  const instructorLabel = (s: Sec): string | null => {
    if (s.instructor?.name) return s.instructor.name;
    const parts = packages.get(s.id)?.parts ?? [];
    const names = [...new Set(parts.map((p) => p.instructor?.name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, "ko"));
    if (names.length > 0) return names.join(" · ");
    if (parts.length > 0 || isContainerProgram(s.course?.program)) return subjectInstructorNames.length > 0 ? subjectInstructorNames.join(" · ") : null;
    return null;
  };
  // 시간대 라벨 → "120분" 같은 분량 (묶음은 안에 든 시간 단위의 합)
  const minutesOf = new Map<string, string | null>();
  for (const c of new Set(sections.map((s) => s.course_id))) {
    const mine = sections.filter((s) => s.course_id === c);
    const walk = (nodes: ReturnType<typeof buildBlockTree>) => {
      for (const n of nodes) {
        minutesOf.set(`${c}|${n.label}`, minutesLabel(blockMinutes(n)));
        walk(n.parts);
      }
    };
    walk(buildBlockTree(mine.map((s) => s.time_block), { nest: mine[0]?.course?.program === "score" }));
  }

  // 주5일 = 같은 강좌·시간대의 월수금 + 화목금. 그 둘을 한 묶음으로 모아 보여준다 (시간대가 없는 반은 하나씩 만들기의 bundle_id 로)
  const order = (s: Sec) => {
    const span = parseTimeBlock(s.time_block);
    return [programRank(s.course?.program), s.course?.target_score ?? 0, span?.start ?? 9999, -(span?.end ?? 0), s.track === "mwf" ? 0 : 1];
  };
  const sorted = [...sections].sort((a, b) => {
    const oa = order(a);
    const ob = order(b);
    for (let i = 0; i < oa.length; i++) if (oa[i] !== ob[i]) return oa[i] - ob[i];
    return a.id - b.id;
  });
  const groups = new Map<string, Sec[]>();
  for (const s of sorted) {
    const k = s.time_block ? `${s.course_id}|${s.time_block}` : (s.bundle_id ?? `single-${s.id}`);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  return {
    y,
    m,
    key: termKey(y, m),
    termLabel: `${y}년 ${m}월`,
    term,
    hasSaved: !!term?.enrollment_opens_at && !!term?.closes_at,
    lecturers: lecturers ?? [],
    courses: courses ?? [],
    instructors,
    timetable: timetable ?? [],
    classDates: classDates ?? [],
    lectureRows: lectureRows ?? [],
    needsMigration,
    sections,
    includedBySection,
    packages,
    typeLabelOf,
    instructorLabel,
    minutesOf,
    sorted,
    groups,
  };
}

export type TermData = Awaited<ReturnType<typeof loadTermData>>;
