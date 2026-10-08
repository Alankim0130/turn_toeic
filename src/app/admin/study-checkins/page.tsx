import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { TermChips } from "@/components/admin/TermChips";
import { CheckinRoster } from "@/components/admin/studies/CheckinRoster";
import { CheckinBoard, type CheckinGroup, type CheckinRow } from "@/components/admin/study-checkins/CheckinBoard";
import { termParam } from "@/lib/study";
import { isCheckinChecked } from "@/lib/study-checkin";
import { week5SectionIds, collapseWeek5 } from "@/lib/week5";
import { requireCrew } from "@/lib/auth";
import { pickTerm, termLabel, sectionChip, type TermLite } from "../_lib/queries";
import { getProfileNames } from "../_lib/profile-names";

export const metadata: Metadata = { title: "비대면스터디 인증", robots: { index: false } };

/** PostgREST 는 한 번에 1,000줄까지만 준다 — 한 달 인증이 신청자 × 수업일이라 넘을 수 있어 나눠 읽는다 */
const PAGE = 1000;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type CheckinFile = { id: number; file_name: string; content_type: string; created_at: string };
type Checkin = {
  id: number;
  material_id: number;
  user_id: string;
  note: string | null;
  created_at: string;
  status: string;
  checked_by: string | null;
  checked_at: string | null;
  feedback: string | null;
  study_checkin_files: CheckinFile[];
};

/**
 * **비대면스터디 인증** (2026-10-08 Alan — "비대면 스터디도 숙제 점검 처럼 게시판이 필요합니당~ "비대면스터디 인증" 카테고리 하나 만들어줘.
 * 별도의 페이지가 있으면 좋겠어"). 두 화면이다:
 *  - **게시판**(기본) — 학생이 올린 인증 한 건이 한 줄, 자료 날짜(회차)로 묶는다. 줄을 누르면 풀이 사진을 넘겨 보고 메모를 읽고 **확인 완료**(+ 코멘트)한다.
 *    기본은 **확인 전만**이고 `확인 완료 포함` 으로 다 본다 (숙제점검의 `점검완료 포함` 과 같은 자리).
 *  - **한눈에 보기** — 학생 × 날짜 격자와 날짜별 미인증 독촉 알림 (예전 스터디 신청자 화면의 인증 현황을 그대로 옮겼다 — `CheckinRoster`).
 *
 * **조교도 쓴다** — 스터디는 조교가 운영한다 (2026-10-03 Alan "스터디를 조교가 운영한다", 인증 현황 · 독촉은 그때부터 조교 일이었다).
 * 학생 이름은 이름 · 등급만 주는 `getProfileNames` 로 읽는다 (조교는 profiles 를 못 읽는다 — 등급 체계 9-2).
 * **숙제점검과는 완전히 다른 일이다** (2026-09-19 Alan "철저하게 분리") — 사진 보기(`PhotoViewer`)만 함께 쓴다.
 */
