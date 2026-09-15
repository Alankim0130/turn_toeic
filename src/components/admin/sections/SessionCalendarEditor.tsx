"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSessionDates, type SaveResult } from "@/app/admin/sections/actions";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn, TRACK_LABEL } from "@/lib/utils";
import { WEEKDAY_KO, generateDraft, labelKo, monthGrid, ymd, type Track } from "./dates";

type Existing = { date: string; start_time: string; end_time: string; seq: number; hasReplay: boolean };
type Sel = { start: string; end: string };

export function SessionCalendarEditor({
  sectionId,
  year,
  month,
  track,
  targetSessions,
  defaultStart,
  defaultEnd,
  existing,
  siblingDates,
  siblingTrack,
  readOnly = false,
}: {
  sectionId: number;
  year: number;
  month: number;
  track: Track;
  targetSessions: number;
  defaultStart: string;
  defaultEnd: string;
  existing: Existing[];
  siblingDates: string[];
  siblingTrack?: Track;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const locked = useMemo(() => new Set(existing.filter((e) => e.hasReplay).map((e) => e.date)), [existing]);
  const existingSet = useMemo(() => new Set(existing.map((e) => e.date)), [existing]);
  const siblingSet = useMemo(() => new Set(siblingDates), [siblingDates]);

  const initial = useMemo(() => {
    const m: Record<string, Sel> = {};
    for (const e of existing) m[e.date] = { start: e.start_time, end: e.end_time };
    return m;
  }, [existing]);

  const [sel, setSel] = useState<Record<string, Sel>>(initial);
  const [gStart, setGStart] = useState(defaultStart);
  const [gEnd, setGEnd] = useState(defaultEnd);
  const [fridayStart, setFridayStart] = useState<1 | 2>(1);
  const [notice, setNotice] = useState<{ kind: "success" | "warning" | "info"; text: string } | null>(null);
  const [showTimes, setShowTimes] = useState(false);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const selectedDates = useMemo(() => Object.keys(sel).sort(), [sel]);
  const count = selectedDates.length;
  const overlaps = useMemo(() => selectedDates.filter((d) => siblingSet.has(d)), [selectedDates, siblingSet]);

  const dirty = useMemo(() => {
    const a = Object.keys(initial).sort();
    if (a.length !== selectedDates.length) return true;
    return selectedDates.some((d) => !initial[d] || initial[d].start !== sel[d].start || initial[d].end !== sel[d].end);
  }, [initial, sel, selectedDates]);

  const toggle = (date: string) => {
    if (readOnly) return;
    if (sel[date]) {
      if (locked.has(date)) {
        setNotice({ kind: "warning", text: `${labelKo(date)} 회차에는 다시보기가 등록되어 있어 뺄 수 없어요. 먼저 다시보기를 삭제해 주세요.` });
        return;
      }
      const next = { ...sel };
      delete next[date];
      setSel(next);
    } else {
      setSel({ ...sel, [date]: { start: gStart, end: gEnd } });
    }
    setNotice(null);
  };

  const applyDraft = () => {
    if (readOnly) return;
    const draft = generateDraft(year, month, track, fridayStart);
    const next: Record<string, Sel> = {};
    for (const d of draft) next[d] = sel[d] ?? { start: gStart, end: gEnd };
    for (const d of locked) next[d] = sel[d] ?? initial[d] ?? { start: gStart, end: gEnd };
    setSel(next);
    setNotice({ kind: "info", text: `${TRACK_LABEL[track]} 초안 ${Object.keys(next).length}개 날짜를 채웠어요. 캘린더에서 날짜를 눌러 조정한 뒤 저장하세요.` });
  };

  const clearAll = () => {
    if (readOnly) return;
    const next: Record<string, Sel> = {};
    for (const d of locked) next[d] = sel[d] ?? initial[d];
    setSel(next);
    setNotice(null);
  };

  const applyGlobalTimes = () => {
    const next: Record<string, Sel> = {};
    for (const d of selectedDates) next[d] = { start: gStart, end: gEnd };
    setSel(next);
  };

  const save = () => {
    if (readOnly) return;
    if (gEnd <= gStart) {
      setNotice({ kind: "warning", text: "종료 시간은 시작 시간보다 늦어야 해요." });
      return;
    }
    startTransition(async () => {
      const res: SaveResult = await saveSessionDates(
        sectionId,
        selectedDates.map((d) => ({ date: d, start_time: sel[d].start, end_time: sel[d].end })),
      );
      if (res.ok) {
        setNotice({
          kind: "success",
          text: `저장했어요. 추가 ${res.inserted ?? 0} · 삭제 ${res.deleted ?? 0} · 시간 변경 ${res.updated ?? 0}. 회차 번호를 날짜순으로 다시 매겼습니다.`,
        });
        router.refresh();
      } else {
        setNotice({ kind: "warning", text: res.error ?? "저장하지 못했어요." });
      }
    });
  };

  const counterClass = count === targetSessions ? "text-brand-600" : count > targetSessions ? "text-red-600" : "text-amber-600";

  return (
    <div className="space-y-5">
      {/* 컨트롤 */}
      {!readOnly && (
        <div className="flex flex-col gap-3 rounded-xl2 border border-line bg-surface p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="label">이 트랙의 금요일 시작 주</span>
              <div className="flex gap-2">
                {[1, 2].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setFridayStart(w as 1 | 2)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-bold transition",
                      fridayStart === w ? "border-brand-400 bg-brand-500 text-white" : "border-line bg-paper text-slate hover:border-brand-300",
                    )}
                  >
                    {w}주차부터
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={applyDraft} className="btn-dark">
              <Icon name="calendar" size={18} className="brightness-0 invert" />
              {TRACK_LABEL[track]} 초안 생성
            </button>
            <button type="button" onClick={clearAll} className="btn-ghost">
              모두 비우기
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="g-start" className="label">시작</label>
              <input id="g-start" type="time" value={gStart} onChange={(e) => setGStart(e.target.value)} className="input !py-2" />
            </div>
            <div>
              <label htmlFor="g-end" className="label">종료</label>
              <input id="g-end" type="time" value={gEnd} onChange={(e) => setGEnd(e.target.value)} className="input !py-2" />
            </div>
            <button type="button" onClick={applyGlobalTimes} className="btn-secondary !py-2" title="선택한 모든 날짜에 이 시간을 적용">
              전체 적용
            </button>
          </div>
        </div>
      )}

      {/* 카운터 (sticky) */}
      <div className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-xl2 border border-line glass px-4 py-2.5">
        <p className="text-sm font-semibold text-slate">
          선택한 수업일{" "}
          <span className={cn("text-xl font-black tabular-nums", counterClass)}>
            {count} / {targetSessions}회
          </span>
          {count !== targetSessions && (
            <span className={cn("ml-2 text-xs font-bold", counterClass)}>{count > targetSessions ? `${count - targetSessions}회 초과` : `${targetSessions - count}회 부족`}</span>
          )}
        </p>
        {!readOnly && (
          <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary !py-2">
            {pending ? "저장 중…" : dirty ? "편성 저장" : "변경 없음"}
          </button>
        )}
      </div>

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
      {overlaps.length > 0 && (
        <Alert kind="warning" title={`묶음 반(${siblingTrack ? TRACK_LABEL[siblingTrack] : "다른 트랙"})과 같은 날 수업이 ${overlaps.length}일 있어요`}>
          주5일 수강생이 하루에 두 수업을 듣게 됩니다: {overlaps.map((d) => labelKo(d)).join(", ")}
        </Alert>
      )}

      {/* 달력 */}
      <div role="grid" aria-label={`${year}년 ${month}월 수업일 선택`} className="select-none">
        <div role="row" className="grid grid-cols-7 text-center text-xs font-bold text-mist">
          {WEEKDAY_KO.map((w, i) => (
            <div key={w} role="columnheader" className={cn("py-1", i === 0 && "text-red-400", i === 6 && "text-blue-400")}>
              {w}
            </div>
          ))}
        </div>
        {grid.map((row, ri) => (
          <div key={ri} role="row" className="grid grid-cols-7 gap-1 py-0.5">
            {row.map((d, ci) => {
              if (d === null) return <div key={ci} aria-hidden />;
              const date = ymd(year, month, d);
              const on = !!sel[date];
              const isLocked = locked.has(date);
              const sib = siblingSet.has(date);
              const weekend = ci === 0 || ci === 6;
              const wasExisting = existingSet.has(date);
              return (
                <button
                  key={ci}
                  type="button"
                  role="gridcell"
                  aria-selected={on}
                  aria-label={`${labelKo(date)}${on ? " 선택됨" : ""}${isLocked ? " (다시보기 있음)" : ""}${sib ? " (묶음 반 수업일)" : ""}`}
                  onClick={() => toggle(date)}
                  disabled={readOnly}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-bold transition sm:aspect-auto sm:h-16",
                    on
                      ? "border-brand-500 bg-brand-500 text-white shadow-pink"
                      : cn("border-line bg-paper text-ink hover:border-brand-300 hover:bg-brand-50", weekend && "text-mist"),
                    on && sib && "ring-2 ring-amber-400 ring-offset-1",
                    readOnly && "cursor-default",
                  )}
                >
                  <span className="tabular-nums">{d}</span>
                  {on && sel[date] && (
                    <span className="hidden text-[10px] font-semibold opacity-90 sm:block">
                      {sel[date].start}
                    </span>
                  )}
                  {on && !wasExisting && <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-white/90" title="새로 추가" />}
                  {isLocked && (
                    <span className="absolute right-1 top-1" title="다시보기 등록됨">
                      <Icon name="replay" size={12} className={cn(on && "brightness-0 invert")} />
                    </span>
                  )}
                  {sib && (
                    <span
                      className={cn("absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full", on ? "bg-amber-300" : "bg-brand-300")}
                      title={`묶음 반(${siblingTrack ? TRACK_LABEL[siblingTrack] : ""}) 수업일`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-500" />선택한 수업일</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line bg-paper" /><span className="h-1.5 w-1.5 rounded-full bg-brand-300" />묶음 반 수업일</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded ring-2 ring-amber-400" />같은 날 겹침</li>
        <li className="flex items-center gap-1.5"><Icon name="replay" size={12} />다시보기 등록됨 (제외 불가)</li>
      </ul>

      {/* 회차별 시간 조정 */}
      {selectedDates.length > 0 && (
        <div className="rounded-xl2 border border-line">
          <button
            type="button"
            onClick={() => setShowTimes((s) => !s)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-ink"
            aria-expanded={showTimes}
          >
            회차별 시간 조정 <span className="text-xs font-semibold text-slate">{showTimes ? "접기" : "펼치기"} · 기본은 반의 시작·종료 시간</span>
          </button>
          {showTimes && (
            <ul className="divide-y divide-line border-t border-line">
              {selectedDates.map((d, i) => (
                <li key={d} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <span className="w-10 font-black text-brand-600">{i + 1}회</span>
                  <span className="w-28 font-semibold text-ink">{labelKo(d)}</span>
                  <input
                    type="time"
                    aria-label={`${labelKo(d)} 시작`}
                    value={sel[d].start}
                    disabled={readOnly}
                    onChange={(e) => setSel({ ...sel, [d]: { ...sel[d], start: e.target.value } })}
                    className="input !w-auto !py-1.5"
                  />
                  <span className="text-mist">–</span>
                  <input
                    type="time"
                    aria-label={`${labelKo(d)} 종료`}
                    value={sel[d].end}
                    disabled={readOnly}
                    onChange={(e) => setSel({ ...sel, [d]: { ...sel[d], end: e.target.value } })}
                    className="input !w-auto !py-1.5"
                  />
                  {locked.has(d) && <span className="text-xs text-mist">다시보기 있음</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
