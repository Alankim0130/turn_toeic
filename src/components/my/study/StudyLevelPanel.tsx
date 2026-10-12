"use client";

import { useActionState, useState } from "react";
import { cancelStudyLevelRequest, requestStudyLevel, type SignupState } from "@/app/(public)/study/actions";
import { LevelPicker } from "@/app/(public)/study/StudySignupButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn, formatDate } from "@/lib/utils";
import { isSlotFull, isSlotKind, slotTime, sortSlots, studyLevelLabel, type SlotLite } from "@/lib/study";

/**
 * 내 스터디 카드의 **레벨 칸** (2026-10-12 Alan — "레벨은 학생이 직접 고르는걸로 … 학생이 스터디 레벨을 변경하고 싶다면 신청한 후
 * 조교나 강사승인이 있어야지 변경이 가능하도록"). 셋 중 하나다:
 *  - 레벨이 아직 없다(레벨이 생기기 전 신청): 고르면 **바로** 정해진다 (DB 함수 set_study_level — 승인 없이 한 번).
 *  - 변경 요청 중: 요청한 레벨과 시각, 요청 취소.
 *  - 레벨이 있다: `레벨 바꾸기` 를 누르면 다른 레벨(단어 스터디는 다른 레벨의 시간대)을 골라 **요청**한다 — 조교 · 강사가 승인하면 바뀐다.
 * 마지막 요청의 결과(바뀌었어요 · 거절됐어요)는 요청이 없을 때 한 줄로 보인다. 알림은 가지 않는다 — 여기서 본다.
 */