export default async function StudyCheckinsPage({ searchParams }: { searchParams: Promise<{ term?: string; view?: string; done?: string }> }) {
  await requireCrew();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();
  const view = sp.view === "grid" ? "grid" : "board";
  const done = sp.done === "1";

  // 비대면 스터디가 있는 기수만 고른다
  const { data: onlineStudies } = await supabase.from("studies").select("id, term_id, status, term:terms(id, year, month, enrollment_opens_at, closes_at)").eq("kind", "online");
  const termMap = new Map<number, TermLite>();
  for (const s of onlineStudies ?? []) if (s.term) termMap.set(s.term.id, s.term);
  const terms = [...termMap.values()].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  const term = pickTerm(terms, sp.term, today);
  const study = term ? (onlineStudies ?? []).find((s) => s.term_id === term.id) : undefined;

  const header = (
    <PageHeader
      icon="camera"
      title="비대면스터디 인증"
      description="학생이 비대면 스터디 자료를 풀고 올린 인증이에요. 줄을 누르면 풀이 사진을 넘겨 보고, 확인 완료하면 학생 알림함으로 가요."
    >
      <Link href={term ? `/admin/study?term=${termParam(term.year, term.month)}&kind=online` : "/admin/study"} className="btn-secondary">
        <Icon name="study" size={18} />
        신청자 명단
      </Link>
    </PageHeader>
  );

  if (!term || !study) {
    return (
      <>
        {header}
        <EmptyState
          icon="online"
          title="아직 연 비대면 스터디가 없어요"
          description="그 달 비대면 스터디를 열고 자료를 올리면, 학생이 수업일마다 인증한 것이 여기에 모여요."
          action={{ href: "/admin/study-materials", label: "비대면 자료로" }}
        />
      </>
    );
  }

  const termKey = termParam(term.year, term.month);
  const [{ data: materialRows }, { data: signups }] = await Promise.all([
    supabase.from("study_materials").select("id, seq, date, title").eq("study_id", study.id).order("date", { ascending: false }),
    supabase.from("study_signups").select("user_id").eq("study_id", study.id),
  ]);
  const materials = materialRows ?? [];
  const { rows: checkins, legacy } = await getCheckins(
    supabase,
    materials.map((m) => m.id),
  );

  // 이름 — 신청자 · 인증한 학생 · 확인한 사람 (이름 · 등급만 주는 함수로 — 조교는 profiles 를 못 읽는다)
  const signupIds = [...new Set((signups ?? []).map((s) => s.user_id))];
  const studentIds = [...new Set([...signupIds, ...checkins.map((c) => c.user_id)])];
  const names = await getProfileNames(supabase, [...studentIds, ...checkins.flatMap((c) => (c.checked_by ? [c.checked_by] : []))]);
  const classesOf = await getTermClasses(supabase, studentIds, term.id);
  const nameOf = (id: string) => names.get(id)?.name || "이름 없음";

  const unchecked = checkins.filter((c) => !isCheckinChecked(c.status)).length;

  return (
    <>
      {header}

      <TermChips basePath="/admin/study-checkins" terms={terms} current={termKey} keep={{ view: view === "grid" ? "grid" : undefined }} />
      <FilterTabs
        basePath="/admin/study-checkins"
        paramKey="view"
        current={view}
        keep={{ term: termKey }}
        tabs={[
          { value: "board", label: "게시판", count: unchecked },
          { value: "grid", label: "한눈에 보기" },
        ]}
      />

      {legacy && (
        <Alert kind="warning" title="확인 칸을 준비하는 중이에요">
          새 기능이 배포되는 몇 분 동안은 인증을 볼 수만 있어요. 잠시 뒤 새로고침하면 확인 완료를 누를 수 있어요.
        </Alert>
      )}

      {view === "grid" ? (
        <GridView
          term={term}
          materials={materials}
          checkins={checkins}
          students={signupIds.map((id) => ({ id, name: names.get(id)?.name ?? "", classes: classesOf.get(id) ?? [] }))}
          today={today}
        />
      ) : (
        <BoardView
          termKey={termKey}
          termName={termLabel(term)}
          done={done}
          unchecked={unchecked}
          groups={boardGroups({ materials, checkins, signups: signupIds.length, done, today, nameOf, classesOf })}
        />
      )}
    </>
  );
}

