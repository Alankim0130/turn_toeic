"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ClassMaterialUpload } from "@/components/admin/class-materials/ClassMaterialUpload";
import { ClassMaterialRow, type ClassMaterialLite } from "@/components/admin/class-materials/ClassMaterialRow";
import { MATERIAL_SUBJECT_LABEL, type MaterialSubject } from "@/lib/class-materials";
import { ROUND_SET_LABEL, type RoundSet } from "@/lib/class-rounds";
import { cn } from "@/lib/utils";

/**
 * 수업자료실 관리 — 회차 한 줄 (2026-10-05 Alan "과정 · 회차마다"). 그 회차에 올린 자료들 + `올리기`(누르면 그 자리에 폼).
 * 날짜는 위에서 고른 달의 이 과정 반의 회차 수업일이다 — 학생에게는 그날 열린다.
 */
export function ClassMaterialRound({
  level,
  subject,
  set,
  seq,
  dateLabel,
  opened,
  items,
  levels,
  disabled,
}: {
  level: number;
  subject: MaterialSubject;
  set: RoundSet;
  seq: number;
  /** "10/12(월) 열림 예정" · "10월엔 이 회차 수업이 없어요" — 달을 못 정했으면 null */
  dateLabel: string | null;
  opened: boolean;
  items: ClassMaterialLite[];
  levels: number[];
  disabled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const cellLabel = `${level} ${MATERIAL_SUBJECT_LABEL[subject]} ${ROUND_SET_LABEL[set]} ${seq}회차`;
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-black tabular-nums text-white">{seq}회차</span>
        {dateLabel && <span className={cn("text-xs font-bold", opened ? "text-brand-700" : "text-slate")}>{dateLabel}</span>}
        {!disabled && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-ghost ml-auto !px-3 !py-1.5 text-xs">
            <Icon name="upload" size={14} />
            올리기
          </button>
        )}
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((m) => (
            <ClassMaterialRow key={`${m.id}-${m.updated_at}`} item={m} levels={levels} disabled={disabled} plain />
          ))}
        </ul>
      ) : (
        !adding && <p className="mt-2 text-xs text-mist">올린 자료가 없어요.</p>
      )}

      {adding && (
        <ClassMaterialUpload
          level={level}
          subject={subject}
          set={set}
          seq={seq}
          cellLabel={cellLabel}
          onClose={() => setAdding(false)}
        />
      )}
    </li>
  );
}
