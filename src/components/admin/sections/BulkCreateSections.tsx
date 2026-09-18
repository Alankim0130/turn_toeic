"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { bulkCreateSections, type BulkRow } from "@/app/admin/sections/bulk-actions";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn, COURSE_TYPE_LABEL, TRACK_LABEL } from "@/lib/utils";
import { blockMinutes, buildBlockTree, dashLabel, flattenBlockTree, minutesLabel, TRACKS, type BlockNode } from "@/lib/time-blocks";
import { sectionKeyOf } from "./bulk";

export type BulkSlot = { id: number; level: number; program: string; label: string };
export type BulkCourse = { id: number; name: string; course_type: string; target_score: number | null; program: string; includes_levels: number[] };
type Instructor = { id: string; name: string; role: string };

const digits = (s: string) => s.replace(/[^\d]/g, "");
const cellKey = (courseId: number, slotId: number | null, track: string) => `${courseId}:${slotId ?? 0}:${track}`;

/** 표의 한 줄 = 시간대 하나. 묶음(120분) 아래에 시간 단위(60분)가 들여쓰기로 붙는다 */
type Row = { slot: BulkSlot | null; node: BlockNode | null; depth: number; leaf: boolean };

/**
 * 시간표(레벨·시간대) × 강좌 × 트랙 표에서 고른 반을 한 번에 개설한다.
 * 수강료 칸은 없다 (2026-09-18 Alan "수강료 부분은 다 삭제") — 불라방은 별도 반이 아니라 같은 반의 수강 방식이다.
 *
 * 60분 반과 120분 반 (2026-09-16 Alan): 시간 단위(60분 · 70분)가 진짜 수업이고 120분 · 140분은 그 시간들을 품는 묶음 반이다.
 * 묶음 반 학생은 안에 든 시간 단위 반의 수업일·다시보기·LC 교재를 그대로 받으므로 LC 교재는 시간 단위 반에만 고른다.
 * 주5일 = 같은 시간대의 월수금 + 화목금. 주5일 칸을 누르면 두 트랙이 함께 골라진다.
 */
