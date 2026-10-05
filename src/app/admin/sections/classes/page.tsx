import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { TRACK_LABEL, cn, formatDate } from "@/lib/utils";
import { isTwoWeek } from "@/lib/two-week";
import { dashLabel } from "@/lib/time-blocks";
import { SectionsTabs } from "@/components/admin/sections/SectionsTabs";
import { loadTermData, parseTerm } from "../_lib/term-data";

export const metadata: Metadata = { title: "개설 반", robots: { index: false } };

const STATUS_LABEL: Record<string, string> = { draft: "준비 중", open: "모집 중", closed: "종료" };
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-slate/10 text-slate",
  open: "bg-brand-100 text-brand-700",
  closed: "bg-ink/10 text-ink-soft",
};

/**
 * 그 달 개설 반 목록 (2026-10-02 반 편성 화면에서 떼어 냄). 카드를 누르면 반 상세.
 * 반을 만들거나 지우면 여기로 돌아온다 (`?created=` · `?deleted=`).
 */
export default async function AdminSectionClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; created?: string; deleted?: string }>;
}) {
  const { user } = await requireStaff();
  const sp = await searchParams;
  const { y, m } = parseTerm(sp.term);
  const supabase = await createClient();
  const data = await loadTermData(supabase, y, m, { instructors: true, includes: true });
  const { term, key, termLabel, sections, groups, packages, minutesOf, includedBySection, typeLabelOf, instructorLabel } = data;

  // 회차별 불라방 링크 수 (2026-09-18) — 카드의 "불라방 링크" 칩
  const { data: sessionLinkRows } = sections.length
    ? await supabase.from("session_dates").select("section_id, session_live_links(promoted_at)").in("section_id", sections.map((s) => s.id))
    : { data: [] as { section_id: number; session_live_links: unknown }[] };
  const sessionLinkCount = new Map<number, number>();
  for (const r of sessionLinkRows ?? []) {
    const has = Array.isArray(r.session_live_links) ? r.session_live_links.length > 0 : !!r.session_live_links;
    if (has) sessionLinkCount.set(r.section_id, (sessionLinkCount.get(r.section_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader icon="students" title="개설 반" description="이 달에 열린 반이에요. 카드를 누르면 수업일 · 불라방 링크 · 정원 · 상태를 고칠 수 있어요.">
        <Link href={`/admin/sections/new?term=${key}`} className="btn-primary">
          <Icon name="timeslot" size={18} className="brightness-0 invert" />
          새 반 개설
        </Link>
      </PageHeader>

      <SectionsTabs current="classes" year={y} month={m} counts={{ classes: sections.length }} />

      {sp.created && (
        <Alert kind="success" title={Number(sp.created) > 1 ? "주5일 묶음 반 2개를 개설했어요" : "반을 개설했어요"}>
          수업일·개강일·종강일은 {termLabel} 달력에서 자동으로 채워졌어요.
        </Alert>
      )}
      {sp.deleted && <Alert kind="info" title="반을 삭제했어요" />}

      {!term ? (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <Icon name="calendar" size={44} />
          <p className="font-bold text-ink">{termLabel} 일정이 아직 없어요</p>
          <p className="text-sm text-slate">
            <Link href={`/admin/sections?term=${key}`} className="font-bold text-brand-600 underline">달력</Link>에서 개강일·종강일을 찍고 생성하기를 누르면 반을 개설할 수 있어요.
          </p>
        </div>
      ) : sections.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <Icon name="students" size={44} />
          <p className="font-bold text-ink">아직 개설된 반이 없어요</p>
          <p className="text-sm text-slate">
            <Link href={`/admin/sections/new?term=${key}`} className="font-bold text-brand-600 underline">새 반 개설</Link>에서 강좌와 트랙을 고르면 달력의 수업일로 반이 만들어져요.
          </p>
        </div>
      ) : (
        <section aria-labelledby="section-list-title">
          <h2 id="section-list-title" className="mb-3 text-lg font-black text-ink">
            {termLabel} 개설 반 <span className="text-slate">({sections.length})</span>
          </h2>
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
                      const linkCount = sessionLinkCount.get(s.id) ?? 0;
                      const hasLive = !!s.section_live_links || linkCount > 0;
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
                                {typeLabelOf(s) && <span className="ml-2 text-sm font-semibold text-slate">{typeLabelOf(s)}</span>}
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
                                {s.book_set && <span className="ml-2 text-xs font-bold text-slate">{s.book_set} 과정</span>}
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
                              {isTwoWeek(s.course?.program) && (
                                <p className="mt-2 text-xs text-slate">
                                  <span className="mr-1 rounded-full bg-brand-50 px-2 py-0.5 font-black text-brand-700">2주완성</span>
                                  개강일부터 앞 절반만 ·{" "}
                                  <strong className="text-ink">{formatDate(s.closes_at, { month: "numeric", day: "numeric", weekday: "short" })} 종강</strong>
                                  {includedBySection.get(s.id)?.length ? (
                                    <> · 함께 열리는 반: <strong className="text-ink">{includedBySection.get(s.id)!.join(" · ")}</strong></>
                                  ) : (
                                    <span className="text-amber-700"> · 같은 트랙의 {s.course?.target_score} 시간 단위 반을 먼저 개설해 주세요.</span>
                                  )}
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
                              {linkCount > 0 ? `회차 불라방 링크 ${linkCount}개` : hasLive ? "상시 불라방 링크" : "불라방 링크 없음"}
                            </span>
                            {s.live_to_replay ? (
                              <span className="rounded-full bg-brand-50 px-2 py-0.5 font-bold text-brand-700" title="수업이 끝나면 그 회차 불라방 링크가 다시보기로 자동 연결돼요">라이브 → 다시보기</span>
                            ) : (
                              <span className="rounded-full bg-line px-2 py-0.5 font-semibold text-slate" title="이 반의 불라방은 다시보기와 연결하지 않아요">라이브만</span>
                            )}
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
        </section>
      )}
    </div>
  );
}
