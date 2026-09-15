import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatTime, formatWon, TRACK_LABEL, COURSE_TYPE_LABEL, todayKST, cn } from "@/lib/utils";
import { CreateSectionForm } from "@/components/admin/sections/CreateSectionForm";
import { createTerm } from "./actions";

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
    if (m >= 1 && m <= 12) return { y, m };
  }
  const [y, m] = todayKST().split("-").map(Number);
  return { y, m };
}

const termParam = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const nextMonth = (y: number, m: number) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });
const prevMonth = (y: number, m: number) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });

export default async function AdminSectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; created?: string; deleted?: string }>;
}) {
  const { user, profile } = await requireStaff();
  const sp = await searchParams;
  const { y, m } = parseTerm(sp.term);
  const supabase = await createClient();

  const [{ data: terms }, { data: term }, { data: courses }, { data: instructors }] = await Promise.all([
    supabase.from("terms").select("id, year, month").order("year", { ascending: false }).order("month", { ascending: false }).limit(24),
    supabase.from("terms").select("id, year, month").eq("year", y).eq("month", m).maybeSingle(),
    supabase.from("courses").select("id, code, name, course_type, target_score").eq("is_active", true).order("target_score").order("name"),
    isAdmin(profile.role)
      ? supabase.from("profiles").select("id, name, role").in("role", ["instructor", "admin"]).order("name")
      : Promise.resolve({ data: null }),
  ]);

  const { data: sections } = term
    ? await supabase
        .from("class_sections")
        .select(
          "id, bundle_id, track, start_time, end_time, time_block, enrollment_opens_at, closes_at, target_sessions, capacity, tuition, live_tuition, status, instructor_id, course:courses(name, course_type, target_score), instructor:profiles(name), session_dates(count), section_live_links(section_id)",
        )
        .eq("term_id", term.id)
        .order("start_time")
        .order("track")
    : { data: [] as never[] };

  // 주5일 묶음(bundle) 끼리 모아 보여준다
  type Sec = NonNullable<typeof sections>[number];
  const groups = new Map<string, Sec[]>();
  for (const s of sections ?? []) {
    const key = s.bundle_id ?? `single-${s.id}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const nm = nextMonth(y, m);
  const pm = prevMonth(y, m);

  return (
    <div className="space-y-8">
      <PageHeader icon="calendar" title="반 편성" description="매달 반을 개설하고, 캘린더에서 수업일을 확정합니다. 개강일·종강일은 수업일과 별개로 지정해요.">
        <Link href="/admin/replays" className="btn-secondary">
          <Icon name="replay" size={18} />
          다시보기 등록
        </Link>
      </PageHeader>

      {sp.created && (
        <Alert kind="success" title={Number(sp.created) > 1 ? "주5일 묶음 반 2개를 개설했어요" : "반을 개설했어요"}>
          이제 각 반의 상세 페이지에서 수업일을 확정해 주세요.
        </Alert>
      )}
      {sp.deleted && <Alert kind="info" title="반을 삭제했어요" />}

      {/* 기수 선택 */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={`/admin/sections?term=${termParam(pm.y, pm.m)}`} className="btn-ghost !px-3 !py-2" aria-label="이전 달">
              ‹
            </Link>
            <h2 className="text-xl font-black text-ink">
              {y}년 {m}월
            </h2>
            <Link href={`/admin/sections?term=${termParam(nm.y, nm.m)}`} className="btn-ghost !px-3 !py-2" aria-label="다음 달">
              ›
            </Link>
          </div>
          <Link href={`/admin/sections?term=${termParam(nm.y, nm.m)}`} className="chip">
            다음 달 ({nm.m}월) 편성하기
          </Link>
        </div>
        {terms && terms.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {terms.map((t) => {
              const active = t.year === y && t.month === m;
              return (
                <li key={t.id}>
                  <Link
                    href={`/admin/sections?term=${termParam(t.year, t.month)}`}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-bold transition",
                      active ? "border-brand-400 bg-brand-500 text-white" : "border-line bg-paper text-slate hover:border-brand-300",
                    )}
                  >
                    {t.year}.{String(t.month).padStart(2, "0")}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {!term && (
          <form action={createTerm} className="mt-5 flex flex-col gap-3 rounded-xl2 border border-dashed border-brand-200 bg-brand-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <input type="hidden" name="year" value={y} />
            <input type="hidden" name="month" value={m} />
            <p className="text-sm text-slate">
              <span className="font-bold text-ink">{y}년 {m}월</span> 기수가 아직 없어요. 기수를 만들면 반을 개설할 수 있습니다.
            </p>
            <button type="submit" className="btn-primary">
              이 달 기수 만들기
            </button>
          </form>
        )}
      </section>

      {/* 반 목록 */}
      {term && (
        <section aria-labelledby="section-list-title">
          <h2 id="section-list-title" className="mb-3 text-lg font-black text-ink">
            개설 반 <span className="text-slate">({sections?.length ?? 0})</span>
          </h2>
          {(sections?.length ?? 0) === 0 ? (
            <div className="card flex flex-col items-center gap-2 p-8 text-center">
              <Icon name="calendar" size={44} />
              <p className="font-bold text-ink">아직 개설된 반이 없어요</p>
              <p className="text-sm text-slate">아래 “새 반 개설”에서 첫 반을 만들어 주세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[...groups.entries()].map(([key, list]) => {
                const bundled = list.length > 1;
                return (
                  <div key={key} className={cn(bundled && "rounded-xl3 border border-brand-200 bg-brand-50/40 p-3")}>
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
                        const under = count < s.target_sessions;
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
                                <p className="mt-1 text-sm text-slate">
                                  <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">{TRACK_LABEL[s.track] ?? s.track}</span>
                                  <span className="ml-2 font-bold text-brand-600">
                                    {formatTime(s.start_time)}–{formatTime(s.end_time)}
                                  </span>
                                  {s.time_block && <span className="ml-2">{s.time_block}</span>}
                                </p>
                              </div>
                              <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", STATUS_CLASS[s.status] ?? STATUS_CLASS.draft)}>
                                {STATUS_LABEL[s.status] ?? s.status}
                              </span>
                            </div>

                            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              <div>
                                <dt className="text-xs text-mist">개강일 · 종강일</dt>
                                <dd className="font-semibold text-ink">
                                  {formatDate(s.enrollment_opens_at, { month: "numeric", day: "numeric" })} ~ {formatDate(s.closes_at, { month: "numeric", day: "numeric" })}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-mist">수업일</dt>
                                <dd className={cn("font-black", under ? "text-amber-600" : "text-brand-600")}>
                                  {count} / {s.target_sessions}회
                                  {under && <span className="ml-1 text-xs font-semibold">편성 필요</span>}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-mist">수강료 (현장 / 불라방)</dt>
                                <dd className="font-semibold text-ink">
                                  {formatWon(s.tuition)} / {s.live_tuition != null ? formatWon(s.live_tuition) : "미운영"}
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

      {/* 새 반 개설 */}
      {term && (
        <section aria-labelledby="create-section-title" className="card p-5 sm:p-7">
          <h2 id="create-section-title" className="text-lg font-black text-ink">
            새 반 개설 <span className="text-sm font-semibold text-slate">— {y}년 {m}월</span>
          </h2>
          <p className="mt-1 text-sm text-slate">
            트랙을 “주5일(월수금+화목금)”로 고르면 같은 조건의 반 두 개가 묶음으로 만들어져요. 시간대·수강료는 확정된 값을 그대로 입력해 주세요.
          </p>
          <div className="mt-5">
            <CreateSectionForm
              termId={term.id}
              termLabel={`${y}년 ${m}월`}
              courses={courses ?? []}
              instructors={instructors ?? null}
              currentUserId={user.id}
              isAdmin={isAdmin(profile.role)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
