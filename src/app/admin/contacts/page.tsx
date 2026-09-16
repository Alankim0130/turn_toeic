import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { updateContactStatus } from "./actions";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "문의", robots: { index: false } };

const TABS = [
  { value: "new", label: "새 문의" },
  { value: "read", label: "읽음" },
  { value: "replied", label: "답변 완료" },
  { value: "all", label: "전체" },
];

export default async function ContactsAdminPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const { status: statusParam, ok, error } = await searchParams;
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : "new";
  const supabase = await createClient();

  let query = supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(300);
  if (status !== "all") query = query.eq("status", status);

  const [{ data: rows }, ...countRes] = await Promise.all([
    query,
    ...["new", "read", "replied"].map((s) => supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);
  const counts: Record<string, number | undefined> = {
    new: countRes[0].count ?? 0,
    read: countRes[1].count ?? 0,
    replied: countRes[2].count ?? 0,
  };
  const back = `/admin/contacts?status=${status}`;

  return (
    <>
      <PageHeader icon="contact" title="문의" description="연락하기 페이지로 들어온 문의입니다. 답변 후 상태를 바꿔 주세요." />
      {ok && <Alert kind="success" className="mb-4">문의 #{ok} 상태를 저장했습니다.</Alert>}
      {error && <Alert kind="warning" className="mb-4">저장에 실패했습니다. 다시 시도해 주세요.</Alert>}
      <FilterTabs basePath="/admin/contacts" paramKey="status" current={status} tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} />

      {(rows ?? []).length === 0 ? (
        <EmptyState icon="contact" title="해당 상태의 문의가 없습니다" />
      ) : (
        <ul className="space-y-4">
          {(rows ?? []).map((m) => (
            <li key={m.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-ink">
                    {m.name}
                    {!m.user_id && <span className="ml-1 text-xs font-semibold text-mist">(비회원)</span>}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-sm">
                    {m.phone && <a href={`tel:${m.phone}`} className="font-bold text-brand-600 hover:underline">{m.phone}</a>}
                    {m.email && <a href={`mailto:${m.email}`} className="font-bold text-brand-600 hover:underline">{m.email}</a>}
                  </p>
                  <p className="mt-1 text-xs text-mist">{formatDate(m.created_at, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <StatusBadge status={m.status} />
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface p-4 text-sm leading-relaxed text-ink-soft">{m.message}</p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                {m.status !== "read" && (
                  <form action={updateContactStatus}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="status" value="read" />
                    <button type="submit" className="btn-secondary !py-1.5 text-xs">읽음으로 표시</button>
                  </form>
                )}
                {m.status !== "replied" && (
                  <form action={updateContactStatus}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="status" value="replied" />
                    <button type="submit" className="btn-primary !py-1.5 text-xs">답변 완료</button>
                  </form>
                )}
                {m.status !== "new" && (
                  <form action={updateContactStatus}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="status" value="new" />
                    <button type="submit" className="btn-ghost !py-1.5 text-xs">새 문의로 되돌리기</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
