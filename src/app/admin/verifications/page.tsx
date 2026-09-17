import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableWrap, Th, Td } from "@/components/admin/Table";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "등업 로그", robots: { index: false } };

const TABS = [
  { value: "pending", label: "검토 대기" },
  { value: "approved", label: "승인" },
  { value: "rejected", label: "반려" },
];

export default async function VerificationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const { status: statusParam } = await searchParams;
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : "pending";
  const supabase = await createClient();

  let query = supabase
    .from("enrollment_verifications")
    .select("id, created_at, result, receipt_no, confidence, matched_section, source, profile:profiles(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  query = status === "pending" ? query.is("result", null) : query.eq("result", status);

  const [{ data: rows }, pending, approved, rejected] = await Promise.all([
    query,
    supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).is("result", null),
    supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).eq("result", "approved"),
    supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).eq("result", "rejected"),
  ]);
  const counts: Record<string, number> = { pending: pending.count ?? 0, approved: approved.count ?? 0, rejected: rejected.count ?? 0 };

  return (
    <>
      <PageHeader icon="verify" title="등업 로그" description="수강증 OCR 결과와 후보 점수를 확인하고, 수동 승인·반려·오배정 정정을 처리합니다." />
      <FilterTabs basePath="/admin/verifications" paramKey="status" current={status} tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} />

      {(rows ?? []).length === 0 ? (
        <EmptyState icon="verify" title="해당 상태의 신청이 없습니다" description="학생이 수강증을 올리면 여기에 표시됩니다." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>신청일</Th>
              <Th>이름</Th>
              <Th>신뢰도</Th>
              <Th>결과</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows ?? []).map((r) => {
              return (
                <tr key={r.id} className="hover:bg-brand-50/40">
                  <Td className="whitespace-nowrap text-xs">{formatDate(r.created_at, { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                  <Td className="whitespace-nowrap font-bold">
                    {r.profile?.name ?? "-"}
                    {/* 수동 등업신청은 학생이 반을 골라 냈다 — 승인 화면에 미리 골라져 있다 */}
                    {r.source === "manual" && (
                      <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[0.65rem] font-black text-brand-700">수동</span>
                    )}
                  </Td>
                  <Td className="tabular-nums">{r.confidence != null ? `${Math.round(Number(r.confidence))}점` : "-"}</Td>
                  <Td><StatusBadge status={r.result ?? "pending"} /></Td>
                  <Td className="text-right">
                    <Link href={`/admin/verifications/${r.id}`} className="btn-secondary !px-3 !py-1.5 text-xs">
                      {r.result ? "상세·정정" : "검토하기"}
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