export function BulkCreateSections({
  termId,
  termLabel,
  courses,
  slots,
  existingKeys,
  instructors,
  isAdmin,
}: {
  termId: number;
  termLabel: string;
  courses: BulkCourse[];
  slots: BulkSlot[];
  existingKeys: string[];
  instructors: Instructor[] | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [common, setCommon] = useState({ capacity: "", status: "open" });
  // LC 교재 세트는 시간 단위 · 트랙마다 정해진다 (2026-09-16 편성표) — 9월 650 은 10:00 화목금이 LC(A), 11:10 월수금이 LC(B)
  const [bookSets, setBookSets] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [instructorId, setInstructorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);
  // 같은 레벨이라도 점수보장반과 스파르타반은 시간대가 달라 과정까지 맞춘다
  const slotsOf = (c: BulkCourse) => slots.filter((s) => c.target_score != null && s.level === c.target_score && s.program === c.program);
  // 시간대를 묶음 → 시간 단위 트리로 (스파르타 190분·260분은 서로 다른 상품이라 평평하게)
  const rowsOf = (c: BulkCourse): Row[] => {
    const list = slotsOf(c);
    if (list.length === 0) return [{ slot: null, node: null, depth: 0, leaf: true }];
    const byLabel = new Map(list.map((s) => [s.label, s]));
    const tree = buildBlockTree(list.map((s) => s.label), { nest: c.program === "score" });
    return flattenBlockTree(tree).map(({ node, depth }) => ({ slot: byLabel.get(node.label) ?? null, node, depth, leaf: node.parts.length === 0 }));
  };
  const bookKey = (courseId: number, slotId: number | null, track: string) => `${courseId}:${slotId ?? 0}:${track}`;
  const isTaken = (c: BulkCourse, slot: BulkSlot | null, track: string) => existing.has(sectionKeyOf(c.id, track, slot ? slot.label : null));

  const toggle = (keys: string[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  function toggleCourse(c: BulkCourse, on: boolean) {
    const keys: string[] = [];
    for (const r of rowsOf(c)) {
      for (const t of TRACKS) {
        if (isTaken(c, r.slot, t)) continue;
        keys.push(cellKey(c.id, r.slot?.id ?? null, t));
      }
    }
    toggle(keys, on);
  }

  async function submit() {
    setMsg(null);
    const rows: BulkRow[] = [];
    for (const c of courses) {
      for (const r of rowsOf(c)) {
        for (const t of TRACKS) {
          if (!checked.has(cellKey(c.id, r.slot?.id ?? null, t))) continue;
          rows.push({
            courseId: c.id,
            slotId: r.slot?.id ?? null,
            track: t,
            capacity: digits(common.capacity) ? Number(digits(common.capacity)) : null,
            status: common.status,
            // 교재는 시간 단위 반에만. 묶음 반은 안에 든 반의 교재를 쓰고, 스파르타 반은 함께 듣는 점수보장반의 교재를 쓴다
            bookSet: c.program === "sparta" || !r.leaf ? null : bookSets[bookKey(c.id, r.slot?.id ?? null, t)] || null,
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
      const res = await bulkCreateSections({ termId, instructorId: isAdmin && instructorId ? instructorId : null, rows });
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
  // 주5일 묶음 수: 같은 (강좌 · 시간대) 의 월수금 · 화목금이 둘 다 골라진 것
  const fiveDay = useMemo(() => {
    let n = 0;
    for (const c of courses) for (const r of rowsOf(c)) if (TRACKS.every((t) => checked.has(cellKey(c.id, r.slot?.id ?? null, t)))) n++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, courses, slots]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl2 border border-line bg-surface p-4 sm:grid-cols-2">
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
          <div className="sm:col-span-2">
            <label htmlFor="bulk-instructor" className="label !mb-1 text-xs">담당 강사 <span className="font-normal text-mist">(고른 반 전체)</span></label>
            <select id="bulk-instructor" value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="input !py-2 text-sm">
              {/* 담당은 LC 교재로 DB 가 저절로 정한다 (2026-09-18). 고르면 과목을 못 읽는 반(교재 미지정)에만 들어간다 */}
              <option value="">자동 — 편성표대로 (LC 교재로 과목 강사에게)</option>
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
          const rows = rowsOf(c);
          const hasSlots = rows.some((r) => r.slot);
          const allOn = rows.every((r) => TRACKS.every((t) => isTaken(c, r.slot, t) || checked.has(cellKey(c.id, r.slot?.id ?? null, t))));
          return (
            <section key={c.id} aria-label={`${c.name} 반 개설`} className="rounded-xl2 border border-line bg-paper p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-black text-ink">
                    {c.name}
                    {/* 강좌의 종합/단과는 여기 적지 않는다 — 아래 60분 줄은 단과(LC 또는 RC), 120분 줄이 종합이라 강좌 이름 옆에 적으면 헷갈린다 */}
                    {(c.course_type === "lc" || c.course_type === "rc") && (
                      <span className="ml-2 text-xs font-bold text-slate">{COURSE_TYPE_LABEL[c.course_type]}</span>
                    )}
                    {c.target_score && <span className="ml-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-black text-brand-700">{c.target_score}</span>}
                  </p>
                  {c.program === "sparta" && (
                    <p className="mt-1 text-xs text-slate">
                      스파르타반 · {[c.target_score, ...c.includes_levels].filter(Boolean).join(" + ")} 반을 함께 들어요. 이 반 학생에게는 같은 트랙·시간의 그 반들(시간 단위)이 함께 열립니다.
                    </p>
                  )}
                  {!hasSlots && (
                    <p className="mt-1 text-xs text-amber-700">
                      이 강좌의 목표 점수에 맞는 시간표 시간대가 없어요. 시간대 없이 만들어집니다.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <button type="button" onClick={() => toggleCourse(c, !allOn)} className="btn-ghost !px-3 !py-1.5 text-xs">
                    {allOn ? "전체 해제" : "전체 선택"}
                  </button>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[26rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-mist">
                      <th className="py-1 font-semibold">시간대</th>
                      {TRACKS.map((t) => (
                        <th key={t} className="py-1 text-center font-semibold">
                          {TRACK_LABEL[t]}
                          {c.program !== "sparta" && <span className="block text-[10px] font-normal">개설 · LC 교재</span>}
                        </th>
                      ))}
                      <th className="py-1 text-center font-semibold">
                        주5일
                        <span className="block text-[10px] font-normal">둘 다</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => {
                      const s = r.slot;
                      const minutes = r.node ? minutesLabel(blockMinutes(r.node)) : null;
                      const takenTracks = TRACKS.filter((t) => isTaken(c, s, t));
                      const openKeys = TRACKS.filter((t) => !isTaken(c, s, t)).map((t) => cellKey(c.id, s?.id ?? null, t));
                      const fiveOn = openKeys.length > 0 && openKeys.every((k) => checked.has(k));
                      return (
                        <tr key={s?.id ?? "none"} className={cn(r.depth > 0 && "bg-surface/60")}>
                          <td className="py-2 font-bold tabular-nums text-ink">
                            <span className={cn("inline-flex flex-wrap items-center gap-1.5", r.depth > 0 && "pl-4")}>
                              {r.depth > 0 && <span aria-hidden className="text-mist">↳</span>}
                              {s ? s.label : "시간대 없음"}
                              {minutes && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-black text-brand-700">{minutes}</span>}
                              {r.node && !r.leaf && (
                                <span className="text-[11px] font-semibold text-slate" title="묶음 반 학생은 안에 든 시간 단위 반을 함께 들어요">
                                  묶음 · {r.node.parts.map((p) => dashLabel(p.label)).join(" + ")}
                                </span>
                              )}
                            </span>
                          </td>
                          {TRACKS.map((t) => {
                            const taken = takenTracks.includes(t);
                            const key = cellKey(c.id, s?.id ?? null, t);
                            const bKey = bookKey(c.id, s?.id ?? null, t);
                            return (
                              <td key={t} className="py-2 text-center">
                                <span className="inline-flex items-center justify-center gap-2">
                                  {taken ? (
                                    <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-bold text-slate">있음</span>
                                  ) : (
                                    <label className="inline-flex cursor-pointer items-center justify-center">
                                      <input
                                        type="checkbox"
                                        checked={checked.has(key)}
                                        onChange={(e) => toggle([key], e.target.checked)}
                                        className="h-5 w-5 accent-brand-500"
                                        aria-label={`${c.name} ${s ? s.label : ""} ${TRACK_LABEL[t]} 반 개설`}
                                      />
                                    </label>
                                  )}
                                  {!taken && c.program !== "sparta" && r.leaf && (
                                    <>
                                      <label className="sr-only" htmlFor={`book-${bKey}`}>
                                        {c.name} {s ? s.label : ""} {TRACK_LABEL[t]} LC 교재 세트
                                      </label>
                                      <select
                                        id={`book-${bKey}`}
                                        value={bookSets[bKey] ?? ""}
                                        onChange={(e) => setBookSets({ ...bookSets, [bKey]: e.target.value })}
                                        className="input !w-[4.5rem] !px-2 !py-1 text-xs"
                                      >
                                        <option value="">교재</option>
                                        <option value="A">A반</option>
                                        <option value="B">B반</option>
                                      </select>
                                    </>
                                  )}
                                </span>
                              </td>
                            );
                          })}
                          <td className="py-2 text-center">
                            {openKeys.length === 0 ? (
                              <span className="text-[11px] font-bold text-mist">있음</span>
                            ) : (
                              <label className="inline-flex cursor-pointer items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={fiveOn}
                                  onChange={(e) => toggle(openKeys, e.target.checked)}
                                  className="h-5 w-5 accent-brand-500"
                                  aria-label={`${c.name} ${s ? s.label : ""} 주5일 (월수금·화목금 둘 다) 개설`}
                                />
                              </label>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
          {fiveDay > 0 && <span className="ml-1 text-xs font-bold text-brand-700">(주5일 {fiveDay}묶음)</span>}
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
