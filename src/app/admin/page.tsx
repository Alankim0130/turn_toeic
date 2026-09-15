import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayKST, formatDate, formatTimeRange, TRACK_LABEL } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { DonutChart } from "@/components/admin/charts/DonutChart";
import { BarChart } from "@/components/admin/charts/BarChart";
import { NaverReservationsWidget } from "@/components/admin/NaverReservationsWidget";
import { countBy, GENDER_LABEL, getCurrentOrUpcomingTerm, getRosterSets, termLabel } from "./_lib/queries";

export const metadata: Metadata = { title: "대시보드", robots: { index: false } };

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const today = todayKST();

  const [roster, alumni, term, textbook, textbookCount, profiles, pendingVer, pendingHomework, newContacts] = await Promise.all([
    getRosterSets(supabase, today),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "alumni"),
    getCurrentOrUpcomingTerm(supabase, today),
    supabase
      .from("textbook_orders")
      .select("id, recipient_name, quantity, created_at, section:class_sections(track, course:courses(name), term:terms(year, month))")
      .eq("status", "requested")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("textbook_orders").select("id", { count: "exact", head: true }).eq("status", "requested"),
    supabase.from("profiles").select("gender, university"),
    supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).is("result", null),
    supabase.from("homework_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);

  // 시간대별 인원수
  type SlotRow = { sectionId: number; course: string; track: string; onsite: number; live: number };
  const slots = new Map<string, SlotRow[]>();
  if (term) {
    const [{ data: counts }, { data: sections }] = await Promise.all([
      supabase.from("section_headcounts").select("section_id, onsite_count, live_count").eq("term_id", term.id),
      supabase
        .from("class_sections")
        .select("id, time_block, start_time, end_time, track, course:courses(name)")
        .eq("term_id", term.id)
        .neq("status", "draft")
        .order("start_time")
        .order("track"),
    ]);
    const countMap = new Map((counts ?? []).map((c) => [c.section_id, c]));
    for (const s of sections ?? []) {
      // 수업 시간이 없는 반(반 편성 달력 이후)은 강좌 이름으로 묶는다
      const label = s.time_block || formatTimeRange(s.start_time, s.end_time) || (s.course?.name ?? "강좌");
      const c = countMap.get(s.id);
      slots.set(label, [
        ...(slots.get(label) ?? []),
        { sectionId: s.id, course: s.course?.name ?? "강좌", track: s.track, onsite: c?.onsite_count ?? 0, live: c?.live_count ?? 0 },
      ]);
    }
  }

  const genderData = countBy(profiles.data ?? [], (p) => (p.gender ? GENDER_LABEL[p.gender] ?? p.gender : "미응답"), "미응답");
  const univData = countBy(profiles.data ?? [], (p) => p.university).slice(0, 5);

  const tiles: { label: string; value: number; href: string; icon: IconName; hint: string }[] = [
    { label: "등록생", value: roster.activeIds.length, href: "/admin/students?tab=active", icon: "students", hint: "개강일~종강일 사이" },
    { label: "예비등록생", value: roster.preliminaryIds.length, href: "/admin/students?tab=preliminary", icon: "verify", hint: "개강 전 등록 완료" },
    { label: "졸업생", value: alumni.count ?? 0, href: "/admin/students?tab=alumni", icon: "rank1", hint: "종강일 경과" },
  ];

  const todo = [
    { label: "등업 검토 대기", value: pendingVer.count ?? 0, href: "/admin/verifications?status=pending", icon: "verify" as IconName },
    { label: "숙제 점검 대기", value: pendingHomework.count ?? 0, href: "/admin/homework?status=submitted", icon: "homework" as IconName },
    { label: "새 문의", value: newContacts.count ?? 0, href: "/admin/contacts?status=new", icon: "contact" as IconName },
  ];

  return (
    <>
      <PageHeader icon="analytics" title="대시보드" description={`${formatDate(today, { year: "numeric", month: "long", day: "numeric", weekday: "short" })} 기준 현황`} />

      {/* 학생명단 요약 */}
      <section aria-labelledby="roster-title" className="mb-6">
        <h2 id="roster-title" className="sr-only">학생명단 요약</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="card group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-pink">
              <div aria-hidden className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-brand-50" />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-slate">{t.label}</p>
                  <p className="mt-1 text-4xl font-black tabular-nums text-brand-600">{t.value.toLocaleString("ko-KR")}<span className="ml-1 text-base text-slate">명</span></p>
                  <p className="mt-1 text-xs text-mist">{t.hint}</p>
                </div>
                <Icon name={t.icon} size={40} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 네이버 예약 */}
        <NaverReservationsWidget />

        {/* 시간대별 인원수 */}
        <section aria-labelledby="slots-title" className="card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="timeslot" size={28} />
              <h2 id="slots-title" className="text-lg font-black text-ink">수업시간대별 인원수</h2>
            </div>
            <p className="text-xs font-semibold text-slate">{term ? `${termLabel(term)} 기수` : "개설된 기수 없음"} · 현장 인원 (불라방 인원)</p>
          </div>
          {slots.size === 0 ? (
            <p className="rounded-xl bg-brand-50/60 px-4 py-8 text-center text-sm text-slate">
              아직 개설된 반이 없습니다.{" "}
              <Link href="/admin/sections" className="font-bold text-brand-600 hover:underline">반 편성으로 이동</Link>
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[...slots.entries()].map(([label, rows]) => {
                const onsite = rows.reduce((s, r) => s + r.onsite, 0);
                const live = rows.reduce((s, r) => s + r.live, 0);
                return (
                  <article key={label} className="rounded-xl2 border border-line bg-surface p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-black text-ink">{label}</h3>
                      <p className="text-sm font-black tabular-nums text-brand-600">
                        현장 {onsite} <span className="text-slate">(불라방 {live})</span>
                      </p>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {rows.map((r) => (
                        <li key={r.sectionId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-ink-soft">
                            {r.course} · {TRACK_LABEL[r.track] ?? r.track}
                          </span>
                          <span className="shrink-0 font-bold tabular-nums text-ink">
                            현장 {r.onsite} <span className="font-semibold text-slate">(불라방 {r.live})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* 교재주문 */}
        <section aria-labelledby="textbook-title" className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="orders" size={28} />
              <h2 id="textbook-title" className="text-lg font-black text-ink">교재주문</h2>
              {(textbookCount.count ?? 0) > 0 && (
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">{textbookCount.count}</span>
              )}
            </div>
            <Link href="/admin/textbook-orders" className="text-sm font-bold text-brand-600 hover:underline">전체 보기</Link>
          </div>
          {(textbook.data ?? []).length === 0 ? (
            <p className="rounded-xl bg-brand-50/60 px-4 py-8 text-center text-sm text-slate">처리할 새 교재 신청이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(textbook.data ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold text-ink">
                      {o.recipient_name} <span className="font-semibold text-slate">· {o.quantity}권</span>
                    </p>
                    <p className="truncate text-xs text-slate">
                      {termLabel(o.section?.term, true)} · {o.section?.course?.name ?? "강좌"} · {o.section?.track ? TRACK_LABEL[o.section.track] : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-mist">{formatDate(o.created_at, { month: "numeric", day: "numeric" })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 처리 대기 */}
        <section aria-labelledby="todo-title" className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Icon name="bolt" size={28} />
            <h2 id="todo-title" className="text-lg font-black text-ink">처리 대기</h2>
          </div>
          <ul className="space-y-2">
            {todo.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50/50">
                  <span className="flex items-center gap-2 text-sm font-bold text-ink">
                    <Icon name={t.icon} size={22} />
                    {t.label}
                  </span>
                  <span className={t.value > 0 ? "rounded-full bg-brand-500 px-2.5 py-0.5 text-sm font-black text-white" : "text-sm font-bold text-mist"}>
                    {t.value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* 마케팅 분석 미니 */}
        <section aria-labelledby="mkt-title" className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="analytics" size={28} />
              <h2 id="mkt-title" className="text-lg font-black text-ink">마케팅 분석</h2>
            </div>
            <Link href="/admin/analytics" className="text-sm font-bold text-brand-600 hover:underline">자세히 보기</Link>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate">가입 회원 성별</h3>
              <DonutChart title="가입 회원 성별" data={genderData} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate">대학 TOP 5</h3>
              <BarChart title="대학 TOP 5" data={univData} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
