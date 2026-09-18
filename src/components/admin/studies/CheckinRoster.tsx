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
 * 비대면 스터디 — **날짜별 인증 현황** (2026-09-18 Alan: "날짜별로 누가 인증을 안 했는지 보고, 그 학생에게 메시지").
 * 자료(날짜)마다 신청자 전원을 인증함/미인증으로 나눠 보여 주고, 미인증 학생을 골라 알림함으로 메시지를 보낸다.
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

  return (
    <div className="space-y-3">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
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
