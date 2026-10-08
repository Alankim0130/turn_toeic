"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sendHomeworkMissingNotice } from "@/app/admin/homework/missing/actions";
import { Alert } from "@/components/ui/Alert";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { SUBJECT_LABEL, type HomeworkSubject } from "@/lib/homework";
import {
  HOMEWORK_MISSING_TITLE,
  homeworkMissingMessage,
  MISSING_STATUS_LABEL,
  MISSING_TITLE_MAX,
  missingStatus,
  type MissingCell,
  type MissingRow,
  type MissingStatus,
} from "@/lib/homework-missing";
import { cn, TRACK_LABEL } from "@/lib/utils";

export type MissingColumnView = {
  date: string;
  seq: number;
  track: string | null;
  subjects: HomeworkSubject[];
  /** "10/9" */
  md: string;
  /** "목" */
  weekday: string;
  isToday: boolean;
  past: boolean;
};
export type MissingRowView = MissingRow & {
  /** 이 레벨에서 마지막으로 미제출 알림을 받은 때 — "오늘 14:20" · "10/8" */
  sent: string | null;
};
export type MissingGroupView = { key: string; classes: string[]; columns: MissingColumnView[]; rows: MissingRowView[] };

/** 제출률 단계의 색 — 구조는 첫토익, 색은 우리 핫핑크 */
const STATUS_DOT: Record<MissingStatus, string> = { perfect: "bg-brand-500", good: "bg-brand-300", warn: "bg-amber-400", risk: "bg-red-500", none: "bg-line" };
const STATUS_BADGE: Record<MissingStatus, string> = {
  perfect: "bg-brand-500 text-white",
  good: "bg-brand-100 text-brand-700",
  warn: "bg-amber-100 text-amber-800",
  risk: "bg-red-100 text-red-700",
  none: "bg-surface text-mist",
};
const CELL_LABEL: Record<MissingCell, string> = { done: "냄", missing: "안 냄", upcoming: "아직 (오늘 · 앞으로)", none: "해당 없음 (반에 들어오기 전)" };

