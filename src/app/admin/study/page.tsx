import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { updateStudyStatus } from "./actions";

export const metadata: Metadata = { title: "스터디 신청", robots: { index: false } };

const TABS = [
  { value: "pending", label: "대기" },
  { value: "contacted", label: "연락함" },
  { value: "confirmed", label: "확정" },
  { value: "closed", label: "종료" },
  { value: "all", label: "전체" },
];

export default async function StudyAdminPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  const { status: statusParam, ok, error } = await searchParams;
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : "pending";
  const supabase = await createClient();

  let query = supabase.from("study_applications").select("*, profile:profiles(name)").order("created_at", { ascending: false }).limit(300);
  if (status !== "all") query = query.eq("status", status);

  const [{ data: rows }, ...countRes] = await Promise.all([
    query,
    ...["pending", "contacted", "confirmed", "closed"].map((s) => supabase.from("study_applications").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);
  const counts: Record<string, number | undefined> = {
    pending: countRes[0].count ?? 0,
    contacted: countRes[1].count ?? 0,
    confirmed: countRes[2].count ?? 0,
    closed: countRes[3].count ?? 0,
  };
  const back = `/admin/study?status=${status}`;

  return (
    <>
      <PageHeader icon="study" title="스터디 신청" description="신청자에게 연락한 뒤 상태를 바꿔 주세요. 회원이 아닌 신청도 들어옵니다." />
      {ok && <Alert kind="success" className="mb-4">신청 #{ok} 상태를 저장했습니다.</Alert>}
      {error && <Alert kind="warning" className="mb-4">저장에 실패했습니다. 다시 시도해 주세요.</Alert>}
      <FilterTabs basePath="/admin/study" paramKey="status" current={status} tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} />

      {(rows ?? []).length === 0 ? (
        <EmptyState icon="study" title="해당 상태의 스터디 신청이 없습니다" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-ink">
                    {r.name}
                    {r.profile?.name && r.profile.name !== r.name && <span className="ml-1 text-xs font-semibold text-mist">(회원명 {r.profile.name})</span>}
                    {!r.user_id && <span className="ml-1 text-xs font-semibold text-mist">(비회원)</span>}
                  </p>
                  <a href={`tel:${r.phone}`} className="text-sm font-bold text-brand-600 hover:underline">{r.phone}</a>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                <dt className="text-slate">목표 점수</dt><dd className="font-semibold">{r.target_score ? `${r.target_score}점` : "-"}</dd>
                <dt className="text-slate">가능 시간</dt><dd>{r.preferred_time || "-"}</dd>
                <dt className="text-slate">신청일</dt><dd>{formatDate(r.created_at, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</dd>
              </dl>
              {r.message && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm text-ink-soft">{r.message}</p>}
              <form action={updateStudyStatus} className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value={back} />
                <Icon name="bolt" size={18} />
                <select name="status" defaultValue={r.status} className="input !w-auto !py-1.5 text-xs" aria-label="상태">
                  <option value="pending">대기</option>
                  <option value="contacted">연락함</option>
                  <option value="confirmed">확정</option>
                  <option value="closed">종료</option>
                </select>
                <button type="submit" className="btn-secondary !py-1.5 text-xs">저장</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