/** 게시판 — 확인 전(기본) 또는 전부를 자료 날짜로 묶어 한 줄씩 */
function BoardView({ termKey, termName, done, unchecked, groups }: { termKey: string; termName: string; done: boolean; unchecked: number; groups: CheckinGroup[] }) {
  return (
    <>
      {/* 몇 건 남았는지 + 확인 완료까지 함께 볼지 (숙제점검의 `점검완료 포함` 과 같은 자리) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-bold text-ink-soft">
          {termName} · 확인 전 <span className="text-ink tabular-nums">{unchecked}</span>건
        </p>
        <Link
          href={`/admin/study-checkins?term=${termKey}${done ? "" : "&done=1"}`}
          className="flex items-center gap-2 text-sm font-bold text-ink-soft transition hover:text-brand-600"
        >
          <span
            aria-hidden
            className={cn("flex size-5 items-center justify-center rounded-md border-2 transition", done ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-paper")}
          >
            {done && (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[3.5]">
                <path d="m5 13 5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          확인 완료 포함
          <span className="sr-only">{done ? " — 지금 켜짐, 누르면 끕니다" : " — 지금 꺼짐, 누르면 켭니다"}</span>
        </Link>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon="camera"
          title={done ? "올라온 인증이 없어요" : "확인할 인증이 없어요"}
          description={
            done
              ? "학생이 내 스터디에서 자료를 풀고 풀이 사진으로 인증하면 여기에 모여요."
              : "올라온 인증을 모두 확인했어요. 확인한 것까지 보려면 위의 '확인 완료 포함' 을 눌러 주세요. 인증을 안 한 학생은 '한눈에 보기' 에서 알림을 보낼 수 있어요."
          }
        />
      ) : (
        <CheckinBoard groups={groups} />
      )}
    </>
  );
}

/** 한눈에 보기 — 학생 × 날짜 격자 + 날짜별 미인증 독촉 (예전 스터디 신청자 화면의 인증 현황) */
function GridView({
  term,
  materials,
  checkins,
  students,
  today,
}: {
  term: TermLite;
  materials: { id: number; seq: number | null; date: string; title: string | null }[];
  checkins: Checkin[];
  students: { id: string; name: string; classes: string[] }[];
  today: string;
}) {
  if (students.length === 0) {
    return <EmptyState icon="online" title="아직 신청한 수강생이 없어요" description={`${termLabel(term)} 비대면 스터디를 신청한 수강생이 생기면 날짜별 인증 현황이 여기에 나와요.`} />;
  }
  return (
    <section>
      <h2 className="mb-2 text-base font-black text-ink">
        날짜별 인증 현황 <span className="text-sm font-semibold text-slate">— 자료를 풀고 인증하지 않은 학생에게 알림을 보낼 수 있어요</span>
      </h2>
      <CheckinRoster
        students={students}
        materials={materials}
        checkins={checkins.map((c) => ({ material_id: c.material_id, user_id: c.user_id, created_at: c.created_at, files: c.study_checkin_files.length }))}
        today={today}
      />
    </section>
  );
}

/**
 * 게시판 묶음 — 최근 자료 날짜가 위, 묶음 안은 최근에 올린 인증이 위. 확인 전만 볼 때는 남은 것이 없는 날짜를 그리지 않는다.
 * 묶음 머리글의 숫자는 그 날 전체(인증 · 신청 · 확인 전)다 — 보고 있는 줄 수가 아니다.
 */
function boardGroups(input: {
  materials: { id: number; seq: number | null; date: string; title: string | null }[];
  checkins: Checkin[];
  signups: number;
  done: boolean;
  today: string;
  nameOf: (id: string) => string;
  classesOf: Map<string, string[]>;
}): CheckinGroup[] {
  const byMaterial = new Map<number, Checkin[]>();
  for (const c of input.checkins) byMaterial.set(c.material_id, [...(byMaterial.get(c.material_id) ?? []), c]);
  const short = (iso: string) => formatDate(iso, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return input.materials.flatMap((m) => {
    const all = byMaterial.get(m.id) ?? [];
    const waiting = all.filter((c) => !isCheckinChecked(c.status)).length;
    const shown = (input.done ? all : all.filter((c) => !isCheckinChecked(c.status))).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    if (shown.length === 0) return [];
    const day = formatDate(m.date);
    const round = m.seq ? `${m.seq}회차 · ` : "";
    const rows: CheckinRow[] = shown.map((c) => {
      const classes = input.classesOf.get(c.user_id) ?? [];
      const photos = [...c.study_checkin_files].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id).map((f) => ({ id: f.id, name: f.file_name }));
      const checked = isCheckinChecked(c.status);
      const checker = c.checked_by ? input.nameOf(c.checked_by) : null;
      const at = short(c.created_at);
      return {
        id: c.id,
        name: input.nameOf(c.user_id),
        classes,
        sub: [classes.join(" · ") || "반 미배정", `사진 ${photos.length}장`, c.note ? "메모" : null].filter(Boolean).join(" · "),
        at,
        meta: [
          `${round}${day} 자료`,
          `${at} 인증`,
          checked ? `확인 완료${checker ? ` · ${checker}` : ""}${c.checked_at ? ` · ${short(c.checked_at)}` : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        checked,
        note: c.note,
        feedback: c.feedback,
        photos,
      };
    });
    const counts = [`인증 ${all.length}${input.signups ? ` / 신청 ${input.signups}` : ""}`, `확인 전 ${waiting}`, m.date > input.today ? "공개 전" : null].filter(Boolean).join(" · ");
    // 자료 제목이 회차 이름 그대로(`2회차`)면 되풀이하지 않는다
    const title = m.title && m.title.trim() !== `${m.seq}회차` ? ` · ${m.title.trim()}` : "";
    return [{ key: m.id, title: `${round}${day}${title}`, counts, rows }];
  });
}

/**
 * 그 달 자료의 인증 전부 — 1,000줄씩 나눠 읽는다. 확인 칸(status …)은 마이그레이션 20261008140000 에서 생겼다 —
 * 배포와 마이그레이션 사이에 못 읽으면 예전 칸만 읽어 모두 '확인 전' 으로 보여 준다 (그대로 비우면 인증이 하나도 없는 것처럼 보인다).
 */
async function getCheckins(supabase: Supabase, materialIds: number[]): Promise<{ rows: Checkin[]; legacy: boolean }> {
  if (materialIds.length === 0) return { rows: [], legacy: false };
  const rows: Checkin[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("study_checkins")
      .select("id, material_id, user_id, note, created_at, status, checked_by, checked_at, feedback, study_checkin_files(id, file_name, content_type, created_at)")
      .in("material_id", materialIds)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return getLegacyCheckins(supabase, materialIds);
    rows.push(...((data ?? []) as Checkin[]));
    if (!data || data.length < PAGE) break;
  }
  return { rows, legacy: false };
}

async function getLegacyCheckins(supabase: Supabase, materialIds: number[]): Promise<{ rows: Checkin[]; legacy: boolean }> {
  const rows: Checkin[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("study_checkins")
      .select("id, material_id, user_id, note, created_at, study_checkin_files(id, file_name, content_type, created_at)")
      .in("material_id", materialIds)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) break;
    rows.push(...(data ?? []).map((c) => ({ ...c, status: "submitted", checked_by: null, checked_at: null, feedback: null })));
    if (!data || data.length < PAGE) break;
  }
  return { rows, legacy: true };
}

/**
 * 학생마다 **그 달에 듣는 반** (2026-09-19 Alan — "650 주5일 10:00~12:10 이런거"). 스터디 신청자 화면의 인증 표와 같은 값이다.
 * 등급은 적지 않는다 — 스터디는 그 달 반에 배정된 수강생만 신청한다. **이 기수의 배정만** 남기고 주5일은 한 줄로 합친다
 * (짝은 그 학생이 듣는 반 안에서만 찾는다 — 명단 전체로 찾으면 다른 학생의 반과 짝이 된다).
 */
async function getTermClasses(supabase: Supabase, studentIds: string[], termId: number): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (studentIds.length === 0) return out;
  const { data } = await supabase
    .from("enrollments")
    // enrollments 는 class_sections 를 두 번 참조한다(section_id · pending_from_section_id) — FK 이름을 꼭 적는다
    .select("student_id, section:class_sections!enrollments_section_id_fkey(id, term_id, course_id, track, start_time, time_block, course:courses(name, target_score, program))")
    .in("student_id", studentIds)
    .order("id");
  const byUser = new Map<string, NonNullable<typeof data>>();
  for (const e of data ?? []) {
    if (e.section?.term_id !== termId) continue;
    byUser.set(e.student_id, [...(byUser.get(e.student_id) ?? []), e]);
  }
  for (const [id, mine] of byUser) {
    const week5 = week5SectionIds(mine.map((e) => e.section).filter((x) => !!x));
    // 달(`9월`)은 뺀다 — 화면 전체가 이미 한 기수라 줄마다 되풀이하면 레벨·시간이 뒤로 밀린다
    out.set(
      id,
      collapseWeek5(mine, (e) => e.section, week5).map((e) => sectionChip(e.section, week5, { withTerm: false })),
    );
  }
  return out;
}
