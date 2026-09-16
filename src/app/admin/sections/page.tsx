import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatWon, TRACK_LABEL, COURSE_TYPE_LABEL, todayKST, cn } from "@/lib/utils";
import { CreateSectionForm } from "@/components/admin/sections/CreateSectionForm";
import { BulkCreateSections, type BulkSlot } from "@/components/admin/sections/BulkCreateSections";
import { sectionKeyOf, timeBlockOf } from "@/components/admin/sections/bulk";
import { TermCalendar, type TermSchedule, type OtherTermDate } from "@/components/admin/sections/TermCalendar";
import { shiftMonth, termKey, ymd, daysInMonth } from "@/components/admin/sections/dates";
import { StudyPlanner, type PlannerStudy } from "@/components/admin/studies/StudyPlanner";

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
    supabase.from("courses").select("id, code, name, course_type, target_score").eq("is_active", true).order("target_score").order("name"),
    isAdmin(profile.role)
      ? supabase.from("profiles").select("id, name, role").in("role", ["instructor", "admin"]).order("name")
      : Promise.resolve({ data: null }),
    supabase.from("timetable_slots").select("id, level, start_time, end_time").order("level").order("start_time"),
  ]);

  const [{ data: classDates }, { data: lectureRows, error: lectureError }, { data: sections }, { data: studyRows }] = term
    ? await Promise.all([
        supabase.from("term_class_dates").select("date, track").eq("term_id", term.id).order("date"),
        supabase.from("special_lectures").select("id, date, lecturer_id, content, kinds, signup, capacity, signup_opens_at, applied_count").eq("term_id", term.id).order("date").order("id"),
        supabase
          .from("class_sections")
          .select(
            "id, bundle_id, track, time_block, course_id, capacity, tuition, live_tuition, status, instructor_id, course:courses(name, course_type, target_score), instructor:profiles(name), session_dates(count), section_live_links(section_id)",
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

  // 시간표 기준 일괄 개설용: 레벨별 시간대와 이미 만들어진 (강좌·트랙·시간대) 조합
  const bulkSlots: BulkSlot[] = (timetable ?? [])
    .map((s) => ({ id: s.id, level: s.level, label: timeBlockOf(s.start_time, s.end_time) ?? "" }))
    .filter((s) => s.label);
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

  // 주5일 묶음(bundle) 끼리 모아 보여준다
  type Sec = NonNullable<typeof sections>[number];
  const groups = new Map<string, Sec[]>();
  for (const s of sections ?? []) {
    const k = s.bundle_id ?? `single-${s.id}`;
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
                return (
                  <div key={k} className={cn(bundled && "rounded-xl3 border border-brand-200 bg-brand-50/40 p-3")}>
                    {bundled && (
                      <p className="mb-2 flex items-center gap-2 px-1 text-xs font-black text-brand-700">
                        <Icon name="bolt" size={16} />
                        주5일 묶음 — 월수금 + 화목금
                      </p>
                    )}
                    <div className={cn("grid gap-3", bundled && "sm:grid-cols-2")}>
                      {list.map((s) => {
                        const count = s.session_dates?.[0]?.count ?? 0;
                        const hasLive = !!s.section_live_links;
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
                                  {s.time_block && <span className="ml-2 font-bold tabular-nums text-ink-soft">{s.time_block}</span>}
                                  <span className={cn("ml-2 font-black", count > 0 ? "text-brand-600" : "text-amber-600")}>
                                    수업일 {count}회{count === 0 && " — 달력에 이 트랙 날짜가 없어요"}
                                  </span>
                                </p>
                              </div>
                              <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", STATUS_CLASS[s.status] ?? STATUS_CLASS.draft)}>
                                {STATUS_LABEL[s.status] ?? s.status}
                              </span>
                            </div>

                            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              <div>
                                <dt className="text-xs text-mist">수강료 (현장 / 불라방)</dt>
                                <dd className="font-semibold text-ink">
                                  {s.tuition != null ? formatWon(s.tuition) : "미입력"} / {s.live_tuition != null ? formatWon(s.live_tuition) : "미운영"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-mist">강사</dt>
                                <dd className="font-semibold text-ink">
                                  {s.instructor?.name ?? "미지정"}
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
                  </p>
                  <div className="mt-4">
                    <BulkCreateSections
                      termId={term.id}
                      termLabel={termLabel}
                      courses={courses ?? []}
                      slots={bulkSlots}
                      existingKeys={existingKeys}
                      instructors={instructors ?? null}
                      currentUserId={user.id}
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
                  currentUserId={user.id}
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