export function StudyLevelPanel({
  signupId,
  kind,
  level,
  slotId,
  requestedLevel,
  requestedSlotId,
  requestedAt,
  requestResult,
  requestDecidedAt,
  levels,
  slots,
  canRequest,
}: {
  signupId: number;
  kind: string;
  level: number | null;
  slotId: number | null;
  requestedLevel: number | null;
  requestedSlotId: number | null;
  requestedAt: string | null;
  requestResult: string | null;
  requestDecidedAt: string | null;
  /** 이 스터디에서 고를 수 있는 레벨 (단어 1 · 2, 비대면 1 · 2 · 3) */
  levels: readonly number[];
  /** 단어 스터디의 시간대 (레벨 포함). 비대면은 빈 배열 */
  slots: SlotLite[];
  /** 지금 수강 중인 달인가 — 아니면 보여 주기만 한다 */
  canRequest: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null); // 비대면: 레벨 · 단어: 시간대 id
  const [state, action] = useActionState<SignupState, FormData>(requestStudyLevel, {});
  const [cancelState, cancelAction] = useActionState<SignupState, FormData>(cancelStudyLevelRequest, {});
  const slotKind = isSlotKind(kind);
  const pending = requestedLevel != null;
  const short = (iso: string) => formatDate(iso, { month: "numeric", day: "numeric" });
  const requestedSlot = slots.find((s) => s.id === requestedSlotId) ?? null;

  // 고를 수 있는 것 — 비대면은 지금 레벨을 뺀 레벨들, 단어 스터디는 레벨이 있는 다른 시간대 (레벨이 없는 신청은 전부)
  const choiceLevels = levels.filter((l) => l !== level);
  const choiceSlots = sortSlots(slots).filter((s) => s.level != null && s.id !== slotId && (level == null || s.level !== level));
  const pickedSlot = choiceSlots.find((s) => s.id === picked) ?? null;

  const form = (
    <form action={action} className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-3">
      <input type="hidden" name="signup_id" value={signupId} />
      <input type="hidden" name="level" value={!slotKind && picked != null ? picked : ""} />
      <input type="hidden" name="slot_id" value={slotKind && picked != null ? picked : ""} />
      <p className="text-xs font-bold text-ink">{level == null ? "내 레벨을 골라 주세요" : slotKind ? "옮길 시간대를 골라 주세요" : "바꿀 레벨을 골라 주세요"}</p>
      {slotKind ? (
        choiceSlots.length === 0 ? (
          <p className="text-xs text-slate">고를 수 있는 다른 레벨의 시간대가 아직 없어요.</p>
        ) : (
          <ul className="space-y-1.5" role="radiogroup" aria-label="시간대">
            {choiceSlots.map((s) => {
              const full = isSlotFull(s);
              return (
                <li key={s.id}>
                  <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", picked === s.id ? "border-brand-400 bg-brand-50" : "border-line bg-paper", full && "cursor-not-allowed opacity-50")}>
                    <input type="radio" name="slot-pick" value={s.id} checked={picked === s.id} onChange={() => setPicked(s.id)} disabled={full} className="accent-brand-500" />
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">{studyLevelLabel(s.level)}</span>
                    <span className="font-bold tabular-nums text-ink">{slotTime(s)}</span>
                    <span className="text-xs text-slate">{s.capacity !== null ? `정원 ${s.capacity}명 · ${s.applied_count}명` : `${s.applied_count}명`}{full && " · 마감"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <LevelPicker name={`level-pick-${signupId}`} levels={choiceLevels} value={picked} onChange={setPicked} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate">
          {level == null
            ? "고르면 바로 정해져요."
            : `조교 · 강사가 승인하면 바뀌어요.${slotKind && pickedSlot ? ` (${studyLevelLabel(pickedSlot.level)} · ${slotTime(pickedSlot)})` : ""}`}
        </span>
        <span className="flex gap-1">
          <SubmitButton className="!w-auto !px-4 !py-2 text-xs" pendingText="처리 중…" disabled={picked == null}>
            {level == null ? "이 레벨로 정하기" : "변경 요청"}
          </SubmitButton>
          {level != null && (
            <button type="button" onClick={() => { setOpen(false); setPicked(null); }} className="btn-ghost !px-3 !py-2 text-xs">
              닫기
            </button>
          )}
        </span>
      </div>
      {state.error && <p className="text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate">내 레벨</span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-black", level == null ? "bg-amber-100 text-amber-800" : "bg-brand-500 text-white")}>{studyLevelLabel(level)}</span>
        {pending && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            {studyLevelLabel(requestedLevel)}
            {requestedSlot ? ` · ${slotTime(requestedSlot)}` : ""}
            {"(으)로 변경 요청 중"}
            {requestedAt ? ` · ${short(requestedAt)}` : ""}
          </span>
        )}
        {!pending && level != null && canRequest && !open && (
          <button type="button" onClick={() => { setOpen(true); setPicked(null); }} className="btn-ghost !px-3 !py-1 text-xs">
            레벨 바꾸기
          </button>
        )}
      </div>

      {/* 마지막 요청의 결과 — 새 요청을 내면 사라진다 */}
      {!pending && requestResult === "approved" && (
        <p className="mt-1.5 text-xs font-semibold text-brand-700">
          변경 요청이 승인돼 {studyLevelLabel(level)}(으)로 바뀌었어요{requestDecidedAt ? ` · ${short(requestDecidedAt)}` : ""}.
        </p>
      )}
      {!pending && requestResult === "rejected" && (
        <p className="mt-1.5 text-xs font-semibold text-amber-800">
          변경 요청이 거절됐어요{requestDecidedAt ? ` · ${short(requestDecidedAt)}` : ""}. 궁금한 점은 선생님께 물어봐 주세요.
        </p>
      )}
      {state.ok && !pending && level != null && !state.applied && <p className="mt-1.5 text-xs font-semibold text-brand-700">변경을 요청했어요. 조교 · 강사가 승인하면 바뀌어요.</p>}

      {pending && canRequest && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-slate">조교 · 강사가 승인하면 바뀌어요. 그때까지는 지금 레벨의 자료를 받아요.</p>
          <form action={cancelAction} className="flex flex-col items-end gap-1">
            <input type="hidden" name="signup_id" value={signupId} />
            <SubmitButton variant="secondary" className="!w-auto !px-3 !py-1.5 text-xs" pendingText="취소 중…">
              요청 취소
            </SubmitButton>
            {cancelState.error && <p className="text-xs font-semibold text-red-600">{cancelState.error}</p>}
          </form>
        </div>
      )}

      {/* 레벨이 없으면 늘 고르기 칸 · 있으면 `레벨 바꾸기` 를 눌렀을 때 */}
      {canRequest && !pending && (level == null || open) && form}
      {!canRequest && level == null && <p className="mt-1.5 text-xs text-slate">수강 중인 달에 내 스터디에서 레벨을 고를 수 있어요.</p>}
    </div>
  );
}
