"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { ChoiceChip } from "@/components/admin/ChoiceChip";
import { moveStaffPostToClass } from "@/app/admin/board/move-actions";
import { classPlaceLabel, type MoveDraft, type MoveTarget } from "@/lib/board-move";
import { MATERIAL_SUBJECT_LABEL, MATERIAL_SUBJECTS, type MaterialSubject } from "@/lib/class-materials";
import { scopeLabel } from "@/lib/class-notices";
import { ROUND_MAX, ROUND_SET_LABEL, ROUND_SETS, type RoundSet } from "@/lib/class-rounds";

const ROUNDS = Array.from({ length: ROUND_MAX }, (_, k) => k + 1);

/**
 * 직원 글 → 수업자료실 옮기기 (2026-10-21 Alan — "이 게시물을 수업게시판으로 옮길 수 있으면 좋겠어"). 강사 · 관리자에게만 보인다.
 * 옮길 곳은 둘 — **공지사항**(범위 레벨 × RC/LC, 그 수강생에게 바로 보인다) · **회차 자료**(레벨 × 과목 × 과정 × 회차, 그 회차 수업일부터).
 * 처음 고른 값은 `moveDraftOf` — 수업자료실에서 옮겨 온 글이면 원래 자리, 아니면 글의 레벨로 공지사항.
 * 회차 자료 안내에는 사진을 넣을 수 없어 사진이 든 글은 회차 자료를 고를 수 없다 (`materialBlock` — 서버가 같은 말로 다시 막는다).
 * 옮기면 직원 게시판에서는 빠지고 옮긴 자리 화면으로 간다.
 */
