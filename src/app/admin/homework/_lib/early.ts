import { firstClassStart, sentBeforeClass, type DaySection } from "@/lib/homework-day";
import { readAllIn } from "@/lib/read-all";
import type { DB } from "../../_lib/queries";

type Sub = { id: number; user_id: string; class_date: string | null; created_at: string };

/**
 * **수업 전에 낸 숙제** — 그 수업 날짜보다 먼저 냈거나 같은 날 첫 수업 시작 전에 냈다 (`sentBeforeClass`, 2026-10-30 문라경 학생).
 * 숙제는 수업에서 내 주므로 이런 숙제는 거의 다 **지난 수업 숙제를 날짜를 잘못 골라** 낸 것이다 — 그러면 원래 수업은 '안 냄' 이 되어 미제출 알림이 갔다.
 * 숙제점검의 이름 검색(학생 몇 명)에서만 센다. 첫 수업 시작은 그 학생이 배정된 반 중 그 날 회차가 있는 반의 시간대(인강 반 빼고)로 보고,
 * 반 · 회차를 못 읽으면(지운 배정 · 조회 실패) 날짜만 본다 — 표시일 뿐 막지 않는다.
 */
export async function earlySubmissionIds(supabase: DB, subs: readonly Sub[]): Promise<Set<number>> {
  const dated = subs.filter((s): s is Sub & { class_date: string } => !!s.class_date);
  if (dated.length === 0) return new Set();

  const students = [...new Set(dated.map((s) => s.user_id))];
  const { rows: enrollments } = await readAllIn(students, (chunk, from, to, count) =>
    supabase
      .from("enrollments")
      .select("id, student_id, section_id, section:class_sections!enrollments_section_id_fkey(time_block, recorded)", count ? { count: "exact" } : undefined)
      .in("student_id", chunk)
      .order("id")
      .range(from, to),
  );
  const sectionIds = [...new Set(enrollments.flatMap((e) => (e.section_id != null ? [e.section_id] : [])))];
  const dates = [...new Set(dated.map((s) => s.class_date))];
  const { rows: sessions } = sectionIds.length
    ? await readAllIn(sectionIds, (chunk, from, to, count) =>
        supabase
          .from("session_dates")
          .select("id, section_id, date", count ? { count: "exact" } : undefined)
          .in("section_id", chunk)
          .in("date", dates)
          .order("id")
          .range(from, to),
      )
    : { rows: [] as { section_id: number; date: string }[] };

  const classOn = new Set(sessions.map((d) => `${d.section_id}|${d.date}`));
  const sectionsOf = new Map<string, { id: number; section: Pick<DaySection, "timeBlock" | "recorded"> }[]>();
  for (const e of enrollments) {
    if (e.section_id == null || !e.section) continue;
    const list = sectionsOf.get(e.student_id) ?? [];
    list.push({ id: e.section_id, section: { timeBlock: e.section.time_block, recorded: e.section.recorded } });
    sectionsOf.set(e.student_id, list);
  }

  const out = new Set<number>();
  for (const s of dated) {
    const ofDay = (sectionsOf.get(s.user_id) ?? []).filter((x) => classOn.has(`${x.id}|${s.class_date}`)).map((x) => x.section);
    if (sentBeforeClass(s.class_date, s.created_at, firstClassStart(ofDay))) out.add(s.id);
  }
  return out;
}
