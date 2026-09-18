import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { formatDate, TRACK_LABEL, COURSE_TYPE_LABEL, todayKST, cn } from "@/lib/utils";
import { CreateSectionForm } from "@/components/admin/sections/CreateSectionForm";
import { BulkCreateSections, type BulkSlot } from "@/components/admin/sections/BulkCreateSections";
import { AssignInstructor } from "@/components/admin/sections/AssignInstructor";
import { sectionKeyOf, timeBlockOf } from "@/components/admin/sections/bulk";
import { TermCalendar, type TermSchedule, type OtherTermDate } from "@/components/admin/sections/TermCalendar";
import { shiftMonth, termKey, ymd, daysInMonth } from "@/components/admin/sections/dates";
import { StudyPlanner, type PlannerStudy } from "@/components/admin/studies/StudyPlanner";
import { SEASON_LABEL, seasonOfMonth } from "@/lib/timetable";
import { blockMinutes, buildBlockTree, dashLabel, minutesLabel, parseTimeBlock, sectionPackages } from "@/lib/time-blocks";

export const metadata: Metadata = { title: "반 편성", robots: { index: false } };

const STATUS_LABEL: Record<string, string> = { draft: "준비 중", open: "모집 중", closed: "종료" };
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-slate/10 text-slate",
  open: "bg-brand-100 text-brand-700",
  closed: "bg-ink/10 text-ink-soft",
};

function parseTerm(term?: string): { y: number; m: number } {
  const match = term?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    if (y >= 2020 && y <= 2100 && m >= 1 && m <= 12) return { y, m };
  }
  const [y, m] = todayKST().split("-").map(Number);
  return { y, m };
}

