import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableWrap, Th, Td } from "@/components/admin/Table";
import { AutoVerifySwitch, RematchHeldButton, type AutoVerifyView } from "@/components/admin/verifications/AutoVerifySwitch";
import { isStaff, requireCrew } from "@/lib/auth";
import { AUTO_VERIFY_KEY } from "@/lib/auto-verify";
import { heldMonth } from "@/lib/verify-decision";

export const metadata: Metadata = { title: "등업 로그", robots: { index: false } };

const TABS = [
  { value: "pending", label: "검토 대기" },
  // 다음 달 수강증을 받아 둔 것 — 그 달 반이 열리면 저절로 다시 맞춘다 (2026-09-22). 지금 할 일이 아니라 검토 대기와 나눈다
  { value: "held", label: "반 개설 대기" },
  { value: "approved", label: "승인" },
  { value: "rejected", label: "반려" },
];

export default async function VerificationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  const { profile } = await requireCrew();
  const { status: statusParam } = await searchParams;
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : "pending";
  const supabase = await createClient();

  let query = supabase
    .from("enrollment_verifications")
    .select("id, created_at, result, confidence, matched_section, source, hold:candidates->hold, profile:profiles(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  query =
    status === "pending"
      ? query.is("result", null).is("candidates->hold", null)
      : status === "held"
        ? query.is("result", null).not("candidates->hold", "is", null)
        : query.eq("result", status);

  const [{ data: rows }, pending, held, approved, rejected, { data: flag, error: flagError }] = await Promise.all([
    query,
    supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).is("result", null).is("candidates->hold", null),
    supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).is("result", null).not("candidates->hold", "is", null),
    supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).eq("result", "approved"),
    supabase.from("enrollment_verifications").select("id", { count: "exact", head: true }).eq("result", "rejected"),
    // 긴급 스위치 (2026-09-22). 조교도 상태는 본다 — 꺼져 있으면 모든 수강증이 여기로 쌓이는 까닭이다
    supabase.from("feature_flags").select("enabled, note, updated_at, updater:profiles!feature_flags_updated_by_fkey(name)").eq("key", AUTO_VERIFY_KEY).maybeSingle(),
  ]);
  const counts: Record<string, number> = { pending: pending.count ?? 0, held: held.count ?? 0, approved: approved.count ?? 0, rejected: rejected.count ?? 0 };
  // 서버(`readAutoVerify`)와 같은 규칙 — 읽지 못하면 멈춘 것이다.
  // 테스트 등급을 켠 스태프는 RLS 가 학생으로 보아 스위치를 못 읽는다 — 멈춘 것처럼 보이지 않게 따로 말한다
  const switchView: AutoVerifyView = profile.test_role
    ? { kind: "testing" }
    : flagError || !flag
      ? { kind: "unreadable" }
      : flag.enabled
        ? { kind: "on" }
        : {
            kind: "off",
            note: flag.note,
            changed: `${flag.updater?.name ? `${flag.updater.name} · ` : ""}${formatDate(flag.updated_at, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 멈춤`,
          };

  return (
    <>
      <PageHeader icon="verify" title="등업 로그" description="수강증 OCR 결과와 후보 점수를 확인하고, 수동 승인·반려·오배정 정정을 처리합니다." />
      <AutoVerifySwitch view={switchView} canEdit={isStaff(profile.role)} />
      <FilterTabs basePath="/admin/verifications" paramKey="status" current={status} tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} />
      {status === "held" && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl2 border border-line bg-paper p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate">
            <b className="text-ink">다음 달 수강증을 받아 둔 목록이에요.</b> 강사님이 그 달 반을 열면 수강증에 맞는 반으로 저절로 맞춰
            예비등록생으로 배정해요 (안 맞으면 검토 대기로 옮겨요). 반을 열었는데 여기 남아 있다면 눌러 주세요.
          </p>
          <RematchHeldButton />
        </div>
      )}

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
                    {r.result === null && heldMonth(r.hold) != null && (
                      <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[0.65rem] font-black text-slate">{heldMonth(r.hold)}월 반 개설 대기</span>
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
