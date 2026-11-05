import { sectionPackages } from "@/lib/time-blocks";
import { partLabel, partsOf, partSubject, partTimeBlock, type Part } from "@/lib/class-parts";
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
 * **방학달 통짜 반은 교시(앞 · 뒤)마다 한 줄** (2026-11-05 Alan "각자 방송을 진행해") — 시간대는 그 교시 시간, 담당은 그 교시 과목 선생님(`teachers`).
 */
export type LiveLinkSession = {
  /** 줄의 열쇠 `회차id:교시` — 두 교시 반은 회차 하나에 줄이 둘이라 id 만으로는 겹친다 */
  key: string;
  /** session_dates.id */
  id: number;
  /** 교시 — 방학달 통짜 반만 1 · 2, 그 밖은 1 */
  part: Part;
  /** `앞 교시 LC` — 두 교시 반에서만 */
  partLabel: string | null;
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

export async function getLiveLinkSessions(
  supabase: DB,
  {
    from,
    to,
    teachers,
    teacherNames,
  }: {
    from: string;
    to: string;
    /** 과목 → 선생님 id (두 교시 반의 교시 담당). 강사 화면은 내 과목만 넣는다 — 다른 과목 교시는 `subject:rc` 같은 표식이 되어 내 목록에서 빠진다 */
    teachers?: ReadonlyMap<string, string>;
    /** 과목 → 선생님 이름 (`subject_instructors` — 조교도 부른다) */
    teacherNames?: ReadonlyMap<string, string>;
  },
): Promise<LiveLinkSession[]> {
  const { data } = await supabase
    .from("session_dates")
    .select(
      `id, seq, date,
       section:class_sections(id, term_id, course_id, track, time_block, subject, first_subject, second_start, recorded, status, live_to_replay, instructor_id,
         course:courses(name, program, target_score)),
       session_live_links(live_url, source, updated_at, part)`,
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

  return kept.flatMap((r) => {
    const s = r.section!;
    const links = r.session_live_links == null ? [] : Array.isArray(r.session_live_links) ? r.session_live_links : [r.session_live_links];
    return partsOf(s).map((part) => {
      const l = links.find((x) => (x.part ?? 1) === part) ?? null;
      const label = partLabel(s, part);
      // 두 교시 반의 담당 = 그 교시 과목 선생님. 내 과목이면 내 id, 아니면 `subject:rc` 표식(강사 화면에서 빠진다 — `forInstructor`), 과목을 모르면 비운다
      const subject = label ? partSubject(s, part) : s.subject;
      const instructorId = label ? (subject ? (teachers?.get(subject) ?? `subject:${subject}`) : null) : s.instructor_id;
      return {
        key: `${r.id}:${part}`,
        id: r.id,
        part,
        partLabel: label,
        seq: r.seq,
        date: r.date,
        time_block: label ? partTimeBlock(s, part) : s.time_block,
        sectionId: s.id,
        track: s.track,
        subject,
        courseName: s.course?.name ?? "강좌",
        level: s.course?.target_score ?? null,
        instructorId,
        instructorName: (instructorId && names.get(instructorId)?.name) || (label && subject ? (teacherNames?.get(subject) ?? null) : null),
        liveToReplay: s.live_to_replay,
        link: l ? { url: l.live_url, source: l.source, updatedAt: l.updated_at } : null,
      };
    });
  });
}
