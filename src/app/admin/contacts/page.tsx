import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CONTACT_REPLY_MAX } from "@/lib/contact-reply";
import { replyContact, updateContactStatus } from "./actions";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "문의", robots: { index: false } };

const TABS = [
  { value: "new", label: "새 문의" },
  { value: "read", label: "읽음" },
  { value: "replied", label: "답변 완료" },
  { value: "all", label: "전체" },
];

const SENT_TEXT: Record<string, string> = {
  inbox: "답변을 저장하고 학생 알림함으로 보냈어요.",
  none: "답변을 기록했어요. 비회원 문의라 이 사이트로는 전해지지 않아요 — 남긴 연락처로 직접 연락해 주세요.",
  failed: "답변은 저장했는데 알림함으로 보내지 못했어요. 잠시 뒤 다시 보내 주세요.",
};

const when = (iso: string) => formatDate(iso, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * 문의 (연락하기). 2026-09-30 Alan — "강사가 직접 답변을 해주는 공간이 없어. 혹시 비회원이라서 답변장소가 없는건가?"
 * → 회원·비회원 가릴 것 없이 답변 칸 자체가 없었다. 이제 카드마다 답변을 적는다:
 *   회원 문의는 같은 글이 학생 알림함으로 가고, 비회원 문의는 남긴 연락처로 직접 답한 뒤 기록만 남긴다.
 */
export default async function ContactsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; error?: string; replied?: string; sent?: string; id?: string }>;
}) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const { status: statusParam, ok, error, replied, sent, id: errorId } = await searchParams;
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : "new";
  const supabase = await createClient();

  let query = supabase
    .from("contact_messages")
    .select("id, user_id, name, phone, email, message, status, created_at, reply, replied_at, replier:profiles!contact_messages_replied_by_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(300);
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
      <PageHeader
        icon="contact"
        title="문의"
        description="연락하기 페이지로 들어온 문의예요. 회원 문의는 여기서 답변하면 학생 알림함으로 바로 가요. 비회원 문의는 남긴 연락처로 직접 연락해 주세요."
      />
      {ok && <Alert kind="success" className="mb-4">문의 #{ok} 상태를 저장했습니다.</Alert>}
      {replied && <Alert kind={sent === "failed" ? "warning" : "success"} className="mb-4">문의 #{replied} — {SENT_TEXT[sent ?? ""] ?? "답변을 저장했어요."}</Alert>}
      {error === "reply" && <Alert kind="warning" className="mb-4">문의 #{errorId} — 답변을 적어 주세요 ({CONTACT_REPLY_MAX.toLocaleString("ko-KR")}자 안).</Alert>}
      {error && error !== "reply" && <Alert kind="warning" className="mb-4">저장에 실패했습니다. 다시 시도해 주세요.</Alert>}
      <FilterTabs basePath="/admin/contacts" paramKey="status" current={status} tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} />

      {(rows ?? []).length === 0 ? (
        <EmptyState icon="contact" title="해당 상태의 문의가 없습니다" />
      ) : (
        <ul className="space-y-4">
          {(rows ?? []).map((m) => {
            const member = !!m.user_id;
            const replier = Array.isArray(m.replier) ? m.replier[0] : m.replier;
            return (
              <li key={m.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-ink">
                      {m.name}
                      {member ? (
                        <span className="ml-1.5 rounded-full bg-brand-50 px-2 py-0.5 align-middle text-[11px] font-black text-brand-700">회원</span>
                      ) : (
                        <span className="ml-1.5 rounded-full bg-line px-2 py-0.5 align-middle text-[11px] font-bold text-slate">비회원</span>
                      )}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-sm">
                      {m.phone && <a href={`tel:${m.phone}`} className="font-bold text-ink underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">{m.phone}</a>}
                      {m.email && <a href={`mailto:${m.email}`} className="font-bold text-ink underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">{m.email}</a>}
                    </p>
                    <p className="mt-1 text-xs text-mist">{when(m.created_at)}</p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface p-4 text-sm leading-relaxed text-ink-soft">{m.message}</p>

                {/* 답변 — 회원은 알림함으로, 비회원은 기록만 */}
                {m.reply && (
                  <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
                    <p className="text-xs font-black text-brand-700">
                      답변 · {m.replied_at ? when(m.replied_at) : ""}
                      {replier?.name ? ` · ${replier.name}` : ""}
                      <span className="ml-1 font-bold text-slate">{member ? "— 학생 알림함으로 보냄" : "— 기록만 (비회원)"}</span>
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{m.reply}</p>
                  </div>
                )}

                {m.reply ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-bold text-slate hover:text-brand-600">{member ? "답변 고쳐서 다시 보내기" : "답변 기록 고치기"}</summary>
                    <ReplyForm id={m.id} back={back} member={member} defaultValue={m.reply} again />
                  </details>
                ) : (
                  <ReplyForm id={m.id} back={back} member={member} />
                )}

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
                      <button type="submit" className="btn-ghost !py-1.5 text-xs">답변 없이 완료로</button>
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
            );
          })}
        </ul>
      )}
    </>
  );
}

function ReplyForm({ id, back, member, defaultValue, again = false }: { id: number; back: string; member: boolean; defaultValue?: string; again?: boolean }) {
  return (
    <form action={replyContact} className="mt-3 space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      {!member && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <b>비회원 문의예요.</b> 이 사이트로는 답변이 전해지지 않아요 — 위의 전화 · 메일로 직접 답해 주시고, 답한 내용을 여기에 적어 두세요.
        </p>
      )}
      <label htmlFor={`reply-${id}${again ? "-again" : ""}`} className="label !mb-1 text-xs">
        {member ? "답변 — 학생 알림함으로 가요" : "답변 기록"}
      </label>
      <textarea
        id={`reply-${id}${again ? "-again" : ""}`}
        name="reply"
        rows={4}
        required
        maxLength={CONTACT_REPLY_MAX}
        defaultValue={defaultValue}
        placeholder={member ? "학생에게 보낼 답변을 적어 주세요." : "예: 9/30 전화로 안내 — 수강증 업로드 방법 설명"}
        className="input resize-y !py-2 text-sm"
      />
      <SubmitButton className="!py-2 text-sm" pendingText="보내는 중…">
        {member ? (again ? "고쳐서 다시 보내기" : "답변 보내기") : "답변 기록하고 완료"}
      </SubmitButton>
    </form>
  );
}
