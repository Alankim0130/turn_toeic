import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn, todayKST, formatDate, formatTimeRange } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { DonutChart } from "@/components/admin/charts/DonutChart";
import { BarChart } from "@/components/admin/charts/BarChart";
import { NaverReservationsWidget } from "@/components/admin/NaverReservationsWidget";
import { slotLabel } from "@/lib/naver-booking";
import { countBy, GENDER_LABEL, getCurrentOrUpcomingTerm, getRosterSets, termLabel } from "./_lib/queries";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "대시보드", robots: { index: false } };

/** 시간대 라벨 앞의 HH:MM 으로 정렬한다. 시간이 없는 반은 맨 뒤 */
const slotKey = (label: string) => {
  const m = label.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60 + 1;
};
/** 좁은 화면용 짧은 시간대 이름: "10:00~12:10" → "10:00" */
const slotShort = (label: string) => label.match(/\d{1,2}:\d{2}/)?.[0] ?? label;

export default async function AdminDashboardPage() {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const supabase = await createClient();
  const today = todayKST();

  const [roster, alumni, term, textbook, textbookCount, profiles, pendingVer, pendingHomework, newContacts, naver] = await Promise.all([
    getRosterSets(supabase, today),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "alumni"),
    getCurrentOrUpcomingTerm(supabase, today),
    supabase
      .from("textbook_orders")
      .select("id, recipient_name, quantity, items, total_amount, created_at, section:class_sections(track, course:courses(name), term:terms(year, month))")
      .eq("status", "requested")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("textbook_orders").select("id", { count: "exact", head: true }).eq("status", "requested"),
    supabase.from("profiles").select("gender, university"),
    supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).is("result", null),
    supabase.from("homework_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new"),
    // 네이버 예약은 10분마다 예약 페이지를 확인한 칸 기록에서 읽는다 (2026-09-21 — 첫토익과 같은 방식)
    supabase
      .from("naver_booking_slots")
      .select("slot_at, booking_count")
      .gt("booking_count", 0)
      .gte("slot_at", new Date().toISOString())
      .order("slot_at", { ascending: true })
      .limit(200),
  ]);

  /* 수업시간대별 인원수 — 강좌(행) × 시간대(열) 표 */
  const cells = new Map<string, { onsite: number; live: number }>(); // `${강좌}|${시간대}`
  const slotLabels = new Set<string>();
  const courseNames = new Set<string>();
  const courseScore = new Map<string, number>();
  let rolledUp = false;
  if (term) {
    const [{ data: counts }, { data: sections }, { data: includeRows }] = await Promise.all([
      supabase.from("section_headcounts").select("section_id, onsite_count, live_count").eq("term_id", term.id),
      supabase
        .from("class_sections")
        .select("id, time_block, start_time, end_time, course:courses(name, target_score)")
        .eq("term_id", term.id)
        .neq("status", "draft"),
      // 묶음 반(120분·140분) · 스파르타반 → 그 학생이 실제로 앉아 있는 시간 단위 반
      supabase.rpc("term_section_includes", { p_term_id: term.id }),
    ]);
    const countMap = new Map((counts ?? []).map((c) => [c.section_id, c]));
    // 시간 단위 반마다 "그 시간에 교실에 있는" 인원 = 직접 배정 + 이 반을 품는 묶음 반·스파르타 반의 배정.
    // 묶음 반은 열을 따로 두지 않는다 — 10:00 교실 인원이 60분 열과 120분 열로 갈라지면 셀 수 없다
    const parentsOf = new Map<number, number[]>();
    const packageIds = new Set<number>();
    for (const r of includeRows ?? []) {
      packageIds.add(r.section_id);
      parentsOf.set(r.included_id, [...(parentsOf.get(r.included_id) ?? []), r.section_id]);
    }
    rolledUp = packageIds.size > 0;
    for (const s of sections ?? []) {
      if (packageIds.has(s.id)) continue;
      // 반 편성 달력은 시간을 받지 않으므로 시간이 없는 반이 있다 — 강좌 이름으로 묶고 "시간 미정" 칸에 넣는다
      const slot = s.time_block || formatTimeRange(s.start_time, s.end_time) || "시간 미정";
      const course = s.course?.name ?? "강좌";
      slotLabels.add(slot);
      courseNames.add(course);
      if (typeof s.course?.target_score === "number") courseScore.set(course, s.course.target_score);
      let onsite = countMap.get(s.id)?.onsite_count ?? 0;
      let live = countMap.get(s.id)?.live_count ?? 0;
      for (const p of parentsOf.get(s.id) ?? []) {
        onsite += countMap.get(p)?.onsite_count ?? 0;
        live += countMap.get(p)?.live_count ?? 0;
      }
      const prev = cells.get(`${course}|${slot}`) ?? { onsite: 0, live: 0 };
      cells.set(`${course}|${slot}`, { onsite: prev.onsite + onsite, live: prev.live + live });
    }
  }
  const slots = [...slotLabels].sort((a, b) => slotKey(a) - slotKey(b) || a.localeCompare(b, "ko"));
  const courses = [...courseNames].sort((a, b) => (courseScore.get(a) ?? 0) - (courseScore.get(b) ?? 0) || a.localeCompare(b, "ko"));
  const slotTotal = (slot: string) =>
    courses.reduce(
      (acc, c) => {
        const v = cells.get(`${c}|${slot}`);
        return { onsite: acc.onsite + (v?.onsite ?? 0), live: acc.live + (v?.live ?? 0) };
      },
      { onsite: 0, live: 0 },
    );

  const genderData = countBy(profiles.data ?? [], (p) => (p.gender ? GENDER_LABEL[p.gender] ?? p.gender : "미응답"), "미응답");
  const univData = countBy(profiles.data ?? [], (p) => p.university).slice(0, 5);

  const naverNext = naver.data?.[0];
  const naverCount = (naver.data ?? []).reduce((n, s) => n + s.booking_count, 0);

  const todo: { label: string; value: number; href: string; icon: IconName; zero: string; some: string }[] = [
    { label: "등업 검토", value: pendingVer.count ?? 0, href: "/admin/verifications?status=pending", icon: "verify", zero: "검토할 수강증이 없어요", some: "검토를 기다리는 수강증" },
    { label: "숙제 점검", value: pendingHomework.count ?? 0, href: "/admin/homework?status=submitted", icon: "homework", zero: "점검할 제출물이 없어요", some: "점검을 기다리는 제출물" },
    { label: "교재주문", value: textbookCount.count ?? 0, href: "/admin/textbook-orders", icon: "orders", zero: "처리할 주문이 없어요", some: "배송을 기다리는 주문" },
    { label: "새 문의", value: newContacts.count ?? 0, href: "/admin/contacts?status=new", icon: "contact", zero: "새로 온 문의가 없어요", some: "답변을 기다리는 문의" },
  ];

  const stats: { label: string; value: number; unit: string; href: string; icon: IconName; hint: string }[] = [
    { label: "등록생", value: roster.activeIds.length, unit: "명", href: "/admin/students?tab=active", icon: "students", hint: "개강일~종강일 사이" },
    { label: "예비등록생", value: roster.preliminaryIds.length, unit: "명", href: "/admin/students?tab=preliminary", icon: "verify", hint: "개강 전 등록 완료" },
    { label: "졸업생", value: alumni.count ?? 0, unit: "명", href: "/admin/students?tab=alumni", icon: "rank1", hint: "종강일 경과" },
    {
      label: "네이버 예약",
      value: naverCount,
      unit: "건",
      href: "#naver-reservations",
      icon: "calendar",
      hint: naverNext ? `가장 이른 예약 ${slotLabel(naverNext.slot_at)}` : "잡힌 예약 없음",
    },
  ];

  return (
    <>
      <PageHeader icon="analytics" title="대시보드" description={`${formatDate(today, { year: "numeric", month: "long", day: "numeric", weekday: "short" })} 기준 현황`} />

      {/* 처리 대기 — 손이 가야 하는 것부터 */}
      <section aria-labelledby="todo-title" className="mb-8">
        <h2 id="todo-title" className="mb-3 text-sm font-black text-slate">처리 대기</h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {todo.map((t) => {
            const on = t.value > 0;
            return (
              <li key={t.label}>
                <Link
                  href={t.href}
                  className={cn(
                    "card flex h-full items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-pink",
                    on && "border-brand-200 bg-gradient-to-br from-brand-50 via-paper to-paper",
                  )}
                >
                  <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl2", on ? "bg-brand-500 shadow-pink" : "bg-surface")}>
                    <Icon name={t.icon} size={24} className={cn(on && "brightness-0 invert")} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-ink">{t.label}</span>
                    <span className="block truncate text-xs text-mist">{on ? t.some : t.zero}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-0.5">
                    <span className={cn("text-2xl font-black tabular-nums", on ? "text-brand-600" : "text-mist")}>{t.value}</span>
                    <span className="text-xs font-bold text-slate">건</span>
                    <span aria-hidden className="ml-1 text-lg font-black text-line">›</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 오늘 현황 */}
      <section aria-labelledby="stats-title" className="mb-8">
        <h2 id="stats-title" className="mb-3 text-sm font-black text-slate">오늘 현황</h2>
        <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.map((s) => (
            <li key={s.label}>
              <Link href={s.href} className="card flex h-full flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-pink">
                <span className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <span className="min-w-0 truncate text-sm font-bold text-slate">{s.label}</span>
                </span>
                <span className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-black tabular-nums text-ink">{s.value.toLocaleString("ko-KR")}</span>
                  <span className="text-sm font-bold text-slate">{s.unit}</span>
                </span>
                <span className="mt-1 truncate text-xs text-mist">{s.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 수업시간대별 인원수 */}
      <section aria-labelledby="slots-title" className="card mb-8 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50">
              <Icon name="timeslot" size={20} />
            </span>
            <h2 id="slots-title" className="text-lg font-black text-ink">수업시간대별 인원수</h2>
          </div>
          <Link href="/admin/sections" className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-ink-soft ring-1 ring-line transition hover:text-brand-600">
            {term ? `${termLabel(term)} 기수` : "기수 없음"} ›
          </Link>
        </div>

        {slots.length === 0 ? (
          <p className="rounded-xl bg-brand-50/60 px-4 py-8 text-center text-sm text-slate">
            아직 개설된 반이 없습니다.{" "}
            <Link href="/admin/sections" className="font-bold text-brand-600 hover:underline">반 편성으로 이동</Link>
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-max border-collapse text-sm">
              <caption className="caption-bottom pt-3 text-left text-xs text-mist">
                현장 인원, 괄호 안은 불라방 인원 (명)
                {rolledUp && " · 묶음 반(120분·140분)과 스파르타반 학생은 그 시간에 듣는 시간 단위 반마다 세었어요"}
              </caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-4 text-left text-xs font-bold text-slate">강좌</th>
                  {slots.map((s) => (
                    <th key={s} scope="col" className="px-3 py-2 text-right text-xs font-bold text-slate">
                      <span className="sm:hidden">{slotShort(s)}</span>
                      <span className="hidden sm:inline">{s}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c} className="border-b border-line/70">
                    <th scope="row" className="py-2.5 pr-4 text-left font-bold text-ink">{c}</th>
                    {slots.map((s) => {
                      const v = cells.get(`${c}|${s}`);
                      return (
                        <td key={s} className="px-3 py-2.5 text-right tabular-nums">
                          {!v ? (
                            <span className="text-line">–</span>
                          ) : (
                            <>
                              <span className="font-black text-ink">{v.onsite}</span>
                              {v.live > 0 && <span className="ml-1 text-xs font-semibold text-slate">({v.live})</span>}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-2.5 pr-4 text-left text-xs font-black text-slate">합계</th>
                  {slots.map((s) => {
                    const t = slotTotal(s);
                    return (
                      <td key={s} className="px-3 py-2.5 text-right tabular-nums">
                        <span className="font-black text-brand-600">{t.onsite}</span>
                        {t.live > 0 && <span className="ml-1 text-xs font-semibold text-slate">({t.live})</span>}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* 네이버 예약 */}
        <NaverReservationsWidget />

        {/* 교재주문 */}
        <section aria-labelledby="textbook-title" className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <Icon name="orders" size={20} />
              </span>
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
                      {o.recipient_name}{" "}
                      <span className="font-semibold text-slate">
                        · {Array.isArray(o.items) && o.items.length > 0 ? `교재 ${o.items.length}권` : `${o.quantity}권`}
                        {o.total_amount > 0 ? ` · ${o.total_amount.toLocaleString("ko-KR")}원` : ""}
                      </span>
                    </p>
                    <p className="truncate text-xs text-slate">
                      {termLabel(o.section?.term, true)} · {o.section?.course?.name ?? "강좌"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-mist">{formatDate(o.created_at, { month: "numeric", day: "numeric" })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 마케팅 분석 미니 */}
        <section aria-labelledby="mkt-title" className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <Icon name="analytics" size={20} />
              </span>
              <h2 id="mkt-title" className="text-lg font-black text-ink">마케팅 분석</h2>
            </div>
            <Link href="/admin/analytics" className="text-sm font-bold text-brand-600 hover:underline">자세히 보기</Link>
          </div>
          <div className="space-y-6">
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