/** 칸 하나 — 도형(인라인 SVG)이다. 이모지 · 그림 파일을 쓰지 않는다 (14px 에서 또렷하고 색을 바꿀 수 있게) */
function CellMark({ kind, label }: { kind: MissingCell; label?: string }) {
  return (
    <span role="img" aria-label={label ?? CELL_LABEL[kind]} title={label ?? CELL_LABEL[kind]} className="flex size-4 shrink-0 items-center justify-center">
      {kind === "done" ? (
        <svg viewBox="0 0 16 16" className="size-4 text-brand-500" aria-hidden>
          <circle cx="8" cy="8" r="8" fill="currentColor" />
          <path d="M4.6 8.4l2.2 2.2 4.6-4.9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : kind === "missing" ? (
        // 안은 칠하지 않는다 — 연한 빨강을 채웠더니 휴대폰에서 × 가 묻혀 보기 힘들었다 (2026-10-08 Alan "x표시 안에 음영이 들어가니 보기 힘들어")
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <circle cx="8" cy="8" r="7.25" fill="none" stroke="#ef4444" strokeWidth="1.5" />
          <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : kind === "upcoming" ? (
        <span className="block h-0.5 w-2.5 rounded-full bg-mist/70" />
      ) : (
        <span className="block size-1 rounded-full bg-line" />
      )}
    </span>
  );
}

/**
 * **숙제 미제출 알림** 격자 (2026-10-08 Alan — 첫토익 "숙제 미제출 알림" 화면을 보여 주며 "이렇게 표시해주면 좋겠어").
 * 구조는 첫토익 그대로 — 반마다 카드, 학생 줄 × 수업일 열(N회 · 날짜 · 트랙 · RC LC), 제출률, 위에 단계 점(개근 · 양호 · 주의 · 위험)과
 * **미제출 전체선택**, 고르면 아래에 **N명 선택 · 알림 보내기** 막대가 서고 팝업에서 제목을 고치고 학생마다 만들어진 글을 미리 본다. 색은 우리 핫핑크다.
 *
 * - 학생 줄은 **안 낸 숙제가 많은 학생 → 이름** (`buildMissingBoard` — 강사 · 관리자 · 조교 계정은 줄이 없다). 고른 줄은 연분홍으로 칠할 뿐 자리를 옮기지 않는다
 *   (첫토익은 고른 학생을 위로 올리는데, 누를 때마다 줄이 뛰어 다음 학생을 잘못 누르게 된다).
 * - 이름 칸만 왼쪽에 고정하고 날짜는 카드 안에서 가로로 민다. **제출률은 이름 아래에 둔다** — 첫토익처럼 줄 끝 칸에 두면 한 달 20일 × RC · LC 가
 *   화면을 넘어 휴대폰에서는 밀어야 보였다. 칸 안에 `sr-only` 를 두지 않는다 (가로 스크롤 상자를 빠져나가
 *   화면 전체가 옆으로 밀린다 — 출석 · 비대면 인증 격자와 같은 함정) — 설명은 `aria-label` · `title`.
 * - 보내기는 서버가 **지금 다시 세어** 학생마다 글을 만든다 — 여기 미리보기와 같은 함수(`homeworkMissingMessage`)다.
 */
export function MissingBoard({ termId, level, groups, picks }: { termId: number; level: number; groups: MissingGroupView[]; picks: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compose, setCompose] = useState(false);
  const [title, setTitle] = useState(HOMEWORK_MISSING_TITLE);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  const rowsById = useMemo(() => new Map(groups.flatMap((g) => g.rows.map((r) => [r.id, r] as const))), [groups]);
  const chosen = [...selected].map((id) => rowsById.get(id)).filter((r): r is MissingRowView => !!r);
  const toSend = chosen.filter((r) => r.missing.length > 0);
  const preview = (previewId ? toSend.find((r) => r.id === previewId) : undefined) ?? toSend[0] ?? null;

  // 팝업은 onClose 가 바뀔 때마다 제목에 포커스를 다시 준다 — 제목 칸에 글자를 칠 때마다 포커스를 뺏기지 않게 고정한다
  const closeCompose = useCallback(() => {
    if (!busy) setCompose(false);
  }, [busy]);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function send() {
    if (busy || toSend.length === 0) return;
    setBusy(true);
    const res = await sendHomeworkMissingNotice({ termId, level, userIds: toSend.map((r) => r.id), title }).catch(
      () => ({ ok: false, error: "보내지 못했어요. 잠시 뒤 다시 해 주세요." }) as const,
    );
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "warning", text: res.error });
    setMsg({
      kind: "success",
      text: `${res.sent}명에게 숙제 알림을 보냈어요. 학생 알림함(마이페이지 → 알림)에서 볼 수 있어요.${res.skipped > 0 ? ` 그 사이 숙제를 다 낸 ${res.skipped}명은 뺐어요.` : ""}`,
    });
    setCompose(false);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      {msg && (
        <div className="mb-4">
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}

      {/* 범례 + 미제출 전체선택 (첫토익과 같은 자리) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs font-semibold text-slate" aria-label="제출률 단계">
          {(["perfect", "good", "warn", "risk"] as const).map((s) => (
            <li key={s} className="flex items-center gap-1">
              <span className={cn("size-2 rounded-full", STATUS_DOT[s])} aria-hidden />
              {MISSING_STATUS_LABEL[s]}
              <span className="text-mist">{s === "perfect" ? "100%" : s === "good" ? "70%~" : s === "warn" ? "40%~" : "~39%"}</span>
            </li>
          ))}
          <li className="flex items-center gap-1 sm:ml-2">
            <CellMark kind="done" /> 냄
          </li>
          <li className="flex items-center gap-1">
            <CellMark kind="missing" /> 안 냄
          </li>
          <li className="flex items-center gap-1">
            <CellMark kind="upcoming" /> 아직
          </li>
        </ul>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="btn-ghost !px-3 !py-2 text-sm">
              선택 해제
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSelected(new Set(picks));
              setMsg(null);
            }}
            disabled={picks.length === 0}
            className="btn-secondary !px-4 !py-2 text-sm"
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4.6 8.2l2.2 2.2 4.6-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {/* 고를 학생이 없는 까닭이 둘이다 — 다 냈거나, 안 낸 학생이 모두 오늘 이미 알림을 받았다 (전체선택은 그 학생을 뺀다) */}
            {picks.length > 0
              ? `미제출 전체선택 (${picks.length}명)`
              : groups.some((g) => g.rows.some((r) => r.missing.length > 0))
                ? "오늘 모두 알림을 보냈어요"
                : "안 낸 학생이 없어요"}
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {groups.map((g) => (
          <GroupCard key={g.key} group={g} selected={selected} onToggle={toggle} />
        ))}
      </div>

      {/* 고르면 아래에 선다 — 휴대폰은 하단 메뉴 위 (반 편성 달력의 저장 막대와 같은 자리) */}
      {selected.size > 0 && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-20 mt-5 flex items-center gap-2 rounded-xl2 border border-line bg-paper/95 p-2.5 shadow-soft backdrop-blur sm:p-3 md:bottom-4">
          <button type="button" onClick={() => setSelected(new Set())} aria-label="선택 해제" title="선택 해제" className="flex size-9 items-center justify-center rounded-full text-slate hover:bg-surface">
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-black text-brand-700 tabular-nums">{selected.size}명 선택</span>
          <button
            type="button"
            onClick={() => {
              setCompose(true);
              setPreviewId(null);
              setMsg(null);
            }}
            className="btn-primary ml-auto !px-4 !py-2 text-sm"
          >
            <Icon name="bell" size={18} />
            알림 보내기
          </button>
        </div>
      )}

      <Dialog open={compose} title="숙제 알림 보내기" onClose={closeCompose} dismissible={!busy}>
        <p className="text-slate">
          {toSend.length > 0 ? (
            <>
              <b className="text-ink">{toSend.length}명</b>에게 학생마다 이름과 안 낸 날짜가 맞게 들어간 알림이 가요.
            </>
          ) : (
            "고른 학생은 안 낸 숙제가 없어요."
          )}
          {chosen.length > toSend.length && ` 안 낸 숙제가 없는 ${chosen.length - toSend.length}명은 빼요.`}
        </p>

        <label className="mt-4 block text-xs font-bold text-ink-soft" htmlFor="missing-title">
          알림 제목
        </label>
        <input
          id="missing-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MISSING_TITLE_MAX}
          className="input mt-1 !py-2 text-sm font-bold"
        />

        {preview && (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-ink-soft">미리보기</span>
              {toSend.length > 1 && (
                <select
                  value={preview.id}
                  onChange={(e) => setPreviewId(e.target.value)}
                  aria-label="미리 볼 학생"
                  className="input !w-auto !py-1 text-xs"
                >
                  {toSend.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || "이름 없음"}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="mt-1 rounded-xl2 border border-brand-100 bg-brand-50/40 p-3">
              <p className="font-black text-ink">{title.trim() || HOMEWORK_MISSING_TITLE}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                {homeworkMissingMessage({ name: preview.name, level, missing: preview.missing, past: preview.past, done: preview.done })}
              </p>
            </div>
          </>
        )}
        <p className="mt-2 text-xs text-mist">학생 알림함(마이페이지 → 알림)으로 가요. 문자 · 카톡은 가지 않아요. 조교 계정으로 보내도 학생에게는 과목 선생님 이름으로 보여요.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={send} disabled={busy || toSend.length === 0 || !title.trim()} className="btn-primary !px-4 !py-2 text-sm">
            {busy ? "보내는 중…" : `${toSend.length}명에게 알림 보내기`}
          </button>
          <button type="button" onClick={() => setCompose(false)} disabled={busy} className="btn-ghost !px-3 !py-2 text-sm">
            취소
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function GroupCard({ group, selected, onToggle }: { group: MissingGroupView; selected: ReadonlySet<string>; onToggle: (id: string, on: boolean) => void }) {
  const tracks = new Set(group.columns.map((c) => c.track).filter(Boolean));
  const showTrack = tracks.size > 1;
  const flagged = group.rows.filter((r) => r.missing.length > 0).length;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-brand-50/60 px-4 py-3">
        {/* 분홍 막대와 반 이름은 한 덩어리 — 이름이 길어 줄이 바뀌어도 막대만 따로 남지 않게. 이름은 띄어쓰기에서만 접는다 */}
        <span className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 h-5 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden />
          <h2 className="flex min-w-0 flex-wrap gap-x-2 break-keep font-black text-ink">
            {group.classes.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="mr-2 text-mist">/</span>}
                {c}
              </span>
            ))}
          </h2>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-bold">
          {flagged > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">안 낸 학생 {flagged}명</span>}
          <span className="rounded-full bg-paper px-2 py-0.5 text-brand-700 ring-1 ring-brand-100">학생 {group.rows.length}명</span>
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-surface text-xs text-slate">
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-bold">학생</th>
              {group.columns.map((c) => (
                <th key={c.date} scope="col" className={cn("px-1 py-1.5 text-center align-bottom font-bold", c.isToday && "bg-brand-50")}>
                  <span className={cn("block text-[11px] font-black", c.past ? "text-brand-600" : "text-mist")}>{c.seq}회</span>
                  <span className={cn("block whitespace-nowrap text-[11px] tabular-nums", c.past ? "text-ink" : "text-mist")}>
                    {c.md}
                    <span className="text-[10px] font-semibold"> {c.weekday}</span>
                  </span>
                  {showTrack && c.track && (
                    <span className={cn("block text-[10px] font-black", c.track === "mwf" ? "text-brand-600" : "text-ink")}>{TRACK_LABEL[c.track] ?? c.track}</span>
                  )}
                  <span className="mt-0.5 flex justify-center gap-1 text-[9px] font-bold text-slate">
                    {c.subjects.map((s) => (
                      <span key={s} className="w-4 text-center">
                        {SUBJECT_LABEL[s]}
                      </span>
                    ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {group.rows.map((r) => {
              const on = selected.has(r.id);
              const status = missingStatus(r.rate);
              const tint = on ? "bg-brand-50" : "bg-paper";
              return (
                <tr key={r.id} className={tint}>
                  <th scope="row" className={cn("sticky left-0 z-10 px-3 py-2 text-left align-middle font-normal", tint)}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => onToggle(r.id, e.target.checked)}
                        aria-label={`${r.name || "이름 없음"} 고르기`}
                        className="size-4 shrink-0 accent-brand-500"
                      />
                      <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} title={MISSING_STATUS_LABEL[status]} aria-hidden />
                      <span className="whitespace-nowrap font-bold text-ink">{r.name || "이름 없음"}</span>
                    </label>
                    {/* 제출률은 이름 아래 — 날짜가 많아 가로로 밀어도 늘 보이게 (첫토익은 줄 끝 칸이라 휴대폰에서는 밀어야 보였다) */}
                    <span className="mt-1 flex items-center gap-1.5 whitespace-nowrap pl-6">
                      <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums", STATUS_BADGE[status])}>{r.rate === null ? "–" : `${r.rate}%`}</span>
                      <span className="text-[11px] text-mist tabular-nums">
                        {r.done}/{r.past}
                      </span>
                    </span>
                    {r.sent && <span className="mt-0.5 block whitespace-nowrap pl-6 text-[11px] font-semibold text-brand-600">알림 {r.sent}</span>}
                  </th>
                  {group.columns.map((c, ci) => (
                    <td key={c.date} className={cn("px-1 py-2 text-center align-middle", c.isToday && "bg-brand-50/60")}>
                      <span className="inline-flex gap-1">
                        {c.subjects.map((s, si) => {
                          const kind = r.cells[ci]?.[si] ?? "none";
                          return <CellMark key={s} kind={kind} label={`${r.name} ${c.md} ${SUBJECT_LABEL[s]} — ${CELL_LABEL[kind]}`} />;
                        })}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
