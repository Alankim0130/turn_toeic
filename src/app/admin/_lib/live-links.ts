import { sectionPackages } from "@/lib/time-blocks";
import type { DB } from "./queries";
import { getProfileNames } from "./profile-names";

/**
 * 불라방 링크를 넣는 회차 (2026-09-30 Alan — 대시보드 불라방 위젯 · `/admin/live`).
 *
 * 링크는 **시간 단위 반**에만 둔다 (도메인 규칙 1 "반 권한") — 묶음 반(120분·140분) · 속성반 학생은 DB 가 안의 시간 단위 반을
 * 함께 열어 준다(`private.section_includes`). 그래서 여기서 빼는 것:
 *  - 인강 반(`recorded`) — 그 시간에 라이브가 없다
 *  - 속성반(program sparta) · 묶음 반(같은 기수·강좌·트랙에서 다른 반을 품는 반, `sectionPackages`)
 *  - 비공개(draft) 반
 * 방학달 120분 반은 안에 든 반이 없어 묶음이 아니다 — 그대로 남는다 (그 달엔 그것이 시간 단위 반이다).
 */
export type LiveLinkSession = {
  /** session_dates.id */
  id: number;
  seq: number;
  date: string;
  time_block: string | null;
  sectionId: number;
  track: string;
  subject: string | null;
  courseName: string;
  level: number | null;
  instructorId: string | null;
  instructorName: string | null;
  liveToReplay: boolean;
  link: { url: string; source: string; updatedAt: string } | null;
};

export async function getLiveLinkSessions(supabase: DB, { from, to }: { from: string; to: string }): Promise<LiveLinkSession[]> {
  const { data } = await supabase
    .from("session_dates")
    .select(
      `id, seq, date,
       section:class_sections(id, term_id, course_id, track, time_block, subject, recorded, status, live_to_replay, instructor_id,
         course:courses(name, program, target_score)),
       session_live_links(live_url, source, updated_at)`,
    )
    .gte("date", from)
    .lte("date", to)
    .order("date");

  const rows = (data ?? []).filter((r) => r.section && r.section.status !== "draft" && !r.section.recorded && r.section.course?.program === "score");
  // 묶음 반 = 이 목록 안에서 다른 반을 품는 반. 같은 날짜 범위라 품는 반과 안의 반이 함께 들어온다
  const sections = [...new Map(rows.map((r) => [r.section!.id, r.section!])).values()];
  const packages = sectionPackages(sections);
  const isPackage = (id: number) => (packages.get(id)?.parts.length ?? 0) > 0;
  const kept = rows.filter((r) => !isPackage(r.section!.id));
  // 담당 강사 이름 — 이름 · 등급만 주는 함수로 (조교에게도 열린 화면이다 — 조교는 profiles 를 못 읽는다, 2026-10-03 `profile-names.ts`)
  const names = await getProfileNames(supabase, kept.map((r) => r.section!.instructor_id));

  return kept.map((r) => {
    const s = r.section!;
    const l = Array.isArray(r.session_live_links) ? r.session_live_links[0] : r.session_live_links;
    return {
      id: r.id,
      seq: r.seq,
      date: r.date,
      time_block: s.time_block,
      sectionId: s.id,
      track: s.track,
      subject: s.subject,
      courseName: s.course?.name ?? "강좌",
      level: s.course?.target_score ?? null,
      instructorId: s.instructor_id,
      instructorName: (s.instructor_id && names.get(s.instructor_id)?.name) || null,
      liveToReplay: s.live_to_replay,
      link: l ? { url: l.live_url, source: l.source, updatedAt: l.updated_at } : null,
    };
  });
}
