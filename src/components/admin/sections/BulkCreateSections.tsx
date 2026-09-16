"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { bulkCreateSections, type BulkRow } from "@/app/admin/sections/bulk-actions";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn, COURSE_TYPE_LABEL, TRACK_LABEL } from "@/lib/utils";
import { sectionKeyOf } from "./bulk";

export type BulkSlot = { id: number; level: number; label: string };
export type BulkCourse = { id: number; name: string; course_type: string; target_score: number | null };
type Instructor = { id: string; name: string; role: string };

const TRACKS = ["mwf", "ttf"] as const;
const digits = (s: string) => s.replace(/[^\d]/g, "");
const cellKey = (courseId: number, slotId: number | null, track: string) => `${courseId}:${slotId ?? 0}:${track}`;

/**
 * 시간표(레벨·시간대) × 강좌 × 트랙 표에서 고른 반을 한 번에 개설한다.
 * 불라방은 별도 반이 아니라 같은 반의 수강 방식이라, 반마다 현장·불라방 수강료를 함께 넣는다.
 */
export function BulkCreateSections({
  termId,
  termLabel,
  courses,
  slots,
  existingKeys,
  instructors,
  currentUserId,
  isAdmin,
}: {
  termId: number;
  termLabel: string;
  courses: BulkCourse[];
  slots: BulkSlot[];
  existingKeys: string[];
  instructors: Instructor[] | null;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [common, setCommon] = useState({ tuition: "", live: "", capacity: "", status: "open" });
  const [fees, setFees] = useState<Record<number, { tuition: string; live: string }>>({});
  // LC 교재 세트는 시간대마다 정해진다 (2026-09-16 Alan) — 같은 시간대의 두 트랙은 같은 교재를 쓴다
  const [bookSets, setBookSets] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [instructorId, setInstructorId] = useState(currentUserId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);
  const slotsOf = (c: BulkCourse) => slots.filter((s) => c.target_score != null && s.level === c.target_score);
  const feeOf = (courseId: number) => fees[courseId] ?? { tuition: common.tuition, live: common.live };
  const bookKey = (courseId: number, slotId: number | null) => `${courseId}:${slotId ?? 0}`;

  const toggle = (key: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  function toggleCourse(c: BulkCourse, on: boolean) {
    const rows = slotsOf(c);
    const list = rows.length ? rows : [null];
    setChecked((prev) => {
      const next = new Set(prev);
      for (const s of list) {
        for (const t of TRACKS) {
          const label = s ? s.label : null;
          if (existing.has(sectionKeyOf(c.id, t, label))) continue;
          const key = cellKey(c.id, s?.id ?? null, t);
          if (on) next.add(key);
          else next.delete(key);
        }
      }
      return next;
    });
  }

  async function submit() {
    setMsg(null);
    const rows: BulkRow[] = [];
    for (const c of courses) {
      const list = slotsOf(c);
      const cells = list.length ? list : [null];
      const fee = feeOf(c.id);
      for (const s of cells) {
        for (const t of TRACKS) {
          if (!checked.has(cellKey(c.id, s?.id ?? null, t))) continue;
          rows.push({
            courseId: c.id,
            slotId: s?.id ?? null,
            track: t,
            // 수강료는 선택 — 등록은 YBM 에서 한다 (2026-09-16 Alan)
            tuition: digits(fee.tuition) ? Number(digits(fee.tuition)) : null,
            liveTuition: digits(fee.live) ? Number(digits(fee.live)) : null,
            capacity: digits(common.capacity) ? Number(digits(common.capacity)) : null,
            status: common.status,
            bookSet: bookSets[bookKey(c.id, s?.id ?? null)] || null,
          });
        }
      }
    }
    if (rows.length === 0) {
      setMsg({ kind: "warning", text: "개설할 반을 하나 이상 골라 주세요." });
      return;
    }

    setBusy(true);
    try {
      const res = await bulkCreateSections({ termId, instructorId: isAdmin ? instructorId : null, rows });
      if (!res.ok) {
        setMsg({ kind: "warning", text: res.error ?? "반을 개설하지 못했어요." });
        return;
      }
      setChecked(new Set());
      setMsg({
        kind: "success",
        text: `${res.created}개 반을 개설했어요.${res.skipped ? ` 이미 있던 ${res.skipped}개는 건너뛰었습니다.` : ""}`,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const total = checked.size;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl2 border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="bulk-tuition" className="label !mb-1 text-xs">현장 수강료 <span className="font-normal text-mist">(선택 · 기본값)</span></label>
          <input
            id="bulk-tuition"
            inputMode="numeric"
            value={common.tuition}
            onChange={(e) => setCommon({ ...common, tuition: digits(e.target.value) })}
            placeholder="비워도 됩니다"
            className="input !py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="bulk-live" className="label !mb-1 text-xs">불라방 수강료 <span className="font-normal text-mist">(선택)</span></label>
          <input
            id="bulk-live"
            inputMode="numeric"
            value={common.live}
            onChange={(e) => setCommon({ ...common, live: digits(e.target.value) })}
            placeholder="비우면 불라방 미운영"
            className="input !py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="bulk-capacity" className="label !mb-1 text-xs">정원 <span className="font-normal text-mist">(선택)</span></label>
          <input
            id="bulk-capacity"
            inputMode="numeric"
            value={common.capacity}
            onChange={(e) => setCommon({ ...common, capacity: digits(e.target.value) })}
            placeholder="제한 없음"
            className="input !py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="bulk-status" className="label !mb-1 text-xs">상태</label>
          <select id="bulk-status" value={common.status} onChange={(e) => setCommon({ ...common, status: e.target.value })} className="input !py-2 text-sm">
            <option value="open">모집 중 (공개 시간표에 노출)</option>
            <option value="draft">준비 중 (비공개)</option>
          </select>
        </div>
        {isAdmin && instructors && (
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor="bulk-instructor" className="label !mb-1 text-xs">담당 강사 <span className="font-normal text-mist">(고른 반 전체)</span></label>
            <select id="bulk-instructor" value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="input !py-2 text-sm">
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.role === "admin" ? "관리자" : "강사"})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {courses.map((c) => {
          const list = slotsOf(c);
          const cells = list.length ? list : [null];
          const fee = feeOf(c.id);
          const allOn = cells.every((s) =>
            TRACKS.every((t) => existing.has(sectionKeyOf(c.id, t, s ? s.label : null)) || checked.has(cellKey(c.id, s?.id ?? null, t))),
          );
          return (
            <section key={c.id} aria-label={`${c.name} 반 개설`} className="rounded-xl2 border border-line bg-paper p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-black text-ink">
                    {c.name}
                    <span className="ml-2 text-xs font-bold text-slate">{COURSE_TYPE_LABEL[c.course_type] ?? c.course_type}</span>
                    {c.target_score && <span className="ml-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-black text-brand-700">{c.target_score}</span>}
                  </p>
                  {list.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      이 강좌의 목표 점수에 맞는 시간표 시간대가 없어요. 시간대 없이 만들어집니다.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label htmlFor={`fee-${c.id}`} className="label !mb-1 text-xs">현장 수강료 <span className="font-normal text-mist">(선택)</span></label>
                    <input
                      id={`fee-${c.id}`}
                      inputMode="numeric"
                      value={fee.tuition}
                      onChange={(e) => setFees({ ...fees, [c.id]: { ...fee, tuition: digits(e.target.value) } })}
                      className="input !w-32 !py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`live-${c.id}`} className="label !mb-1 text-xs">불라방 수강료</label>
                    <input
                      id={`live-${c.id}`}
                      inputMode="numeric"
                      value={fee.live}
                      onChange={(e) => setFees({ ...fees, [c.id]: { ...fee, live: digits(e.target.value) } })}
                      className="input !w-32 !py-1.5 text-sm"
                    />
                  </div>
                  <button type="button" onClick={() => toggleCourse(c, !allOn)} className="btn-ghost !px-3 !py-1.5 text-xs">
                    {allOn ? "전체 해제" : "전체 선택"}
                  </button>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[22rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-mist">
                      <th className="py-1 font-semibold">시간대</th>
                      {TRACKS.map((t) => (
                        <th key={t} className="py-1 text-center font-semibold">{TRACK_LABEL[t]}</th>
                      ))}
                      <th className="py-1 text-right font-semibold">LC 교재</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {cells.map((s) => (
                      <tr key={s?.id ?? "none"}>
                        <td className="py-2 font-bold tabular-nums text-ink">{s ? s.label : "시간대 없음"}</td>
                        {TRACKS.map((t) => {
                          const taken = existing.has(sectionKeyOf(c.id, t, s ? s.label : null));
                          const key = cellKey(c.id, s?.id ?? null, t);
                          return (
                            <td key={t} className="py-2 text-center">
                              {taken ? (
                                <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-bold text-slate">있음</span>
                              ) : (
                                <label className="inline-flex cursor-pointer items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={checked.has(key)}
                                    onChange={(e) => toggle(key, e.target.checked)}
                                    className="h-5 w-5 accent-brand-500"
                                    aria-label={`${c.name} ${s ? s.label : ""} ${TRACK_LABEL[t]} 반 개설`}
                                  />
                                </label>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 text-right">
                          <label className="sr-only" htmlFor={`book-${bookKey(c.id, s?.id ?? null)}`}>
                            {c.name} {s ? s.label : ""} LC 교재 세트
                          </label>
                          <select
                            id={`book-${bookKey(c.id, s?.id ?? null)}`}
                            value={bookSets[bookKey(c.id, s?.id ?? null)] ?? ""}
                            onChange={(e) => setBookSets({ ...bookSets, [bookKey(c.id, s?.id ?? null)]: e.target.value })}
                            className="input !w-24 !py-1 text-xs"
                          >
                            <option value="">미지정</option>
                            <option value="A">A반</option>
                            <option value="B">B반</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-line glass px-4 py-3">
        <p className="text-sm font-semibold text-slate">
          고른 반 <span className={cn("text-xl font-black tabular-nums", total ? "text-brand-600" : "text-mist")}>{total}</span>개
          <span className="ml-2 text-xs text-mist">· 개강일·종강일·회차 수는 {termLabel} 달력에서 가져와요</span>
        </p>
        <button type="button" onClick={submit} disabled={busy || total === 0} className="btn-primary !py-2.5" aria-busy={busy}>
          <Icon name="calendar" size={18} className="brightness-0 invert" />
          {busy ? "개설 중…" : `${total}개 반 개설`}
        </button>
      </div>
    </div>
  );
}
