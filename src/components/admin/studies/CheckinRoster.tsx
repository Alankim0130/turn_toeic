"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendStudentMessages } from "@/app/admin/study/message-actions";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate } from "@/lib/utils";
import { missingCheckinMessage } from "@/lib/study-checkin";

export type RosterStudent = { id: string; name: string; phone: string | null };
export type RosterMaterial = { id: number; date: string; title: string | null };
export type RosterCheckin = { material_id: number; user_id: string; created_at: string; files: number };

/**
 * 비대면 스터디 **인증 현황**. 두 가지로 보여 준다:
 *  ① **한눈에 보기** — 학생 × 날짜 격자 (2026-09-19 Alan: "학생들이 비대면을 신청하고 난 뒤,
 *     인증을 했는지 안했는지 강사모드에서 한번에 쭈욱 확인이 가능하면 좋겠어")
 *  ② **날짜별 카드** — 자료마다 인증함/미인증으로 나누고 미인증 학생에게 알림을 보낸다 (2026-09-18 Alan)
 *
 * **숙제점검(`/admin/homework`)과 완전히 다른 것이다** — 그쪽은 정규 수업 숙제다 (2026-09-19 Alan).
 * 인증을 안 한 학생에게 **자료를 막는 규정은 아직 없다** (Alan: "정확한 규정은 아직 확인을 안 해봤지만") —
 * 여기서 임의로 막지 말 것.
 */
