"use client";

import { useRef, useState, useTransition } from "react";
import { updateLectureSignup, type LectureSettingsState } from "@/app/admin/lectures/actions";
import { NoteTextarea } from "@/components/admin/class-materials/NoteTextarea";
import { noteTooLong } from "@/lib/class-materials";
import { LECTURE_CONDITIONS, lectureCondition, type LectureCondition } from "@/lib/lecture";
import { cn } from "@/lib/utils";

/**
 * 신청 받기 · 정원 · 신청 시작 · **신청 조건 · 안내** (2026-10-15 Alan — "특강마다 신청조건을 선택할 수 있으면 좋겠어. 1. 수업후기작성 2. 이미지참고 3. 조건없음 …
 * 특강신청에서 강사님들이 안내문구를 쓸 수 있는 공간이 있으면 좋겠어. 안내문쓰는 공간은 수업자료실에서 사용하는 그 해당 포멧을 그대로").
 * 특강 날짜·강사·종류는 반 편성 달력에서 정한다.
 *
 * - 안내 편집기는 수업자료실 안내와 **같은 것**(`NoteTextarea` — 굵게 · 밑줄 · 색 · 크기 · 줄 정렬 · 표, 5만 자)이다. 사진은 넣지 않는다 (수업자료실 안내와 같다).
 * - **보내기는 직접 한다** — `<form action>` 으로 보내면 React 19 가 끝난 뒤 폼을 초기화해 고르기 칸(조건 · 신청 받기)과 편집기의 숨은 값이 처음 모양으로 돌아간다
 *   (교재주문 폼과 같은 함정). 정원 · 신청 시작 칸은 값을 다시 그리지 않도록 ref 로 읽는다.
 * - 신청을 받지 않으면 조건 · 안내 칸을 숨기고 저장해도 그대로 둔다 (다시 켜면 돌아온다).
 */
export function LectureSignupForm({
  lectureId,
  signup,
  capacity,
  signupOpensAt,
  appliedCount,
  condition,
  notice,
}: {
  lectureId: number;
  signup: boolean;
  capacity: number | null;
  /** KST 로 맞춘 datetime-local 값 (YYYY-MM-DDTHH:mm) 또는 "" */
  signupOpensAt: string;
  appliedCount: number;
  condition: string;
  notice: string | null;
}) {
  const [state, setState] = useState<LectureSettingsState>({});
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(signup);
  const [cond, setCond] = useState<LectureCondition>(lectureCondition(condition));
  const capacityRef = useRef<HTMLInputElement>(null);
  const opensRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const id = `lecture-${lectureId}`;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = on ? (noteRef.current?.value ?? "") : undefined;
    const tooLong = note === undefined ? null : noteTooLong(note);
    if (tooLong) return setState({ error: tooLong });
    setState({});
    startTransition(async () => {
      setState(
        await updateLectureSignup({
          lectureId,
          signup: on,
          capacity: capacityRef.current?.value ?? "",
          signupOpensAt: opensRef.current?.value ?? "",
          condition: on ? cond : undefined,
          notice: note,
        }),
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-bold text-ink">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} disabled={pending} className="h-4 w-4 accent-brand-500" />
        신청 받기
      </label>

      {on && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="label">
                정원 <span className="font-semibold text-slate">(비우면 제한 없음)</span>
              </span>
              <input ref={capacityRef} inputMode="numeric" defaultValue={capacity ?? ""} placeholder="예: 40" disabled={pending} className="input !py-2 text-sm" />
            </label>
            <label className="block">
              <span className="label">
                신청 시작 <span className="font-semibold text-slate">(비우면 특강 7일 전 자정부터)</span>
              </span>
              <input ref={opensRef} type="datetime-local" defaultValue={signupOpensAt} disabled={pending} className="input !py-2 text-sm" />
            </label>
          </div>

          <fieldset>
            <legend className="label">신청 조건</legend>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {LECTURE_CONDITIONS.map((c) => (
                <label
                  key={c.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition",
                    cond === c.value ? "border-brand-500 bg-brand-50 font-bold text-ink" : "border-line bg-paper text-slate hover:border-brand-300",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-condition`}
                    value={c.value}
                    checked={cond === c.value}
                    onChange={() => setCond(c.value)}
                    disabled={pending}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold text-ink">{c.label}</span>
                    <span className="mt-0.5 block text-xs font-normal text-slate">{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {appliedCount > 0 && lectureCondition(condition) !== cond && (
              <p className="mt-1.5 text-xs font-semibold text-amber-700">이미 신청한 {appliedCount}명에게는 바뀐 조건을 다시 묻지 않아요. 저장한 뒤 들어오는 신청부터 적용돼요.</p>
            )}
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
              placeholder={"예: 녹화영상은 특강 다음 날 다시보기에 올라와요.\n시험지는 1층 데스크에서 받아 가세요."}
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-mist">
          {appliedCount > 0 ? `신청 ${appliedCount}명 — 정원을 이보다 적게 줄일 수 없어요` : "신청은 특강 당일까지 받습니다"}
        </p>
        <button type="submit" disabled={pending} className="btn-secondary !w-auto !px-4 !py-1.5 text-xs">
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>

      {state.error && <p className="text-xs font-semibold text-red-600">{state.error}</p>}
      {state.ok && state.message && <p className="text-xs font-semibold text-brand-600">{state.message}</p>}
    </form>
  );
}
