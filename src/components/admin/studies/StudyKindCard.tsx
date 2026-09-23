"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSlot, createStudy, deleteSlot, deleteStudy, updateSlot, updateStudy, type StudyActionState } from "@/app/admin/study/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { cn, formatTime } from "@/lib/utils";
import { isSlotKind, STUDY_KIND_DESC, STUDY_KIND_ICON, STUDY_KIND_LABEL, STUDY_STATUS_LABEL, type SlotLite } from "@/lib/study";
import type { PlannerStudy } from "./StudyPlanner";

const STATUS_OPTIONS = [
  { value: "draft", label: "준비 중", hint: "학생에게 안 보여요" },
  { value: "open", label: "신청 받기", hint: "신청·변경·취소 가능" },
  { value: "closed", label: "마감", hint: "보이지만 신청 불가" },
] as const;

const NOTICE_PLACEHOLDER: Record<string, string> = {
  offline: "예: 월~금 수업 후 7층 스터디룸 · 교재 지참",
  vocab: "예: 수업일마다 강의실 앞에서 단어 시험 · 단어장 범위는 수업 때 안내",
  online: "예: 풀이한 페이지를 사진으로 찍어 다음 수업 전까지 숙제업로드에 올려 주세요",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-line text-slate",
  open: "bg-brand-500 text-white",
  closed: "bg-ink text-white",
};

function Feedback({ state }: { state: StudyActionState }) {
  if (state.error) return <p className="text-xs font-semibold text-red-600">{state.error}</p>;
  if (state.ok && state.message) return <p className="text-xs font-semibold text-brand-600">{state.message}</p>;
  return null;
}

/* ─── 아직 없는 스터디: 열기 ─────────────────────────────────────────────── */
export function CreateStudyCard({ kind, termId, termLabel }: { kind: string; termId: number; termLabel: string }) {
  const [state, action] = useActionState<StudyActionState, FormData>(createStudy, {});
  return (
    <article className="flex h-full flex-col rounded-xl2 border border-dashed border-brand-200 bg-brand-50/40 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-paper ring-1 ring-brand-100">
          <Icon name={STUDY_KIND_ICON[kind]} size={28} />
        </span>
        <div>
          <h3 className="font-black text-ink">{STUDY_KIND_LABEL[kind]}</h3>
          <p className="text-xs text-slate">{termLabel}에는 아직 없어요</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate">{STUDY_KIND_DESC[kind]}</p>
      <form action={action} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="term_id" value={termId} />
        <input type="hidden" name="kind" value={kind} />
        <SubmitButton variant="secondary" pendingText="만드는 중…">
          {termLabel} {STUDY_KIND_LABEL[kind]} 열기
        </SubmitButton>
        <Feedback state={state} />
      </form>
    </article>
  );
}

