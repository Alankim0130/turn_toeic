import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayKST, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableWrap, Th, Td } from "@/components/admin/Table";
import { getRosterSets, sectionSummary } from "../_lib/queries";
import { ROLE_LABEL } from "@/lib/auth";

export const metadata: Metadata = { title: "학생명단", robots: { index: false } };

const TABS = [
  { value: "active", label: "등록생" },
  { value: "preliminary", label: "예비등록생" },
  { value: "alumni", label: "졸업생" },
  // 강사·관리자 계정 — 테스트 등급을 켜서 학생 화면을 확인한다 (2026-09-16 Alan 요청)
  { value: "testers", label: "테스터" },
  // 등급을 바꾸려면 아직 등록이 없는 사람(가입만 한 회원·강사)도 찾을 수 있어야 한다
  { value: "all", label: "전체" },
];
const STAFF_ROLES = ["instructor", "admin"] as const;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab: tabParam, q: qParam } = await searchParams;
  const tab = TABS.some((t) => t.value === tabParam) ? (tabParam as string) : "active";
  const q = (qParam ?? "").trim();

  const supabase = await createClient();
  const today = todayKST();
  const roster = await getRosterSets(supabase, today);

  // 대상 프로필
  let profileQuery = supabase.from("profiles").select("id, name, phone, role, test_role, university, created_at").order("name").limit(300);
  if (tab === "alumni") profileQuery = profileQuery.eq("role", "alumni");
  else if (tab === "testers") profileQuery = profileQuery.in("role", [...STAFF_ROLES]);
  else if (tab === "all") {
    // 걸러내지 않는다 — 이름 검색으로 좁힌다
  } else {
    const ids = tab === "active" ? roster.activeIds : roster.preliminaryIds;
    if (ids.length === 0) profileQuery = profileQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
    else profileQuery = profileQuery.in("id", ids);
  }
  if (q) profileQuery = profileQuery.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  const { data: profiles } = await profileQuery;
  const ids = (profiles ?? []).map((p) => p.id);

  const [{ data: enrollments }, { data: expiredOrders }, { count: testerCount }] = await Promise.all([
    ids.length
      ? supabase
          .from("enrollments")
          .select("id, student_id, mode, status, section:class_sections!enrollments_section_id_fkey(track, start_time, time_block, closes_at, term:terms(year, month), course:courses(name))")
          .in("student_id", ids)
          .order("id")
      : Promise.resolve({ data: [] as never[] }),
    tab === "alumni" && ids.length
      ? supabase.from("enrollment_orders").select("user_id, access_until").in("user_id", ids).order("access_until", { ascending: false })
      : Promise.resolve({ data: [] as { user_id: string; access_until: string }[] }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", [...STAFF_ROLES]),
  ]);

  const enrollByUser = new Map<string, NonNullable<typeof enrollments>>();
  for (const e of enrollments ?? []) enrollByUser.set(e.student_id, [...(enrollByUser.get(e.student_id) ?? []), e]);
  const lastAccess = new Map<string, string>();
  for (const o of expiredOrders ?? []) if (!lastAccess.has(o.user_id)) lastAccess.set(o.user_id, o.access_until);

  const counts = { active: roster.activeIds.length, preliminary: roster.preliminaryIds.length };

  return (
    <>
      <PageHeader icon="students" title="학생명단" description="등록생은 개강일~종강일 사이, 예비등록생은 개강 전 등록 완료, 졸업생은 종강일 경과 기준입니다. 이름을 누르면 등급·반 배정을 바꿉니다.">
        <form method="get" className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="이름 검색" className="input !w-40 !py-2 sm:!w-52" aria-label="이름 검색" />
          <button type="submit" className="btn-secondary !py-2">검색</button>
        </form>
      </PageHeader>

      <FilterTabs
        basePath="/admin/students"
        paramKey="tab"
        current={tab}
        keep={{ q }}
        tabs={TABS.map((t) => ({
          ...t,
          count: t.value === "active" ? counts.active : t.value === "preliminary" ? counts.preliminary : t.value === "testers" ? (testerCount ?? undefined) : undefined,
        }))}
      />
      {tab === "testers" && (
        <p className="mb-4 rounded-xl2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          강사·관리자 계정이에요. 이름을 눌러 <b>테스트 등급</b>(회원 · 수강생 · 졸업생)을 켜고 반을 배정하면, 진짜 등급은 그대로 둔 채 학생이 보는 화면을 확인할 수 있어요.
          테스터는 등록생 · 예비등록생 수에 세지 않습니다.
        </p>
      )}

      {(profiles ?? []).length === 0 ? (
        <EmptyState icon="students" title={q ? `“${q}” 검색 결과가 없습니다` : "해당하는 학생이 없습니다"} description={tab === "active" ? "수강증 승인 후 개강일이 지나면 등록생으로 표시됩니다." : undefined} />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>이름</Th>
              <Th>연락처</Th>
              <Th>등급</Th>
              <Th>반 배정</Th>
              <Th>{tab === "preliminary" ? "개강일" : tab === "active" ? "시청 만료일" : "마지막 만료일"}</Th>
              <Th>대학</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(profiles ?? []).map((p) => {
              const orders = roster.ordersByUser.get(p.id) ?? [];
              const prelimOrder = orders.filter((o) => o.status === "preliminary").sort((a, b) => a.activates_on.localeCompare(b.activates_on))[0];
              const activeOrder = orders.filter((o) => o.status === "active").sort((a, b) => b.access_until.localeCompare(a.access_until))[0];
              const myEnroll = enrollByUser.get(p.id) ?? [];
              return (
                <tr key={p.id} className="hover:bg-brand-50/40">
                  <Td className="whitespace-nowrap font-bold">
                    <Link href={`/admin/students/${p.id}`} className="text-brand-600 hover:underline">
                      {p.name || "이름 없음"}
                    </Link>
                    {(p.role === "instructor" || p.role === "admin") && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">테스터</span>
                    )}
                    {p.test_role && (
                      <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">{ROLE_LABEL[p.test_role]} 테스트 중</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">{p.phone ? <a href={`tel:${p.phone}`} className="text-brand-600 hover:underline">{p.phone}</a> : "-"}</Td>
                  <Td><StatusBadge status={p.role} /></Td>
                  <Td>
                    {myEnroll.length === 0 ? (
                      <span className="text-mist">-</span>
                    ) : (
                      <ul className="space-y-1">
                        {myEnroll.map((e) => (
                          <li key={e.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span>{sectionSummary(e.section, e.mode)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {tab === "preliminary" && prelimOrder && (
                      <>
                        <span className="chip mb-1">{Number(prelimOrder.activates_on.slice(5, 7))}월 예비등록생</span>
                        <br />
                        {formatDate(prelimOrder.activates_on, { month: "long", day: "numeric" })} 개강
                      </>
                    )}
                    {tab === "active" && activeOrder && formatDate(activeOrder.access_until, { year: "numeric", month: "long", day: "numeric" })}
                    {tab === "alumni" && (lastAccess.get(p.id) ? formatDate(lastAccess.get(p.id)!, { year: "numeric", month: "long", day: "numeric" }) : "-")}
                  </Td>
                  <Td className="text-xs text-slate">{p.university || "-"}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
