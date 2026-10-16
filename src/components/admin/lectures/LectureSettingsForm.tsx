"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLectureSettings, type LectureSettingsState } from "@/app/admin/lectures/actions";
import { NoteTextarea } from "@/components/admin/class-materials/NoteTextarea";
import { noteTooLong } from "@/lib/class-materials";
import { LECTURE_CONDITIONS, lectureCondition, lectureConditionOf, type LectureCondition } from "@/lib/lecture";
import { cn } from "@/lib/utils";

export type WaySetting = {
  way: string;
  label: string;
  enabled: boolean;
  capacity: number | null;
  condition: string;
  applied: number;
};

type Draft = { enabled: boolean; capacity: string; condition: LectureCondition };

/**
 * **특강 설정** 한 특강 (2026-10-16 Alan — "특강설정 버튼을 특강신청에 하나 넣어놓고 해당 버튼을 누르면 종류별로 설정할 수 있도록").
 * 신청 방식마다 **받기 · 신청 조건 · 정원**, 그리고 학생 특강 카드에 보이는 **안내**. 신청 받기 · 취소는 위의 버튼이 따로 한다 (누르는 순간 저장).
 *
 * - 안내 편집기는 수업자료실 안내와 **같은 것**(`NoteTextarea` — 굵게 · 밑줄 · 색 · 크기 · 줄 정렬 · 표, 5만 자)이다. 사진은 넣지 않는다.
 * - **보내기는 직접 한다** — `<form action>` 으로 보내면 React 19 가 끝난 뒤 폼을 초기화해 체크 · 고르기 칸과 편집기의 숨은 값이 처음 모양으로 돌아간다
 *   (교재주문 폼과 같은 함정). 칸은 상태로 쥐고, 편집기는 ref 로 읽는다.
 */
export function LectureSettingsForm({ lectureId, ways, notice }: { lectureId: number; ways: WaySetting[]; notice: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<LectureSettingsState>({});
  const [pending, startTransition] = useTransition();
  const initial = (w: WaySetting): Draft => ({ enabled: w.enabled, capacity: w.capacity === null ? "" : String(w.capacity), condition: lectureCondition(w.condition) });
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(ways.map((w) => [w.way, initial(w)])));
  const draftOf = (w: WaySetting) => drafts[w.way] ?? initial(w);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const id = `lecture-${lectureId}`;
  const set = (w: WaySetting, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [w.way]: { ...(d[w.way] ?? initial(w)), ...patch } }));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = noteRef.current?.value ?? "";
    const tooLong = noteTooLong(note);
    if (tooLong) return setState({ error: tooLong });
    setState({});
    startTransition(async () => {
      const res = await updateLectureSettings({
        lectureId,
        ways: ways.map((w) => {
          const d = draftOf(w);
          return { way: w.way, enabled: d.enabled, capacity: d.capacity, condition: d.condition };
        }),
        notice: note,
      });
      setState(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset>
        <legend className="label">신청 방식</legend>
        <div className="space-y-2">
          {ways.map((w) => {
            const d = draftOf(w);
            const changedCondition = w.applied > 0 && lectureCondition(w.condition) !== d.condition;
            return (
              <div key={w.way} className={cn("rounded-xl border px-3 py-3 transition", d.enabled ? "border-brand-300 bg-paper" : "border-line bg-surface")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-black text-ink">
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) => set(w, { enabled: e.target.checked })}
                      disabled={pending}
                      className="h-4 w-4 accent-brand-500"
                    />
                    {w.label}
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", d.enabled ? "bg-brand-50 text-brand-700" : "bg-line text-slate")}>
                      {d.enabled ? "받음" : "안 받음"}
                    </span>
                  </label>
                  <span className="text-xs font-semibold text-slate">신청 {w.applied}명</span>
                </div>
                <div className={cn("mt-2 grid gap-2 sm:grid-cols-[1fr_9rem]", !d.enabled && "opacity-60")}>
                  <label className="block min-w-0">
                    <span className="text-xs font-bold text-slate">신청 조건</span>
                    <select
                      value={d.condition}
                      onChange={(e) => set(w, { condition: lectureCondition(e.target.value) })}
                      disabled={pending}
                      className="input mt-1 !py-2 text-sm"
                    >
                      {LECTURE_CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate">정원</span>
                    <input
                      value={d.capacity}
                      onChange={(e) => set(w, { capacity: e.target.value })}
                      inputMode="numeric"
                      placeholder="제한 없음"
                      disabled={pending}
                      className="input mt-1 !py-2 text-sm"
                    />
                  </label>
                </div>
                <p className="mt-1.5 text-xs text-slate">{lectureConditionOf(d.condition).hint}</p>
                {changedCondition && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">이미 신청한 {w.applied}명에게는 바뀐 조건을 다시 묻지 않아요. 저장한 뒤 들어오는 신청부터 적용돼요.</p>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${id}-notice`} className="label">
          안내 <span className="font-semibold text-slate">(선택 — 학생 특강 카드에 그대로 보여요)</span>
        </label>
        <NoteTextarea
          id={`${id}-notice`}
          ref={noteRef}
          defaultValue={notice ?? ""}
          disabled={pending}
          placeholder={"예: 시험지는 1층 데스크에서 받아 가세요.\n수업영상은 특강 다음 날 보내 드려요."}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {state.error && <p className="mr-auto text-xs font-semibold text-red-600">{state.error}</p>}
        {state.ok && state.message && <p className="mr-auto text-xs font-semibold text-brand-600">{state.message}</p>}
        <button type="submit" disabled={pending} className="btn-primary !w-auto !px-5 !py-2 text-sm">
          {pending ? "저장 중…" : "설정 저장"}
        </button>
      </div>
    </form>
  );
}