/* ─── 있는 스터디: 상태·안내·시간대 ─────────────────────────────────────── */
export function StudyKindCard({ kind, study, termKey }: { kind: string; study: PlannerStudy; termKey: string }) {
  const slotKind = isSlotKind(kind);
  const needsSlots = slotKind && study.status === "open" && study.slots.length === 0;

  return (
    <article className="flex h-full flex-col rounded-xl2 border border-line bg-paper p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
            <Icon name={STUDY_KIND_ICON[kind]} size={28} />
          </span>
          <div>
            <h3 className="font-black text-ink">{STUDY_KIND_LABEL[kind]}</h3>
            <Link href={`/admin/study?term=${termKey}&kind=${kind}`} className="text-xs font-bold text-brand-600 hover:underline">
              신청 {study.signupCount}명 · 명단 보기
            </Link>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", STATUS_TONE[study.status] ?? STATUS_TONE.draft)}>
          {STUDY_STATUS_LABEL[study.status] ?? study.status}
        </span>
      </header>

      <StudySettingsForm kind={kind} study={study} />

      {needsSlots && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <Icon name="warning" size={16} />
          시간대가 없어서 학생이 신청할 수 없어요. 아래에서 시간대를 추가해 주세요.
        </p>
      )}

      {slotKind ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-sm font-black text-ink">
            시간대 <span className="font-semibold text-slate">({study.slots.length})</span>
          </p>
          {study.slots.length > 0 && (
            <ul className="mb-3 space-y-2">
              {study.slots.map((slot, i) => (
                <SlotRow key={slot.id} slot={slot} index={i} />
              ))}
            </ul>
          )}
          <AddSlotForm studyId={study.id} />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate">
            이 달에 들어간 자료 <strong className="text-ink">{study.materialCount}회차</strong> · 자료는 회차로 한 번 올리면 매달 수업일 순서대로 열려요. 신청한 수강생은 그 날짜부터 받아요.
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={`/admin/study-materials?term=${termKey}`} className="btn-primary !py-2">
              <Icon name="upload" size={18} className="brightness-0 invert" />
              날짜별 자료 올리기
            </Link>
            <Link href="/admin/homework" className="btn-secondary !py-2">
              <Icon name="homework" size={18} />
              숙제점검
            </Link>
          </div>
        </div>
      )}

      {study.signupCount === 0 && study.materialCount === 0 && <DeleteStudyForm id={study.id} label={STUDY_KIND_LABEL[kind]} />}
    </article>
  );
}

function StudySettingsForm({ kind, study }: { kind: string; study: PlannerStudy }) {
  const [state, action] = useActionState<StudyActionState, FormData>(updateStudy, {});
  const [status, setStatus] = useState(study.status);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="id" value={study.id} />
      <fieldset>
        <legend className="label">공개 상태</legend>
        <div className="grid grid-cols-3 gap-2">
          {STATUS_OPTIONS.map((o) => (
            <label key={o.value} className="cursor-pointer">
              <input
                type="radio"
                name="status"
                value={o.value}
                checked={status === o.value}
                onChange={() => setStatus(o.value)}
                className="peer sr-only"
              />
              <span className="block rounded-xl border border-line bg-paper px-2 py-2 text-center transition peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
                <span className="block text-sm font-black text-ink">{o.label}</span>
                <span className="block text-[11px] text-slate">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`notice-${study.id}`} className="label">
          안내 <span className="font-normal text-mist">(선택 · 장소·요일·준비물)</span>
        </label>
        <textarea
          id={`notice-${study.id}`}
          name="notice"
          rows={2}
          maxLength={1000}
          defaultValue={study.notice ?? ""}
          placeholder={NOTICE_PLACEHOLDER[kind]}
          className="input resize-y !py-2 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="dark" className="!py-2" pendingText="저장 중…">
          상태·안내 저장
        </SubmitButton>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function SlotRow({ slot, index }: { slot: SlotLite; index: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [state, action] = useActionState<StudyActionState, FormData>(updateSlot, {});
  const [pending, startTransition] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);

  // 수정 저장이 성공하면 보기 모드로 (렌더 중 파생 상태 갱신 패턴)
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setMode("view");
  }

  const full = slot.capacity !== null && slot.applied_count >= slot.capacity;

  const onDelete = () =>
    startTransition(async () => {
      const res = await deleteSlot(slot.id);
      if (res.ok) router.refresh();
      else setDelError(res.error ?? "삭제하지 못했어요.");
    });

  return (
    <li className="rounded-xl border border-line bg-surface px-3 py-2.5">
      {mode !== "edit" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-10 text-sm font-black text-brand-600">{index + 1}타임</span>
          <span className="font-bold tabular-nums text-ink">
            {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
          </span>
          <span className={cn("text-xs font-semibold", full ? "text-red-600" : "text-slate")}>
            신청 {slot.applied_count}
            {slot.capacity !== null ? ` / 정원 ${slot.capacity}명` : "명 · 정원 없음"}
            {full && " · 마감"}
          </span>
          {mode === "view" && (
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => setMode("edit")} className="btn-ghost !px-3 !py-1.5 text-xs">
                수정
              </button>
              <button type="button" onClick={() => { setDelError(null); setMode("confirm"); }} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50">
                삭제
              </button>
            </span>
          )}
        </div>
      ) : (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={slot.id} />
          <SlotInputs idPrefix={`slot-${slot.id}`} values={state.values ?? { start_time: formatTime(slot.start_time), end_time: formatTime(slot.end_time), capacity: slot.capacity?.toString() ?? "" }} />
          <div className="flex gap-1">
            <SubmitButton className="!px-4 !py-2" pendingText="저장 중…">
              저장
            </SubmitButton>
            <button type="button" onClick={() => setMode("view")} className="btn-ghost !px-3 !py-2 text-xs">
              취소
            </button>
          </div>
          <div className="w-full">
            <Feedback state={state} />
          </div>
        </form>
      )}

      {mode === "confirm" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50/60 p-2 text-xs">
          <span className="text-ink">
            {slot.applied_count > 0 ? `신청자 ${slot.applied_count}명이 있어서 지울 수 없어요. 신청자 명단에서 먼저 정리해 주세요.` : "이 시간대를 삭제할까요?"}
          </span>
          <span className="ml-auto flex gap-1">
            {slot.applied_count === 0 && (
              <button type="button" onClick={onDelete} disabled={pending} className="btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700">
                {pending ? "삭제 중…" : "삭제 확정"}
              </button>
            )}
            <button type="button" onClick={() => setMode("view")} className="btn-ghost !px-3 !py-1.5 text-xs">
              닫기
            </button>
          </span>
          {delError && <p className="w-full font-semibold text-red-600">{delError}</p>}
        </div>
      )}
    </li>
  );
}

