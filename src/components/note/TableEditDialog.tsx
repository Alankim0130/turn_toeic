"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { cleanCellText, type NoteTable } from "@/lib/note-format";
import { cn } from "@/lib/utils";

/**
 * 붙여 넣은 표의 칸 글자 고치기 (2026-10-07 — 안내 · 공지의 표). 표 모양(합친 칸 · 정렬 · 머리칸)은 그대로 두고 **칸 글자만** 고친다 —
 * 줄 · 칸을 더하거나 합치는 일은 원래 표에서 하고 다시 붙여 넣는다 (블로그 편집기를 통째로 옮겨 오지 않는다).
 * 팝업이 화면을 덮어 고치는 동안 편집기 글이 바뀌지 않는다 — 그래서 표 자리(offset)가 그대로다.
 * 폼 안에서 열리므로 버튼은 `type="button"`, 칸에는 name 을 두지 않는다 (폼 값에 섞이지 않게).
 */
export function TableEditDialog({ table, onApply, onClose }: { table: NoteTable; onApply: (table: NoteTable) => void; onClose: () => void }) {
  const [texts, setTexts] = useState(() => table.rows.map((row) => row.map((c) => c.text)));
  const setText = (i: number, j: number, v: string) => setTexts((prev) => prev.map((row, a) => (a === i ? row.map((t, b) => (b === j ? v : t)) : row)));

  function apply() {
    onApply({ rows: table.rows.map((row, i) => row.map((c, j) => ({ ...c, text: cleanCellText(texts[i][j]).trim() }))) });
  }

  return (
    <Dialog open title="표 칸 글자 고치기" onClose={onClose} wide>
      <p className="text-xs text-slate">칸 글자만 고쳐요. 칸 안에서 줄을 바꿀 수 있어요. 줄 · 칸을 더하거나 합치려면 원래 표를 고쳐 다시 붙여 넣어 주세요.</p>
      <div className="mt-3 max-w-full overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((c, j) => (
                  <td key={j} rowSpan={c.rowspan} colSpan={c.colspan} className={cn("border border-slate-300 p-1 align-top", c.head && "bg-brand-50")}>
                    <textarea
                      value={texts[i][j]}
                      onChange={(e) => setText(i, j, e.currentTarget.value)}
                      rows={Math.min(8, Math.max(1, texts[i][j].split("\n").length))}
                      aria-label={`${i + 1}번째 줄 ${j + 1}번째 칸`}
                      className={cn(
                        "block w-full min-w-24 resize-y rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm leading-snug text-ink outline-none focus:border-brand-300 focus:bg-white",
                        c.align === "center" && "text-center",
                        c.align === "right" && "text-right",
                        c.head && "font-bold",
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary !py-2 text-sm">
          취소
        </button>
        <button type="button" onClick={apply} className="btn-primary !py-2 text-sm">
          적용
        </button>
      </div>
    </Dialog>
  );
}