export function MoveToClassButton({
  id,
  levels,
  draft,
  materialBlock,
}: {
  id: number;
  /** 교재 레벨 목록 (lc_levels) */
  levels: number[];
  draft: MoveDraft;
  /** 회차 자료로 못 가는 까닭 (`materialMoveBlock`) — 없으면 null */
  materialBlock: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"notice" | "material">(draft.kind === "material" && !materialBlock ? "material" : "notice");
  const [picked, setPicked] = useState<number[]>(draft.notice.levels);
  const [subject, setSubject] = useState<MaterialSubject | null>(draft.notice.subjects.length === 1 ? draft.notice.subjects[0] : null);
  const [mLevel, setMLevel] = useState<number | null>(draft.material.level ?? levels[0] ?? null);
  const [mSubject, setMSubject] = useState<MaterialSubject | null>(draft.material.subject);
  const [mSet, setMSet] = useState<RoundSet | null>(draft.material.set);
  const [mSeq, setMSeq] = useState<number | null>(draft.material.seq);

  const noticeScope = { levels: picked, subjects: subject ? [subject] : [] };
  const who = scopeLabel(noticeScope) === "전체" ? "수강 중인 모든 학생" : `${scopeLabel(noticeScope)} 수강생`;
  const target: MoveTarget | null =
    kind === "notice"
      ? { kind: "notice", ...noticeScope }
      : mLevel !== null && mSubject && mSet && mSeq
        ? { kind: "material", level: mLevel, subject: mSubject, set: mSet, seq: mSeq }
        : null;
  const missing =
    kind === "material" && !target ? (materialBlock ? null : !mSubject ? "과목을 골라 주세요." : !mSet ? "과정을 골라 주세요." : !mSeq ? "회차를 골라 주세요." : "레벨을 골라 주세요.") : null;

  async function move() {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    const res = await moveStaffPostToClass({ id, target });
    if (!res.ok) {
      setBusy(false);
      return setError(res.error ?? "옮기지 못했어요.");
    }
    router.push(res.href ?? "/admin/class-materials");
    router.refresh();
  }

  const close = () => {
    if (!busy) setOpen(false);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary">
        수업자료실로 옮기기
      </button>
      <Dialog open={open} title="수업자료실로 옮기기" onClose={close} dismissible={false}>
        <div className="space-y-4">
          <p className="text-ink-soft">
            옮기면 <strong className="text-ink">직원 게시판에서는 빠지고</strong> 수업자료실에 올라가요. 학생에게 보이는 글이 되고, 글쓴이는 옮기는 사람이에요.
          </p>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-bold text-ink">어디로 옮길까요</legend>
            <div className="flex flex-wrap gap-1.5">
              <ChoiceChip on={kind === "notice"} onClick={() => setKind("notice")} disabled={busy}>
                공지사항
              </ChoiceChip>
              <ChoiceChip on={kind === "material"} onClick={() => setKind("material")} disabled={busy}>
                회차 자료
              </ChoiceChip>
            </div>
          </fieldset>

          {kind === "notice" ? (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-bold text-ink">누구에게 보일까요</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-10 shrink-0 text-xs font-bold text-mist">레벨</span>
                <ChoiceChip on={picked.length === 0} onClick={() => setPicked([])} disabled={busy}>
                  모든 레벨
                </ChoiceChip>
                {levels.map((l) => (
                  <ChoiceChip
                    key={l}
                    on={picked.includes(l)}
                    onClick={() => setPicked((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l].sort((a, b) => a - b)))}
                    disabled={busy}
                  >
                    {l}
                  </ChoiceChip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-10 shrink-0 text-xs font-bold text-mist">과목</span>
                <ChoiceChip on={subject === null} onClick={() => setSubject(null)} disabled={busy}>
                  RC · LC 모두
                </ChoiceChip>
                {MATERIAL_SUBJECTS.map((s) => (
                  <ChoiceChip key={s} on={subject === s} onClick={() => setSubject(s)} disabled={busy}>
                    {MATERIAL_SUBJECT_LABEL[s]}만
                  </ChoiceChip>
                ))}
              </div>
              <p className="rounded-xl bg-brand-50 px-3 py-2 text-ink-soft">
                옮기는 순간 <strong className="text-brand-700">{who}</strong>에게 공지로 보여요. 지금 수강 중(개강일~종강일)인 학생만 봐요.
              </p>
            </fieldset>
          ) : materialBlock ? (
            <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-800">
              {materialBlock}
            </p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-bold text-ink">어느 회차에 올릴까요</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-mist">레벨</span>
                  <select value={mLevel ?? ""} onChange={(e) => setMLevel(e.target.value ? Number(e.target.value) : null)} disabled={busy} className="input">
                    {levels.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-mist">과목</span>
                  <select value={mSubject ?? ""} onChange={(e) => setMSubject((e.target.value || null) as MaterialSubject | null)} disabled={busy} className="input">
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
                  <select value={mSet ?? ""} onChange={(e) => setMSet((e.target.value || null) as RoundSet | null)} disabled={busy} className="input">
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
                  <select value={mSeq ?? ""} onChange={(e) => setMSeq(e.target.value ? Number(e.target.value) : null)} disabled={busy} className="input">
                    <option value="">고르기</option>
                    {ROUNDS.map((n) => (
                      <option key={n} value={n}>
                        {n}회차
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="rounded-xl bg-brand-50 px-3 py-2 text-ink-soft">
                {target?.kind === "material" ? (
                  <>
                    <strong className="text-brand-700">{classPlaceLabel(target)}</strong>에 올라가요. 그 과정을 듣는 반의 {target.seq}번째 수업일부터 학생에게 보여요.
                  </>
                ) : (
                  "과목 · 과정 · 회차를 고르면 그 회차 수업일부터 학생에게 보여요."
                )}
              </p>
            </fieldset>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 font-bold text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={move} disabled={busy || !target || (kind === "material" && !!materialBlock)} className="btn-primary">
              {busy ? "옮기는 중…" : "옮기기"}
            </button>
            <button type="button" onClick={close} disabled={busy} className="btn-secondary">
              취소
            </button>
            {missing && <span className="text-xs font-bold text-mist">{missing}</span>}
          </div>
        </div>
      </Dialog>
    </>
  );
}