function SlotInputs({ idPrefix, values }: { idPrefix: string; values: Record<string, string> }) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-start`} className="label !mb-1 text-xs">시작</label>
        <input id={`${idPrefix}-start`} name="start_time" type="time" required defaultValue={values.start_time} className="input !w-[7.5rem] !px-3 !py-2 text-sm" />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-end`} className="label !mb-1 text-xs">종료</label>
        <input id={`${idPrefix}-end`} name="end_time" type="time" required defaultValue={values.end_time} className="input !w-[7.5rem] !px-3 !py-2 text-sm" />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-cap`} className="label !mb-1 text-xs">정원 <span className="font-normal text-mist">(선택)</span></label>
        <input id={`${idPrefix}-cap`} name="capacity" type="number" min={1} max={500} inputMode="numeric" placeholder="제한 없음" defaultValue={values.capacity} className="input !w-[6.5rem] !px-3 !py-2 text-sm" />
      </div>
    </>
  );
}

function AddSlotForm({ studyId }: { studyId: number }) {
  const [state, action] = useActionState<StudyActionState, FormData>(addSlot, {});
  return (
    <form action={action} className="rounded-xl border border-dashed border-line p-3">
      <input type="hidden" name="study_id" value={studyId} />
      <p className="mb-2 text-xs font-bold text-slate">시간대 추가</p>
      <div className="flex flex-wrap items-end gap-2">
        <SlotInputs idPrefix={`new-${studyId}`} values={state.error ? (state.values ?? {}) : {}} />
        <SubmitButton variant="secondary" className="!px-4 !py-2" pendingText="추가 중…">
          + 추가
        </SubmitButton>
      </div>
      <div className="mt-1.5">
        <Feedback state={state} />
      </div>
    </form>
  );
}

function DeleteStudyForm({ id, label }: { id: number; label: string }) {
  const [state, action] = useActionState<StudyActionState, FormData>(deleteStudy, {});
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mt-4 border-t border-line pt-3 text-xs">
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="font-semibold text-mist hover:text-red-600">
          이 달 {label} 없애기
        </button>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <span className="text-ink">시간대와 안내가 함께 지워져요. 삭제할까요?</span>
          <SubmitButton variant="dark" className="!bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700" pendingText="삭제 중…">
            삭제
          </SubmitButton>
          <button type="button" onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
            취소
          </button>
          <Feedback state={state} />
        </form>
      )}
    </div>
  );
}