export default async function AdminSectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; created?: string; deleted?: string }>;
}) {
  const { user, profile } = await requireStaff();
  const sp = await searchParams;
  const { y, m } = parseTerm(sp.term);
  const key = termKey(y, m);
  const today = todayKST();
  const supabase = await createClient();

  const [{ data: term }, { data: lecturers }, { data: courses }, { data: instructors }, { data: timetable }] = await Promise.all([
    supabase.from("terms").select("id, year, month, enrollment_opens_at, closes_at").eq("year", y).eq("month", m).maybeSingle(),
    supabase.from("lecturers").select("id, name").order("sort_order").order("name"),
    supabase
      .from("courses")
      .select("id, code, name, course_type, target_score, program, includes_levels")
      .eq("is_active", true)
      .order("program")
      .order("target_score")
      .order("name"),
    isAdmin(profile.role)
      ? supabase.from("profiles").select("id, name, role, subject").in("role", ["instructor", "admin"]).order("name")
      : Promise.resolve({ data: null }),
    supabase.from("timetable_slots").select("id, level, program, season, start_time, end_time").order("level").order("start_time").order("end_time"),
  ]);

  const [{ data: classDates }, { data: lectureRows, error: lectureError }, { data: sections }, { data: studyRows }] = term
    ? await Promise.all([
        supabase.from("term_class_dates").select("date, track").eq("term_id", term.id).order("date"),
        supabase.from("special_lectures").select("id, date, lecturer_id, content, kinds, signup, capacity, signup_opens_at, applied_count").eq("term_id", term.id).order("date").order("id"),
        supabase
          .from("class_sections")
          .select(
            "id, bundle_id, track, time_block, book_set, recorded, course_id, capacity, status, instructor_id, course:courses(name, course_type, target_score, program), instructor:profiles(name), session_dates(count), section_live_links(section_id)",
          )
          .eq("term_id", term.id)
          .order("course_id")
          .order("track"),
        supabase
          .from("studies")
          .select(
            "id, kind, status, notice, study_slots!study_slots_study_id_fkey(id, start_time, end_time, capacity, applied_count), study_signups!study_signups_study_id_fkey(count), study_materials(count)",
          )
          .eq("term_id", term.id),
      ])
    : [{ data: [] as never[] }, { data: [] as never[], error: null }, { data: [] as never[] }, { data: [] as never[] }];

  // special_lectures.kinds 가 없으면 아직 마이그레이션이 적용되지 않은 것 — 저장이 전부 실패한다
  const needsMigration = !!lectureError && (lectureError.code === "42703" || lectureError.code === "PGRST204" || /kinds/.test(lectureError.message ?? ""));

  // 월(기수) 구분: 달력에 함께 보이는 앞뒤 달 날짜를 다른 기수가 이미 쓰고 있는지
  const prev = shiftMonth(y, m, -1);
  const next = shiftMonth(y, m, 1);
  const { data: neighbourDates } = await supabase
    .from("term_class_dates")
    .select("date, track, term:terms!inner(id, year, month)")
    .gte("date", ymd(prev.y, prev.m, 1))
    .lte("date", ymd(next.y, next.m, daysInMonth(next.y, next.m)))
    .order("date");
  const otherTermDates: OtherTermDate[] = (neighbourDates ?? [])
    .filter((d) => d.term && d.term.id !== term?.id)
    .map((d) => ({ date: d.date, track: d.track === "ttf" ? ("ttf" as const) : ("mwf" as const), year: d.term!.year, month: d.term!.month }));

  // 다시보기가 붙은 수업일은 달력에서 뺄 수 없다 — 달력에 표시하려고 미리 읽는다
  const sectionTrack = new Map((sections ?? []).map((s) => [s.id, s.track]));
  const { data: replayRows } = sectionTrack.size
    ? await supabase.from("session_dates").select("date, section_id, replays!inner(id)").in("section_id", [...sectionTrack.keys()])
    : { data: [] as { date: string; section_id: number }[] };
  const replayDates = (replayRows ?? []).map((r) => ({ date: r.date, track: sectionTrack.get(r.section_id) === "ttf" ? ("ttf" as const) : ("mwf" as const) }));

  // 스파르타 반이 권한을 함께 주는 반 (DB 의 private.section_includes 와 같은 판정) — 카드에 보여 준다
  const hasSparta = (sections ?? []).some((s) => s.course?.program === "sparta");
  const { data: includeRows } = term && hasSparta ? await supabase.rpc("term_section_includes", { p_term_id: term.id }) : { data: [] };
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s]));
  const includedBySection = new Map<number, string[]>();
  for (const r of includeRows ?? []) {
    const inc = sectionById.get(r.included_id);
    if (!inc) continue;
    const label = [inc.course?.name ?? "강좌", inc.time_block].filter(Boolean).join(" ");
    includedBySection.set(r.section_id, [...(includedBySection.get(r.section_id) ?? []), label]);
  }
  // 묶음 반(120분·140분) ↔ 시간 단위 반(60분·70분): 같은 강좌·트랙에서 시간이 안에 들어오는 반 (2026-09-16 Alan)
  const packages = sectionPackages(sections ?? []);
  // 묶음 반(120분·140분)·스파르타 반은 담당이 한 명이 아니라 DB 에는 비어 있다 (도메인 규칙 1 "담당 강사").
  // **화면에는 두 강사 이름을 다 적는다** (2026-09-18 Alan "종합에는 LC·RC 둘 다 수업을 하니 두 쌤 이름을 다") —
  // 안에 든 시간 단위 반의 담당을 모으고, 아직 아무도 없으면 과목 강사(이혜영 LC · 이영수 RC) 둘을 적는다
  const subjectInstructorNames = (instructors ?? [])
    .filter((i) => i.subject === "lc" || i.subject === "rc")
    .map((i) => i.name)
    .sort((a, b) => a.localeCompare(b, "ko"));
  const instructorLabel = (s: NonNullable<typeof sections>[number]): string | null => {
    if (s.instructor?.name) return s.instructor.name;
    const parts = packages.get(s.id)?.parts ?? [];
    const names = [...new Set(parts.map((p) => p.instructor?.name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, "ko"));
    if (names.length > 0) return names.join(" · ");
    if (parts.length > 0 || s.course?.program === "sparta") return subjectInstructorNames.length > 0 ? subjectInstructorNames.join(" · ") : null;
    return null;
  };
  // 시간대 라벨 → "120분" 같은 분량 (묶음은 안에 든 시간 단위의 합)
  const minutesOf = new Map<string, string | null>();
  for (const c of new Set((sections ?? []).map((s) => s.course_id))) {
    const mine = (sections ?? []).filter((s) => s.course_id === c);
    const walk = (nodes: ReturnType<typeof buildBlockTree>) => {
      for (const n of nodes) {
        minutesOf.set(`${c}|${n.label}`, minutesLabel(blockMinutes(n)));
        walk(n.parts);
      }
    };
    walk(buildBlockTree(mine.map((s) => s.time_block), { nest: mine[0]?.course?.program === "score" }));
  }

  const saved: TermSchedule = {
    opens: term?.enrollment_opens_at ?? null,
    closes: term?.closes_at ?? null,
    mwf: (classDates ?? []).filter((d) => d.track === "mwf").map((d) => d.date),
    ttf: (classDates ?? []).filter((d) => d.track === "ttf").map((d) => d.date),
    lectures: (lectureRows ?? []).map((l) => ({
      id: l.id,
      date: l.date,
      lecturerId: l.lecturer_id,
      content: l.content ?? "",
      kinds: l.kinds ?? [],
    })),
  };
  const hasSaved = !!term?.enrollment_opens_at && !!term?.closes_at;

  // 시간표 기준 일괄 개설용: 레벨별 시간대와 이미 만들어진 (강좌·트랙·시간대) 조합.
  // 평달과 방학달은 시간대가 다르다 (2026-09-16 Alan) — 이 기수의 계절에 맞는 시간대만 쓴다
  const season = term ? seasonOfMonth(term.month) : "regular";
  const bulkSlots: BulkSlot[] = (timetable ?? [])
    .filter((s) => s.season === season)
    .map((s) => ({ id: s.id, level: s.level, program: s.program, label: timeBlockOf(s.start_time, s.end_time) ?? "" }))
    .filter((s) => s.label);
  const seasonHasNoSlots = term != null && bulkSlots.length === 0 && (timetable ?? []).length > 0;
  const existingKeys = (sections ?? []).map((s) => sectionKeyOf(s.course_id, s.track, s.time_block));

  const studies: PlannerStudy[] = (studyRows ?? []).map((s) => ({
    id: s.id,
    kind: s.kind,
    status: s.status,
    notice: s.notice,
    slots: s.study_slots ?? [],
    signupCount: s.study_signups?.[0]?.count ?? 0,
    materialCount: s.study_materials?.[0]?.count ?? 0,
  }));

  // 주5일 = 같은 강좌·시간대의 월수금 + 화목금. 그 둘을 한 묶음으로 모아 보여준다 (시간대가 없는 반은 하나씩 만들기의 bundle_id 로)
  type Sec = NonNullable<typeof sections>[number];
  const groups = new Map<string, Sec[]>();
  const order = (s: Sec) => {
    const span = parseTimeBlock(s.time_block);
    return [s.course?.program === "sparta" ? 1 : 0, s.course?.target_score ?? 0, span?.start ?? 9999, -(span?.end ?? 0), s.track === "mwf" ? 0 : 1];
  };
  const sorted = [...(sections ?? [])].sort((a, b) => {
    const oa = order(a);
    const ob = order(b);
    for (let i = 0; i < oa.length; i++) if (oa[i] !== ob[i]) return oa[i] - ob[i];
    return a.id - b.id;
  });
  for (const s of sorted) {
    const k = s.time_block ? `${s.course_id}|${s.time_block}` : (s.bundle_id ?? `single-${s.id}`);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const termLabel = `${y}년 ${m}월`;

  return (
    <div className="space-y-8">
      <PageHeader
        icon="calendar"
        title="반 편성"
        description="달력에서 개강일·종강일·월수금·화목금 수업일·특강을 찍어 주세요. 항목마다 따로 저장할 수 있고, 강의가 다음 달까지 이어지면 앞뒤 달 날짜도 찍을 수 있어요."
      >
        <Link href={`/admin/lectures?term=${key}`} className="btn-secondary">
          <Icon name="bolt" size={18} />
          특강 신청
        </Link>
        <Link href="/admin/replays" className="btn-secondary">
          <Icon name="replay" size={18} />
          다시보기 등록
        </Link>
      </PageHeader>

      {needsMigration && (
        <Alert kind="warning" title="데이터베이스 업데이트가 아직 적용되지 않았어요">
          <p>이 상태에서는 <b className="text-ink">달력을 저장해도 저장되지 않습니다.</b> 편성을 시작하기 전에 먼저 적용해 주세요.</p>
          <p className="mt-1">
            터미널에서 <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">npx supabase db push --linked</code> 를 실행하거나, Supabase 대시보드의 SQL
            Editor 에서 <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">supabase/migrations</code> 의 최신 파일을 실행하면 됩니다.
          </p>
        </Alert>
      )}

      {sp.created && (
        <Alert kind="success" title={Number(sp.created) > 1 ? "주5일 묶음 반 2개를 개설했어요" : "반을 개설했어요"}>
          수업일·개강일·종강일은 {termLabel} 달력에서 자동으로 채워졌어요.
        </Alert>
      )}
      {sp.deleted && <Alert kind="info" title="반을 삭제했어요" />}

      {/* 달력 */}
      <section aria-label={`${termLabel} 달력`} className="card p-4 sm:p-6">
        <TermCalendar
          key={key}
          year={y}
          month={m}
          today={today}
          saved={saved}
          hasSaved={hasSaved}
          lecturers={lecturers ?? []}
          replayDates={replayDates}
          otherTermDates={otherTermDates}
          sectionCount={sections?.length ?? 0}
        />
      </section>

      {!term && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <Icon name="calendar" size={44} />
          <p className="font-bold text-ink">{termLabel} 일정이 아직 없어요</p>
          <p className="text-sm text-slate">달력에서 날짜를 찍고 생성하기를 누르면 이 달 반 개설과 스터디 시간 설정이 열려요.</p>
        </div>
      )}

      {/* 담당 강사 지정 — 개설 반 목록보다 위에 둔다. 반이 70개라 아래에 두면 모바일에서 못 찾는다 (2026-09-16 Alan) */}
      {term && isAdmin(profile.role) && (sections?.length ?? 0) > 0 && (
        <section aria-labelledby="assign-instructor-title" className="card p-5 sm:p-7">
          <h2 id="assign-instructor-title" className="text-lg font-black text-ink">
            담당 강사 지정 <span className="text-sm font-semibold text-slate">— {termLabel}</span>
          </h2>
          <div className="mt-4">
            <AssignInstructor
              termLabel={termLabel}
              termId={term.id}
              // 과목이 있는 강사(이혜영 LC · 이영수 RC)를 앞에 둔다 — 관리자는 수업을 맡지 않는다
              instructors={(instructors ?? [])
                .map((i) => ({ id: i.id, name: i.name, subject: i.subject === "lc" ? ("lc" as const) : i.subject === "rc" ? ("rc" as const) : null }))
                .sort((a, b) => Number(!a.subject) - Number(!b.subject))}
              rows={sorted.map((s) => ({
                id: s.id,
                courseId: s.course_id,
                course: s.course?.name ?? "강좌",
                track: s.track,
                timeBlock: s.time_block,
                bookSet: s.book_set,
                instructor: instructorLabel(s),
                // 묶음 반(안에 시간 단위 반이 든 반)·스파르타 반은 한 시간씩 강사가 갈린다
                package: (packages.get(s.id)?.parts.length ?? 0) > 0 || s.course?.program === "sparta",
              }))}
            />
          </div>
        </section>
      )}

      {/* 개설 반 */}
      {term && (
        <section id="sections" aria-labelledby="section-list-title" className="scroll-mt-20">
          <h2 id="section-list-title" className="mb-3 text-lg font-black text-ink">
            개설 반 <span className="text-slate">({sections?.length ?? 0})</span>
          </h2>
          {(sections?.length ?? 0) === 0 ? (
            <div className="card flex flex-col items-center gap-2 p-8 text-center">
              <Icon name="students" size={44} />
              <p className="font-bold text-ink">아직 개설된 반이 없어요</p>
              <p className="text-sm text-slate">아래 “새 반 개설”에서 강좌와 트랙을 고르면 달력의 수업일로 반이 만들어져요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[...groups.entries()].map(([k, list]) => {
                const bundled = list.length > 1;
                const head = list[0];
                const minutes = head.time_block ? minutesOf.get(`${head.course_id}|${head.time_block}`) : null;
                const isPackage = (packages.get(head.id)?.parts.length ?? 0) > 0;
                return (
                  <div key={k} className={cn(bundled && "rounded-xl3 border border-brand-200 bg-brand-50/40 p-3")}>
                    {bundled && (
                      <p className="mb-2 flex flex-wrap items-center gap-2 px-1 text-xs font-black text-brand-700">
                        <Icon name="bolt" size={16} />
                        주5일 묶음 — 월수금 + 화목금
                        {head.time_block && <span className="rounded-full bg-paper px-2 py-0.5 tabular-nums text-ink">{head.time_block}</span>}
                        {minutes && <span className="rounded-full bg-paper px-2 py-0.5 text-ink">{minutes}</span>}
                        {isPackage && <span className="font-semibold text-slate">묶음 반 · 안에 든 60분·70분 반을 함께 들어요</span>}
                      </p>
                    )}
                    <div className={cn("grid gap-3", bundled && "sm:grid-cols-2")}>
                      {list.map((s) => {
                        const count = s.session_dates?.[0]?.count ?? 0;
                        const hasLive = !!s.section_live_links;
                        const pk = packages.get(s.id);
                        return (
                          <Link
                            key={s.id}
                            href={`/admin/sections/${s.id}`}
                            className="card block p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pink"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-lg font-black text-ink">
                                  {s.course?.name ?? "강좌"}
                                  {s.course?.course_type && (
                                    <span className="ml-2 text-sm font-semibold text-slate">{COURSE_TYPE_LABEL[s.course.course_type]}</span>
                                  )}
                                </p>
                                <p className="mt-1 text-sm">
                                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold text-white", s.track === "mwf" ? "bg-brand-500" : "bg-ink")}>
                                    {TRACK_LABEL[s.track] ?? s.track}
                                  </span>
                                  {/* 저녁반 화목금은 인강 — 시간표(ttf_recorded)가 정한다 (2026-09-17 Alan) */}
                                  {s.recorded && (
                                    <span
                                      className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-black text-violet-800"
                                      title="교실에 나오지 않고 그 날 오전 수업 녹화본을 봐요"
                                    >
                                      인강
                                    </span>
                                  )}
                                  {s.time_block && <span className="ml-2 font-bold tabular-nums text-ink-soft">{s.time_block}</span>}
                                  {!bundled && minutes && <span className="ml-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-black text-brand-700">{minutes}</span>}
                                  <span className={cn("ml-2 font-black", count > 0 ? "text-brand-600" : "text-amber-600")}>
                                    수업일 {count}회{count === 0 && " — 달력에 이 트랙 날짜가 없어요"}
                                  </span>
                                  {s.book_set && <span className="ml-2 text-xs font-bold text-slate">LC 교재 {s.book_set}반</span>}
                                </p>
                                {pk && pk.parts.length > 0 && (
                                  <p className="mt-2 text-xs text-slate">
                                    <span className="mr-1 rounded-full bg-ink px-2 py-0.5 font-black text-white">묶음 반</span>
                                    이 반 학생이 함께 듣는 시간: <strong className="text-ink">{pk.parts.map((p) => dashLabel(p.time_block!)).sort().join(" · ")}</strong>
                                    <span className="block text-mist">녹화본 · 불라방 링크 · LC 교재는 그 시간 단위 반에 올리면 이 반 학생도 봐요.</span>
                                  </p>
                                )}
                                {pk && pk.parts.length === 0 && pk.parents.length > 0 && (
                                  <p className="mt-2 text-xs text-slate">
                                    묶음 반 <strong className="text-ink">{pk.parents.map((p) => p.time_block).sort().join(" · ")}</strong> 학생도 이 시간을 함께 들어요.
                                  </p>
                                )}
                                {s.course?.program === "sparta" && (
                                  <p className="mt-2 text-xs text-slate">
                                    <span className="mr-1 rounded-full bg-brand-50 px-2 py-0.5 font-black text-brand-700">스파르타반</span>
                                    {includedBySection.get(s.id)?.length
                                      ? <>이 반 학생에게 함께 열리는 반: <strong className="text-ink">{includedBySection.get(s.id)!.join(" · ")}</strong></>
                                      : <span className="text-amber-700">같은 트랙·시간에 함께 들을 반이 아직 없어요. 포함 레벨의 반을 먼저 개설해 주세요.</span>}
                                  </p>
                                )}
                              </div>
                              <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", STATUS_CLASS[s.status] ?? STATUS_CLASS.draft)}>
                                {STATUS_LABEL[s.status] ?? s.status}
                              </span>
                            </div>

                            <dl className="mt-4 text-sm">
                              <div>
                                <dt className="text-xs text-mist">강사</dt>
                                <dd className="font-semibold text-ink">
                                  {instructorLabel(s) ?? "미지정"}
                                  {s.instructor_id === user.id && <span className="ml-1 text-xs text-brand-600">(나)</span>}
                                </dd>
                              </div>
                            </dl>

                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold", hasLive ? "bg-brand-100 text-brand-700" : "bg-line text-slate")}>
                                <Icon name="live" size={14} className={cn(!hasLive && "grayscale opacity-60")} />
                                {hasLive ? "불라방 링크 등록됨" : "불라방 링크 없음"}
                              </span>
                              {s.capacity != null && <span className="rounded-full bg-line px-2 py-0.5 font-semibold text-slate">정원 {s.capacity}명</span>}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 이 달 스터디 시간 설정 (편성과 함께) */}
      {term && <StudyPlanner termId={term.id} termLabel={termLabel} termKey={key} studies={studies} />}

      {/* 새 반 개설 */}
      {term && (
        <section aria-labelledby="create-section-title" className="card p-5 sm:p-7">
          <h2 id="create-section-title" className="text-lg font-black text-ink">
            새 반 개설 <span className="text-sm font-semibold text-slate">— {termLabel}</span>
          </h2>
          {hasSaved ? (
            <>
              {/* 시간표 기준 일괄 개설 — 한 달에 열리는 반이 수십 개라 하나씩 만들지 않는다 */}
              {(courses ?? []).length > 0 && (
                <div className="mb-8">
                  <p className="mt-1 text-sm text-slate">
                    시간표의 시간대와 강좌를 엮어 한 번에 개설합니다. 불라방은 따로 만들지 않고, 반마다 불라방 수강료를 넣으면 같은 반을 불라방으로 들을 수 있어요.
                    {term && <> 지금은 <strong className="text-ink">{term.month}월 · {SEASON_LABEL[season]} 시간표</strong>를 씁니다.</>}
                  </p>
                  <p className="mt-1 text-sm text-slate">
                    <strong className="text-ink">주5일</strong> 칸을 누르면 월수금·화목금이 함께 골라져요. 120분·140분은 <strong className="text-ink">묶음 반</strong>이고 그 아래 ↳ 줄이
                    실제 수업인 60분·70분 반이라, 묶음 반 학생은 안에 든 반을 자동으로 함께 들어요. LC 교재는 LC 를 듣는 시간 단위 반에만 고릅니다.
                  </p>
                  {seasonHasNoSlots && (
                    <div className="mt-3">
                      <Alert kind="warning">
                        {term?.month}월은 <strong>{SEASON_LABEL[season]}</strong>인데 {SEASON_LABEL[season]} 시간대가 아직 등록돼 있지 않아요.
                        평달 시간대로 만들면 반의 시간이 틀리게 박히므로 표에 아무것도 띄우지 않았습니다.
                        그 달 레벨별 실제 시간을 알려 주시면 넣어 드릴게요.
                      </Alert>
                    </div>
                  )}
                  <div className="mt-4">
                    <BulkCreateSections
                      termId={term.id}
                      termLabel={termLabel}
                      courses={courses ?? []}
                      slots={bulkSlots}
                      existingKeys={existingKeys}
                      instructors={instructors ?? null}
                      isAdmin={isAdmin(profile.role)}
                    />
                  </div>
                  <h3 className="mt-8 border-t border-line pt-6 text-base font-black text-ink">하나씩 만들기</h3>
                </div>
              )}
              <p className="mt-1 text-sm text-slate">
                트랙을 “주5일(월수금+화목금)”로 고르면 같은 조건의 반 두 개가 묶음으로 만들어져요. 개강일(
                {formatDate(term.enrollment_opens_at!, { month: "numeric", day: "numeric" })})·종강일(
                {formatDate(term.closes_at!, { month: "numeric", day: "numeric" })})과 수업일은 위 달력에서 가져옵니다.
              </p>
              <div className="mt-5">
                <CreateSectionForm
                  termId={term.id}
                  termLabel={termLabel}
                  courses={courses ?? []}
                  instructors={instructors ?? null}
                  isAdmin={isAdmin(profile.role)}
                />
              </div>
            </>
          ) : (
            <p className="mt-2 rounded-xl bg-brand-50/60 px-4 py-4 text-sm text-slate">
              먼저 위 달력에서 <b className="text-ink">개강일·종강일</b>을 찍고 <b className="text-ink">생성하기</b>를 눌러 주세요. 그 다음에 반을 개설할 수 있어요.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
