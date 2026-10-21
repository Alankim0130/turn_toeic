"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/Dialog";
import { ChoiceChip } from "@/components/admin/ChoiceChip";
import { moveStaffPostToClass, planStaffPostsMove } from "@/app/admin/board/move-actions";
import { BULK_SKIP, bulkDraftOf, bulkSteps, classPlaceLabel, type BulkChoice, type BulkPost } from "@/lib/board-move";
import type { MaterialSubject } from "@/lib/class-materials";
import { cellValue } from "@/lib/staff-board";
import { BulkBar, BulkProgress, BulkProvider, BulkResult, useBulkRunner, useBulkSelection, type BulkNote } from "./BulkSelect";
import { NoticeScopeChips, noticeWho, RoundSelects, roundMissing, type RoundPick } from "./MoveFields";
import type { BoardTab } from "./StaffPostList";

type Kind = "notice" | "material" | "origin";
type Plan = { phase: "loading" } | { phase: "error"; error: string } | { phase: "ready"; posts: BulkPost[]; gone: BulkNote[] };

/**
 * 직원 게시판 → 수업자료실 **여러 개 한꺼번에** (2026-10-21 Alan — "자료를 넘길때 여러개를 한번에 선택해서 넘길수 있도록 하면 좋겠어. 그리고 전체선택도 같이 만들어줘").
 * 강사 · 관리자의 목록 화면만 감싼다 (조교는 옮기지 않는다). 줄마다 고르기 칸 · 맨 위 `전체 선택`(이 쪽 글), 고르면 아래 막대의 `수업자료실로 옮기기`.
 * 대화창을 열 때 서버가 고른 글을 읽어(`planStaffPostsMove` — 본문을 목록에서 읽지 않으려고) 사진 · 빈 글 · 원래 자리를 알려 준다.
 * 옮길 곳을 **한 번** 고른다 — 공지사항(같은 범위로 글마다 공지 하나씩) · 회차 자료(같은 회차에 모두) · 원래 자리로(수업자료실에서 옮겨 온 글은 그 자리로).
 * 글마다 옮길 곳 · 건너뛸 까닭은 `bulkSteps`, 처음 고를 값은 `bulkDraftOf`(글의 레벨 · 과목 · 과정, 서로 다르면 보던 탭 · 칸). 오래된 글부터 하나씩 옮긴다 (`useBulkRunner`).
 */
