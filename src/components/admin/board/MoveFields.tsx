"use client";

import { ChoiceChip } from "@/components/admin/ChoiceChip";
import { MATERIAL_SUBJECT_LABEL, MATERIAL_SUBJECTS, type MaterialSubject } from "@/lib/class-materials";
import { scopeLabel } from "@/lib/class-notices";
import { ROUND_MAX, ROUND_SET_LABEL, ROUND_SETS, type RoundSet } from "@/lib/class-rounds";

const ROUNDS = Array.from({ length: ROUND_MAX }, (_, k) => k + 1);

/** 공지 범위를 누구라고 부를까 — `650 RC 수강생` · `수강 중인 모든 학생` */
export const noticeWho = (scope: { levels: number[]; subjects: MaterialSubject[] }) =>
  scopeLabel(scope) === "전체" ? "수강 중인 모든 학생" : `${scopeLabel(scope)} 수강생`;

/**
 * 공지사항으로 옮길 때의 범위 — 레벨(여럿 · 비우면 모든 레벨) × 과목(RC · LC 모두 · 하나만).
 * 하나 옮기기 대화창(`MoveToClassButton`)과 여러 개 옮기기(`BoardBulkMove`)가 함께 쓴다 — 두 곳의 고르는 모양이 갈라지지 않게.
 */
export function NoticeScopeChips({
  levels,
  picked,
  onPicked,
  subject,
  onSubject,
  disabled,
}: {
  /** 교재 레벨 목록 (lc_levels) */
  levels: number[];
  picked: number[];
  onPicked: (levels: number[]) => void;
  subject: MaterialSubject | null;
  onSubject: (subject: MaterialSubject | null) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-10 shrink-0 text-xs font-bold text-mist">레벨</span>
        <ChoiceChip on={picked.length === 0} onClick={() => onPicked([])} disabled={disabled}>
          모든 레벨
        </ChoiceChip>
        {levels.map((l) => (
          <ChoiceChip
            key={l}
            on={picked.includes(l)}
            onClick={() => onPicked(picked.includes(l) ? picked.filter((x) => x !== l) : [...picked, l].sort((a, b) => a - b))}
            disabled={disabled}
          >
            {l}
          </ChoiceChip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-10 shrink-0 text-xs font-bold text-mist">과목</span>
        <ChoiceChip on={subject === null} onClick={() => onSubject(null)} disabled={disabled}>
          RC · LC 모두
        </ChoiceChip>
        {MATERIAL_SUBJECTS.map((s) => (
          <ChoiceChip key={s} on={subject === s} onClick={() => onSubject(s)} disabled={disabled}>
            {MATERIAL_SUBJECT_LABEL[s]}만
          </ChoiceChip>
        ))}
      </div>
    </>
  );
}

/** 회차 자료로 옮길 자리 — 레벨 · 과목 · 과정 · 회차 (안 고른 칸은 null) */
export type RoundPick = { level: number | null; subject: MaterialSubject | null; set: RoundSet | null; seq: number | null };

/** 아직 안 고른 칸 — 다 골랐으면 null */
export const roundMissing = (r: RoundPick) =>
  !r.subject ? "과목을 골라 주세요." : !r.set ? "과정을 골라 주세요." : !r.seq ? "회차를 골라 주세요." : r.level === null ? "레벨을 골라 주세요." : null;

/** 회차 자료 자리 고르기 — 네 칸 (하나 옮기기 · 여러 개 옮기기가 함께 쓴다) */
export function RoundSelects({ levels, value, onChange, disabled }: { levels: number[]; value: RoundPick; onChange: (next: RoundPick) => void; disabled: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1">
        <span className="text-xs font-bold text-mist">레벨</span>
        <select value={value.level ?? ""} onChange={(e) => onChange({ ...value, level: e.target.value ? Number(e.target.value) : null })} disabled={disabled} className="input">
          {levels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-mist">과목</span>
        <select value={value.subject ?? ""} onChange={(e) => onChange({ ...value, subject: (e.target.value || null) as MaterialSubject | null })} disabled={disabled} className="input">
          <option value="">고르기</option>
          {MATERIAL_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {MATERIAL_SUBJECT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-mist">과정</span>
        <select value={value.set ?? ""} onChange={(e) => onChange({ ...value, set: (e.target.value || null) as RoundSet | null })} disabled={disabled} className="input">
          <option value="">고르기</option>
          {ROUND_SETS.map((s) => (
            <option key={s} value={s}>
              {ROUND_SET_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-mist">회차</span>
        <select value={value.seq ?? ""} onChange={(e) => onChange({ ...value, seq: e.target.value ? Number(e.target.value) : null })} disabled={disabled} className="input">
          <option value="">고르기</option>
          {ROUNDS.map((n) => (
            <option key={n} value={n}>
              {n}회차
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