export function CheckinRoster({ students, materials, checkins }: { students: RosterStudent[]; materials: RosterMaterial[]; checkins: RosterCheckin[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(materials[0]?.id ?? null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [compose, setCompose] = useState<{ materialId: number; title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  const byMaterial = new Map<number, Map<string, RosterCheckin>>();
  for (const c of checkins) byMaterial.set(c.material_id, (byMaterial.get(c.material_id) ?? new Map()).set(c.user_id, c));

  const startCompose = (m: RosterMaterial, missing: RosterStudent[]) => {
    setPicked(new Set(missing.map((s) => s.id)));
    const t = missingCheckinMessage(m.date);
    setCompose({ materialId: m.id, ...t });
    setMsg(null);
  };

  async function send(m: RosterMaterial) {
    if (!compose || busy) return;
    setBusy(true);
    const res = await sendStudentMessages({ userIds: [...picked], title: compose.title, body: compose.body, kind: "study_checkin", related: { materialId: m.id, date: m.date } });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "warning", text: res.error ?? "보내지 못했어요." });
    setMsg({ kind: "success", text: `${res.sent}명에게 알림을 보냈어요. 학생 알림함에서 볼 수 있어요.` });
    setCompose(null);
    router.refresh();
  }

  if (materials.length === 0) {
    return <p className="card p-6 text-center text-sm text-slate">아직 올린 자료가 없어요. 비대면 자료를 날짜별로 올리면 그 날짜의 인증 현황이 여기 나옵니다.</p>;
  }

  // 한눈에 보기: 미인증이 많은 학생을 위로 (2026-09-19 Alan — "인증을 했는지 안했는지 강사모드에서 한번에 쭈욱 확인")
  const missedOf = (id: string) => materials.filter((m) => !byMaterial.get(m.id)?.has(id)).length;
  const ranked = [...students].sort((a, b) => missedOf(b.id) - missedOf(a.id) || (a.name || "").localeCompare(b.name || ""));

  return (
    <div className="space-y-3">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {/* ─── 한눈에 보기 (학생 × 날짜) ───────────────────────────────────────
          날짜별 카드만 있으면 한 사람이 어느 날을 빠뜨렸는지 보려고 자료를 하나씩 펼쳐야 한다.
          자료가 한 달에 18~19개라 가로 스크롤은 어쩔 수 없다 — 이름 칸만 왼쪽에 고정한다 */}
      {students.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-line bg-brand-50/60 px-4 py-3">
            <p className="font-black text-ink">한눈에 보기</p>
            <p className="mt-0.5 text-xs text-slate">
              신청 {students.length}명 × 자료 {materials.length}일 · 미인증이 많은 학생이 위로 옵니다. 알림 보내기는 아래 날짜별 칸에서 해요.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-surface text-xs text-slate">
                <tr>
                  <th className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-bold">이름</th>
                  {materials.map((m) => (
                    <th key={m.id} className="px-1.5 py-2 text-center font-bold tabular-nums" title={formatDate(m.date)}>
                      {Number(m.date.slice(5, 7))}/{Number(m.date.slice(8, 10))}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-bold">인증</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ranked.map((st) => {
                  const missed = missedOf(st.id);
                  return (
                    <tr key={st.id} className={cn(missed > 0 && "bg-amber-50/40")}>
                      <th scope="row" className={cn("sticky left-0 z-10 px-4 py-1.5 text-left font-bold text-ink", missed > 0 ? "bg-[#fffbeb]" : "bg-paper")}>
                        {st.name || "-"}
                      </th>
                      {materials.map((m) => {
                        const c = byMaterial.get(m.id)?.get(st.id);
                        return (
                          <td key={m.id} className="px-1.5 py-1.5 text-center">
                            {c ? (
                              <span
                                role="img"
                                aria-label={`${formatDate(m.date)} 인증함`}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white"
                                title={`${formatDate(m.date)} 인증 · 사진 ${c.files}장`}
                              >
                                {/* 12px 에서는 힉스필드 PNG 가 뭉개진다 — 도형(인라인 SVG)으로 그린다 (디자인 원칙) */}
                                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M3.5 8.5l3 3 6-7" />
                                </svg>
                              </span>
                            ) : (
                              // `sr-only` 자식을 두지 말 것 — position:absolute 라 가로 스크롤 상자를 빠져나가
                              // **페이지 전체가 옆으로 밀린다** (320px 에서 15px 넘쳤다). 설명은 aria-label 로 단다
                              <span
                                role="img"
                                aria-label={`${formatDate(m.date)} 미인증`}
                                className="inline-block h-5 w-5 rounded-full bg-line align-middle"
                                title={`${formatDate(m.date)} 미인증`}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right text-xs font-black tabular-nums">
                        <span className={cn(missed > 0 ? "text-amber-800" : "text-brand-700")}>
                          {materials.length - missed} / {materials.length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {materials.map((m) => {
        const done = byMaterial.get(m.id) ?? new Map<string, RosterCheckin>();
        const missing = students.filter((s) => !done.has(s.id));
        const open = openId === m.id;
        return (
          <section key={m.id} className="card overflow-hidden">
            <button type="button" onClick={() => setOpenId(open ? null : m.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left hover:bg-brand-50/40" aria-expanded={open}>
              <span className="font-black text-ink">
                {formatDate(m.date)} {m.title && <span className="ml-1 text-sm font-semibold text-slate">· {m.title}</span>}
              </span>
              <span className="flex items-center gap-2 text-sm font-bold tabular-nums">
                <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-white">인증 {done.size}</span>
                <span className={cn("rounded-full px-2.5 py-0.5", missing.length ? "bg-amber-100 text-amber-800" : "bg-line text-slate")}>미인증 {missing.length}</span>
                <span className="text-slate">/ 신청 {students.length}</span>
              </span>
            </button>

            {open && (
              <div className="border-t border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface text-left text-xs text-slate">
                    <tr>
                      <th className="px-5 py-2 font-bold">이름</th>
                      <th className="px-3 py-2 font-bold">연락처</th>
                      <th className="px-3 py-2 font-bold">인증</th>
                      {compose?.materialId === m.id && <th className="px-3 py-2 font-bold">보내기</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {students.map((s) => {
                      const c = done.get(s.id);
                      return (
                        <tr key={s.id} className={cn(!c && "bg-amber-50/40")}>
                          <td className="px-5 py-2 font-bold text-ink">{s.name || "-"}</td>
                          <td className="px-3 py-2 text-slate">{s.phone ? <a href={`tel:${s.phone}`} className="text-brand-600 hover:underline">{s.phone}</a> : "-"}</td>
                          <td className="px-3 py-2">
                            {c ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-700">
                                <Icon name="success" size={14} /> {formatDate(c.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · 사진 {c.files}장
                              </span>
                            ) : (
                              <span className="text-xs font-black text-amber-800">미인증</span>
                            )}
                          </td>
                          {compose?.materialId === m.id && (
                            <td className="px-3 py-2">
                              {!c && (
                                <input
                                  type="checkbox"
                                  aria-label={`${s.name}에게 보내기`}
                                  checked={picked.has(s.id)}
                                  onChange={(e) => {
                                    const next = new Set(picked);
                                    if (e.target.checked) next.add(s.id);
                                    else next.delete(s.id);
                                    setPicked(next);
                                  }}
                                />
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="border-t border-line bg-surface px-5 py-3">
                  {compose?.materialId === m.id ? (
                    <div className="space-y-2">
                      <input value={compose.title} onChange={(e) => setCompose({ ...compose, title: e.target.value })} maxLength={80} className="input !py-2 text-sm font-bold" aria-label="제목" />
                      <textarea value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} maxLength={1000} rows={3} className="input resize-y text-sm" aria-label="내용" />
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => send(m)} disabled={busy || picked.size === 0} className="btn-primary !px-4 !py-2 text-sm">
                          {busy ? "보내는 중…" : `${picked.size}명에게 알림 보내기`}
                        </button>
                        <button type="button" onClick={() => setCompose(null)} disabled={busy} className="btn-ghost !px-3 !py-2 text-sm">취소</button>
                        <span className="text-xs text-mist">학생의 알림함(마이페이지 → 알림)에 들어가요. 문자·카톡은 가지 않아요.</span>
                      </div>
                    </div>
                  ) : missing.length > 0 ? (
                    <button type="button" onClick={() => startCompose(m, missing)} className="btn-secondary !px-4 !py-2 text-sm">
                      <Icon name="bell" size={18} />
                      미인증 {missing.length}명에게 알림 보내기
                    </button>
                  ) : (
                    <p className="text-sm font-bold text-brand-700">전원 인증했어요.</p>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