export function BoardBulkMove({
  items,
  levels,
  tab,
  children,
}: {
  /** 이 쪽에 선 글 — 고를 수 있는 것 (열쇠 `post:id`) */
  items: { key: string; id: number; title: string }[];
  /** 교재 레벨 목록 (lc_levels) */
  levels: number[];
  /** 보던 레벨 탭 · 칸(과목 × 과정) */
  tab: BoardTab;
  children: ReactNode;
}) {
  const keys = items.map((i) => i.key);
  const sel = useBulkSelection(keys);
  const runner = useBulkRunner();
  const [open, setOpen] = useState(false);
  // 대화창 제목의 글 수 — 연 때 고른 수 (끝난 뒤 못 옮긴 것만 골라 두어도 제목은 그대로)
  const [count, setCount] = useState(0);
  const [plan, setPlan] = useState<Plan>({ phase: "loading" });
  const [kind, setKind] = useState<Kind>("notice");
  const [picked, setPicked] = useState<number[]>([]);
  const [subject, setSubject] = useState<MaterialSubject | null>(null);
  const [round, setRound] = useState<RoundPick>({ level: null, subject: null, set: null, seq: null });
  // 대화창을 닫았다 다시 열면 앞 요청의 늦은 답을 버린다
  const request = useRef(0);
  const running = runner.state.phase === "running";

  async function openDialog() {
    const ids = items.filter((i) => sel.selected.has(i.key)).map((i) => i.id);
    if (ids.length === 0) return;
    const ticket = ++request.current;
    setCount(ids.length);
    runner.reset();
    setPlan({ phase: "loading" });
    setOpen(true);
    let res: Awaited<ReturnType<typeof planStaffPostsMove>>;
    try {
      res = await planStaffPostsMove(ids);
    } catch {
      res = { ok: false, error: "고른 글을 읽지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
    if (ticket !== request.current) return;
    if (!res.ok) return setPlan({ phase: "error", error: res.error });
    const found = new Set(res.posts.map((p) => p.id));
    const gone = items.filter((i) => ids.includes(i.id) && !found.has(i.id)).map((i) => ({ key: i.key, title: i.title, why: BULK_SKIP.gone }));
    const draft = bulkDraftOf(res.posts, tab.level, levels, tab.cell);
    setKind(draft.kind);
    setPicked(draft.notice.levels);
    setSubject(draft.notice.subjects.length === 1 ? draft.notice.subjects[0] : null);
    setRound({ ...draft.material, level: draft.material.level ?? levels[0] ?? null });
    setPlan({ phase: "ready", posts: res.posts, gone });
  }

  const close = () => {
    if (running) return;
    request.current += 1;
    setOpen(false);
    runner.reset();
  };

  const posts = plan.phase === "ready" ? plan.posts : [];
  const hasOrigin = posts.some((p) => p.movedFrom);
  const noticeScope = { levels: picked, subjects: subject ? [subject] : [] };
  const choice: BulkChoice | null =
    kind === "origin"
      ? { kind: "origin" }
      : kind === "notice"
        ? { kind: "notice", ...noticeScope }
        : round.level !== null && round.subject && round.set && round.seq
          ? { kind: "material", level: round.level, subject: round.subject, set: round.set, seq: round.seq }
          : null;
  const steps = choice ? bulkSteps(posts, choice, levels) : [];
  const movable = steps.filter((s) => s.target);
  const skipped = steps.filter((s) => !s.target);
  const missing = kind === "material" && !choice ? roundMissing(round) : null;
  const gone = plan.phase === "ready" ? plan.gone : [];

  async function start() {
    if (running || movable.length === 0) return;
    const jobs = movable.map((s) => ({
      key: `post:${s.id}`,
      title: s.title,
      run: () => moveStaffPostToClass({ id: s.id, target: s.target }, { quiet: true }),
    }));
    const notes = [...skipped.map((s) => ({ key: `post:${s.id}`, title: s.title, why: s.skip ?? "" })), ...gone];
    const outcome = await runner.run(jobs, notes);
    sel.keepOnly([...outcome.failed, ...outcome.notRun, ...outcome.skipped].map((n) => n.key));
  }

  /** 끝난 뒤 가 볼 곳 — 옮긴 자리의 수업자료실 (원래 자리로는 글마다 달라 첫 화면) */
  const noticeLevel = picked[0] ?? tab.level;
  // 공지는 그 과목 칸에서 보인다 (과목을 안 골랐으면 보던 칸 — 전체 공지는 어느 칸에나)
  const noticeCell = subject ? `${subject}-${tab.cell?.set ?? "A"}` : tab.cell ? cellValue(tab.cell) : null;
  const doneHref =
    kind === "material" && round.level !== null && round.subject && round.set
      ? `/admin/class-materials?level=${round.level}&cell=${round.subject}-${round.set}`
      : kind === "notice" && noticeLevel !== null
        ? `/admin/class-materials?level=${noticeLevel}${noticeCell ? `&cell=${noticeCell}` : ""}`
        : "/admin/class-materials";

  return (
    <BulkProvider value={{ selected: sel.selected, toggle: sel.toggle, setMany: sel.setMany, busy: running }}>
      {children}
      <BulkBar count={sel.selected.size} onClear={sel.clear}>
        <button type="button" onClick={openDialog} className="btn-primary !px-4 !py-2 text-sm">
          수업자료실로 옮기기
        </button>
      </BulkBar>
      <Dialog open={open} title={`고른 글 ${count}개 수업자료실로 옮기기`} onClose={close} dismissible={false}>
        {runner.state.phase === "running" ? (
          <BulkProgress state={runner.state} onStop={runner.stop} />
        ) : runner.state.phase === "done" ? (
          <BulkResult outcome={runner.state.outcome}>
            {runner.state.outcome.moved.length > 0 && (
              <Link href={doneHref} className="btn-primary" onClick={close}>
                수업자료실 보기
              </Link>
            )}
            <button type="button" onClick={close} className="btn-secondary">
              닫기
            </button>
          </BulkResult>
        ) : plan.phase === "loading" ? (
          <p role="status" className="py-4 text-ink-soft">
            고른 글을 확인하는 중…
          </p>
        ) : plan.phase === "error" ? (
          <div className="space-y-3">
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 font-bold text-red-700">
              {plan.error}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openDialog} className="btn-primary">
                다시 시도
              </button>
              <button type="button" onClick={close} className="btn-secondary">
                닫기
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-ink-soft">
              옮기면 <strong className="text-ink">직원 게시판에서는 빠지고</strong> 수업자료실에 올라가요. 학생에게 보이는 글이 되고, 글쓴이는 옮기는 사람이에요.
            </p>

            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-bold text-ink">어디로 옮길까요</legend>
              <div className="flex flex-wrap gap-1.5">
                <ChoiceChip on={kind === "notice"} onClick={() => setKind("notice")}>
                  공지사항
                </ChoiceChip>
                <ChoiceChip on={kind === "material"} onClick={() => setKind("material")}>
                  회차 자료
                </ChoiceChip>
                {hasOrigin && (
                  <ChoiceChip on={kind === "origin"} onClick={() => setKind("origin")}>
                    원래 자리로
                  </ChoiceChip>
                )}
              </div>
            </fieldset>

            {kind === "notice" ? (
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-sm font-bold text-ink">누구에게 보일까요</legend>
                <NoticeScopeChips levels={levels} picked={picked} onPicked={setPicked} subject={subject} onSubject={setSubject} disabled={false} />
                <p className="rounded-xl bg-brand-50 px-3 py-2 text-ink-soft">
                  글마다 공지 하나씩 올라가 옮기는 순간 <strong className="text-brand-700">{noticeWho(noticeScope)}</strong>에게 보여요. 지금 수강 중(개강일~종강일)인 학생만 봐요.
                </p>
              </fieldset>
            ) : kind === "material" ? (
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-sm font-bold text-ink">어느 회차에 올릴까요</legend>
                <RoundSelects levels={levels} value={round} onChange={setRound} disabled={false} />
                <p className="rounded-xl bg-brand-50 px-3 py-2 text-ink-soft">
                  {choice?.kind === "material" ? (
                    <>
                      모두 <strong className="text-brand-700">{classPlaceLabel(choice)}</strong>에 차례로 올라가요. 그 과정을 듣는 반의 {choice.seq}번째 수업일부터 학생에게 보여요.
                    </>
                  ) : (
                    "과목 · 과정 · 회차를 고르면 모두 그 회차에 올라가요. 그 회차 수업일부터 학생에게 보여요."
                  )}
                </p>
              </fieldset>
            ) : (
              <p className="rounded-xl bg-brand-50 px-3 py-2 text-ink-soft">
                수업자료실에서 옮겨 온 글은 <strong className="text-brand-700">옮겨 오기 전 자리</strong>(공지 범위 · 회차)로 돌아가요. 직원 게시판에서 쓴 글은 건너뛰어요.
              </p>
            )}

            {(choice || gone.length > 0) && (
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-ink">
                  옮길 글 <span className="tabular-nums text-brand-700">{movable.length}</span>개
                  {skipped.length + gone.length > 0 && (
                    <span className="font-semibold text-amber-800"> · 건너뛸 글 {skipped.length + gone.length}개</span>
                  )}
                </p>
                <ul className="max-h-56 space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-line p-2.5">
                  {steps.map((s) => (
                    <li key={s.id} className="min-w-0">
                      <p className={s.target ? "truncate text-sm font-bold text-ink" : "truncate text-sm font-bold text-mist line-through"}>{s.title}</p>
                      {s.skip ? (
                        <p className="text-xs text-amber-800">{s.skip}</p>
                      ) : (
                        kind === "origin" && s.target && <p className="text-xs text-slate">→ {classPlaceLabel(s.target)}</p>
                      )}
                    </li>
                  ))}
                  {gone.map((g) => (
                    <li key={g.key} className="min-w-0">
                      <p className="truncate text-sm font-bold text-mist line-through">{g.title}</p>
                      <p className="text-xs text-amber-800">{g.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" onClick={start} disabled={!choice || movable.length === 0} className="btn-primary">
                {movable.length > 0 ? `${movable.length}개 옮기기` : "옮길 글이 없어요"}
              </button>
              <button type="button" onClick={close} className="btn-secondary">
                취소
              </button>
              {missing && <span className="text-xs font-bold text-mist">{missing}</span>}
            </div>
          </div>
        )}
      </Dialog>
    </BulkProvider>
  );
}
