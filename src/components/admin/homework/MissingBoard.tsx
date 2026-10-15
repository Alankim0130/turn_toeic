"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sendHomeworkMissingNotice } from "@/app/admin/homework/missing/actions";
import { Alert } from "@/components/ui/Alert";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { SUBJECT_LABEL, type HomeworkSubject } from "@/lib/homework";
import {
  dueLabel,
  HOMEWORK_MISSING_TITLE,
  homeworkMissingMessage,
  MISSING_STATUS_LABEL,
  MISSING_TITLE_MAX,
  missingStatus,
  type MissingCell,
  type MissingDay,
  type MissingDayStudent,
  type MissingRow,
  type MissingStatus,
} from "@/lib/homework-missing";
import { cn, TRACK_LABEL } from "@/lib/utils";

export type MissingColumnView = {
  date: string;
  seq: number;
  track: string | null;
  subjects: HomeworkSubject[];
  /** 그 날 숙제의 기한 날짜 (같은 트랙 다음 수업일 오후 5시) · 모르면 null */
  due: string | null;
  /** 기한이 지났는가 — 머리글을 진하게 칠한다 */
  overdue: boolean;
  /** "10/9" */
  md: string;
  /** "목" */
  weekday: string;
  isToday: boolean;
};
export type MissingRowView = MissingRow & {
  /** 이 레벨에서 마지막으로 미제출 알림을 받은 때 — "오늘 14:20" · "10/8" */
  sent: string | null;
};
export type MissingGroupView = { key: string; classes: string[]; columns: MissingColumnView[]; rows: MissingRowView[] };
/** 날짜별 보기의 하루 (`buildMissingDays`) — 'N강 · 10월 6일 (화)' */
export type MissingDayView = Omit<MissingDay, "missing"> & {
  /** "10월 6일 (화)" */
  label: string;
  /** "10/8(목) 오후 5시" — 기한을 모르면 null */
  dueText: string | null;
  isToday: boolean;
  /**
   * `sent` — 이 레벨에서 마지막으로 미제출 알림을 받은 때 ("오늘 14:20" · "10/8").
   * `alerted` — 그 알림이 이 날 숙제의 기한 뒤라 **이 날 숙제도 이미 알렸다** (`newMissingOf` 와 같은 규칙) — '이 날 안 낸 학생 고르기' 가 건너뛴다
   */
  missing: (MissingDayStudent & { sent: string | null; alerted: boolean })[];
};

/** 제출률 단계의 색 — 구조는 첫토익, 색은 우리 핫핑크 */
const STATUS_DOT: Record<MissingStatus, string> = { perfect: "bg-brand-500", good: "bg-brand-300", warn: "bg-amber-400", risk: "bg-red-500", none: "bg-line" };
const STATUS_BADGE: Record<MissingStatus, string> = {
  perfect: "bg-brand-500 text-white",
  good: "bg-brand-100 text-brand-700",
  warn: "bg-amber-100 text-amber-800",
  risk: "bg-red-100 text-red-700",
  none: "bg-surface text-mist",
};
const CELL_LABEL: Record<MissingCell, string> = { done: "냄", missing: "안 냄 (기한 지남)", upcoming: "아직 (기한 전)", none: "해당 없음 (반에 들어오기 전)" };
const MARK_CLASS: Record<MissingCell, string> = { done: "hw-mark-done", missing: "hw-mark-missing", upcoming: "hw-mark-upcoming", none: "hw-mark-none" };

/**
 * 칸 하나 — 도형이다. 이모지 · 그림 파일을 쓰지 않는다 (14px 에서 또렷하고 색을 바꿀 수 있게).
 * **요소 하나에 배경 그림으로 그린다** (globals.css `.hw-mark-*`, 2026-10-09 "숙제미제출 알림 페이지를 클릭하면 로딩시간이 오래걸려") —
 * 칸마다 인라인 SVG(요소 넷)였더니 한 레벨에 요소가 1만 6천 개가 넘어 휴대폰에서 그리는 데만 1초 넘게 걸렸다. 인라인 SVG 로 되돌리지 말 것.
 */
function CellMark({ kind, label }: { kind: MissingCell; label?: string }) {
  const text = label ?? CELL_LABEL[kind];
  return <span role="img" aria-label={text} title={text} className={cn("hw-mark", MARK_CLASS[kind])} />;
}

/**
 * **숙제 미제출 알림** 격자 (2026-10-08 Alan — 첫토익 "숙제 미제출 알림" 화면을 보여 주며 "이렇게 표시해주면 좋겠어").
 * 구조는 첫토익 그대로 — 반마다 카드, 학생 줄 × 수업일 열(N회 · 날짜 · 트랙 · RC LC), 제출률, 위에 단계 점(개근 · 양호 · 주의 · 위험)과
 * **미제출 전체선택**, 고르면 아래에 **N명 선택 · 알림 보내기** 막대가 서고 팝업에서 제목을 고치고 학생마다 만들어진 글을 미리 본다. 색은 우리 핫핑크다.
 *
 * - 학생 줄은 **알림 받는 학생 → 안 낸 숙제가 많은 학생 → 이름** (`buildMissingBoard` — 강사 · 관리자 · 조교 계정은 줄이 없다). 고른 줄은 연분홍으로 칠할 뿐 자리를 옮기지 않는다
 *   (첫토익은 고른 학생을 위로 올리는데, 누를 때마다 줄이 뛰어 다음 학생을 잘못 누르게 된다).
 * - 이름 칸만 왼쪽에 고정하고 날짜는 카드 안에서 가로로 민다. **제출률은 이름 아래에 둔다** — 첫토익처럼 줄 끝 칸에 두면 한 달 20일 × RC · LC 가
 *   화면을 넘어 휴대폰에서는 밀어야 보였다. 칸 안에 `sr-only` 를 두지 않는다 (가로 스크롤 상자를 빠져나가
 *   화면 전체가 옆으로 밀린다 — 출석 · 비대면 인증 격자와 같은 함정) — 설명은 `aria-label` · `title`.
 * - 보내기는 서버가 **지금 다시 세어** 학생마다 글을 만든다 — 여기 미리보기와 같은 함수(`homeworkMissingMessage`)다.
 * - **숙제제출 화면에서 '알림 안 받기' 를 누른 학생**(`alerts` 거짓 — 2026-10-15 Alan, 10-14 하루는 거꾸로 신청한 학생만 받았다)은 기본으로 줄이 없고,
 *   `알림 안 받는 학생도 보기` 를 켜면 회색 줄로 선다 — 체크박스가 없고 `알림 안 받음` 표를 단다 (고를 수도 보낼 수도 없다).
 * - '안 냄' 은 **제출 기한(같은 트랙 다음 수업일 오후 5시)이 지난** 숙제다 — 머리글의 회차 · 날짜는 기한이 지난 열만 진하게, 기한은 머리글 `title` 에 적는다.
 * - **날짜별 보기**(`view="dates"`, 2026-10-15 Alan — "1강(10월 6일) 숙제 미제출자 리스트/ 2강(10월 8일) 숙제 미제출자 리스트") — 월수금 · 화목금을 나란히
 *   (휴대폰은 위아래) 두고 트랙마다 1강부터 수업 하나에 카드 한 장(`DayCard`): 그 날 안 낸 학생을 반마다 모아 적는다. 기한이 지난 수업만 고를 수 있고
 *   (`이 날 안 낸 학생 고르기`), 기한 전인 수업은 아직 안 낸 학생을 접어 둔다. 고른 학생 · 보내기 막대 · 팝업은 학생별과 함께 쓴다.
 */
export function MissingBoard({
  termId,
  level,
  view = "students",
  groups,
  days = [],
  picks,
}: {
  termId: number;
  level: number;
  view?: "students" | "dates";
  groups: MissingGroupView[];
  days?: MissingDayView[];
  picks: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compose, setCompose] = useState(false);
  const [title, setTitle] = useState(HOMEWORK_MISSING_TITLE);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  const rowsById = useMemo(() => new Map(groups.flatMap((g) => g.rows.map((r) => [r.id, r] as const))), [groups]);
  const chosen = [...selected].map((id) => rowsById.get(id)).filter((r): r is MissingRowView => !!r && r.alerts);
  const toSend = chosen.filter((r) => r.missing.length > 0);
  const preview = (previewId ? toSend.find((r) => r.id === previewId) : undefined) ?? toSend[0] ?? null;

  // 팝업은 onClose 가 바뀔 때마다 제목에 포커스를 다시 준다 — 제목 칸에 글자를 칠 때마다 포커스를 뺏기지 않게 고정한다
  const closeCompose = useCallback(() => {
    if (!busy) setCompose(false);
  }, [busy]);

  // 고정해 둔다 — 카드(GroupCard · DayCard)는 고른 학생이 바뀐 카드만 다시 그린다 (memo)
  const toggle = useCallback(
    (id: string, on: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  // 날짜별 — 그 날 안 낸 학생을 한 번에 고르거나 푼다
  const pickMany = useCallback(
    (ids: readonly string[], on: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
    [],
  );
  // 날짜별 — 반 묶음 이름 (학생 줄 위 작은 머리글) · 트랙마다 나눈 수업일 (월수금 먼저)
  const classOf = useMemo(() => new Map(groups.map((g) => [g.key, g.classes.join(" / ")])), [groups]);
  const dayColumns = useMemo(() => {
    const by = new Map<string, MissingDayView[]>();
    for (const d of days) by.set(d.track ?? "", [...(by.get(d.track ?? "") ?? []), d]);
    const rank = (t: string) => (t === "mwf" ? 0 : t === "ttf" ? 1 : 2);
    return [...by.entries()].sort(([a], [b]) => rank(a) - rank(b));
  }, [days]);

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
      text:
        `${res.sent}명에게 숙제 알림을 보냈어요. 학생 알림함(마이페이지 → 알림)에서 볼 수 있어요.` +
        (res.skipped > 0 ? ` 그 사이 숙제를 다 낸 ${res.skipped}명은 뺐어요.` : "") +
        (res.unsubscribed > 0 ? ` 그 사이 '알림 안 받기' 를 누른 ${res.unsubscribed}명은 뺐어요.` : ""),
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

      {/* 범례 + 미제출 전체선택 (첫토익과 같은 자리) — 날짜별에서는 범례 대신 고르는 규칙 한 줄 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {view === "dates" ? (
          <p className="text-xs font-semibold text-slate">기한이 지난 수업의 안 낸 학생만 고를 수 있어요. 알림에는 그 학생이 안 낸 숙제가 모두 적혀요.</p>
        ) : (
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
              <CellMark kind="missing" /> 안 냄 (기한 지남)
            </li>
            <li className="flex items-center gap-1">
              <CellMark kind="upcoming" /> 아직 (기한 전)
            </li>
          </ul>
        )}
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
            {/* 고를 학생이 없는 까닭이 둘이다 — 다 냈거나, 안 낸 숙제를 모두 이미 알렸다 (마지막 알림 뒤에 새로 기한이 지난 것이 없다) */}
            {picks.length > 0
              ? `미제출 전체선택 (${picks.length}명)`
              : groups.some((g) => g.rows.some((r) => r.alerts && r.missing.length > 0))
                ? "안 낸 숙제는 모두 알렸어요"
                : "안 낸 학생이 없어요"}
          </button>
        </div>
      </div>

      {view === "dates" ? (
        days.length === 0 ? (
          <p className="rounded-xl2 border border-dashed border-line px-4 py-10 text-center text-sm text-slate">
            아직 지난 수업이 없어요. 수업이 끝나면 여기에 수업마다 숙제를 안 낸 학생이 보여요.
          </p>
        ) : (
          <div className={cn("grid items-start gap-6", dayColumns.length > 1 && "lg:grid-cols-2")}>
            {dayColumns.map(([track, list]) => (
              <section key={track || "etc"} aria-label={`${TRACK_LABEL[track] ?? "수업"} 수업`} className="min-w-0 space-y-3">
                <h2 className="flex items-center gap-2 text-base font-black text-ink">
                  <span className={cn("h-4 w-1 rounded-full", track === "mwf" ? "bg-brand-500" : "bg-ink")} aria-hidden />
                  {TRACK_LABEL[track] ?? "수업"}
                </h2>
                {list.map((d) => (
                  <DayCard key={d.date} day={d} classOf={classOf} picked={pickedInDay(d, selected)} onToggle={toggle} onPick={pickMany} />
                ))}
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <GroupCard key={g.key} group={g} picked={pickedIn(g, selected)} onToggle={toggle} />
          ))}
        </div>
      )}

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

/** 날짜 카드에서 고른 학생 id — 고를 수 있는 날(기한이 지난 날)의 받는 학생만 (`pickedIn` 과 같은 까닭으로 글자 하나) */
const pickedInDay = (day: MissingDayView, selected: ReadonlySet<string>) =>
  day.overdue
    ? day.missing
        .filter((m) => m.alerts && selected.has(m.id))
        .map((m) => m.id)
        .join(",")
    : "";

/**
 * 날짜별 보기의 수업 하나 — 'N강 · 10월 6일 (화)' (2026-10-15 Alan). 머리에 N강 · 날짜 · 그 날 과목 · 상태(안 낸 학생 N명 · 모두 냈어요 · 기한 전),
 * 그 아래 기한과 낸 학생 수, 그리고 안 낸 학생을 **반마다** 작은 머리글 아래에 적는다 (줄 순서는 `buildMissingDays` — 반 순서 → 받는 학생 → 이름).
 * 과목이 둘인 날(120분 · 속성반 · 주5일 120분)만 학생마다 안 낸 과목을 적는다. 기한 전인 날은 접어 두고 고를 수 없다.
 * GroupCard 처럼 memo — 고른 학생이 바뀐 카드만 다시 그린다.
 */
const DayCard = memo(function DayCard({
  day,
  classOf,
  picked,
  onToggle,
  onPick,
}: {
  day: MissingDayView;
  classOf: ReadonlyMap<string, string>;
  picked: string;
  onToggle: (id: string, on: boolean) => void;
  onPick: (ids: readonly string[], on: boolean) => void;
}) {
  const selected = useMemo(() => new Set(picked ? picked.split(",") : []), [picked]);
  // '이 날 안 낸 학생 고르기' — 알림을 받고 · 이 날 숙제를 아직 알리지 않은 학생 (미제출 전체선택과 같은 규칙. 이미 알린 학생은 손으로 고른다)
  const pickable = day.overdue ? day.missing.filter((m) => m.alerts && !m.alerted).map((m) => m.id) : [];
  const allAlerted = day.overdue && pickable.length === 0 && day.missing.some((m) => m.alerts);
  const allPicked = pickable.length > 0 && pickable.every((id) => selected.has(id));
  const twoSubjects = day.subjects.length > 1;

  // 반마다 — 줄은 이미 반 순서로 서 있다
  const runs: { key: string; students: MissingDayView["missing"] }[] = [];
  for (const m of day.missing) {
    const last = runs[runs.length - 1];
    if (last && last.key === m.groupKey) last.students.push(m);
    else runs.push({ key: m.groupKey, students: [m] });
  }

  const list = (checkable: boolean) => (
    <div className="mt-2 space-y-2.5">
      {runs.map((run) => (
        <div key={run.key}>
          <p className="break-keep px-1 text-[11px] font-bold text-mist">{classOf.get(run.key) ?? ""}</p>
          <ul className="mt-0.5">
            {run.students.map((m) => {
              const on = checkable && m.alerts && selected.has(m.id);
              const chips = (
                <>
                  {twoSubjects && (
                    <span className="flex shrink-0 gap-1">
                      {m.subjects.map((s) => (
                        <span
                          key={s}
                          className={cn("rounded px-1.5 py-0.5 text-[10px] font-black", checkable ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-surface text-slate ring-1 ring-line")}
                        >
                          {SUBJECT_LABEL[s]}
                        </span>
                      ))}
                    </span>
                  )}
                  {!m.alerts && (
                    <span className="shrink-0 whitespace-nowrap rounded-md bg-paper px-1.5 py-0.5 text-[10px] font-bold text-slate ring-1 ring-line">알림 안 받음</span>
                  )}
                </>
              );
              return (
                <li key={m.id} className={cn("flex min-h-9 items-center gap-2 rounded-lg px-1 py-1", on && "bg-brand-50")}>
                  {checkable && m.alerts ? (
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => onToggle(m.id, e.target.checked)}
                        aria-label={`${m.name || "이름 없음"} 고르기`}
                        className="size-4 shrink-0 accent-brand-500"
                      />
                      <span className="truncate font-bold text-ink">{m.name || "이름 없음"}</span>
                      {chips}
                    </label>
                  ) : (
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {/* 체크박스 자리는 비워 이름 줄을 맞춘다 (고를 수 있는 날 안에서만) */}
                      {checkable && <span className="size-4 shrink-0" aria-hidden />}
                      <span className={cn("truncate font-bold", m.alerts ? "text-ink" : "text-ink-soft")}>{m.name || "이름 없음"}</span>
                      {chips}
                    </span>
                  )}
                  {m.sent && (
                    <span
                      title={m.alerted ? "이 날 숙제가 적힌 알림을 보냈어요" : "이 날 숙제의 기한 전에 보낸 알림이에요"}
                      className={cn("shrink-0 whitespace-nowrap text-[11px] font-semibold", m.alerted ? "text-brand-600" : "text-mist")}
                    >
                      알림 {m.sent}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <article className={cn("hw-board-card card overflow-hidden", day.isToday && "ring-2 ring-brand-200")}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-brand-50/60 px-4 py-2.5">
        {day.lecture != null && <span className="shrink-0 rounded-md bg-brand-500 px-1.5 py-0.5 text-xs font-black text-white tabular-nums">{day.lecture}강</span>}
        <h3 className="whitespace-nowrap font-black text-ink">{day.label}</h3>
        {day.isToday && <span className="text-xs font-bold text-brand-600">오늘</span>}
        <span className="flex gap-1">
          {day.subjects.map((s) => (
            <span key={s} className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-black text-slate ring-1 ring-line">
              {SUBJECT_LABEL[s]}
            </span>
          ))}
        </span>
        <span className="ml-auto shrink-0 text-xs font-bold">
          {!day.overdue ? (
            <span className="rounded-full bg-surface px-2 py-0.5 text-slate ring-1 ring-line">기한 전</span>
          ) : day.missing.length > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">안 낸 학생 {day.missing.length}명</span>
          ) : (
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-white">모두 냈어요</span>
          )}
        </span>
      </header>
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-xs text-slate">
            {day.dueText ? (
              <>
                기한 {day.dueText}
                {day.overdue && <span className="font-bold text-ink"> · 지났어요</span>}
              </>
            ) : (
              "기한 — 다음 수업일이 아직 달력에 없어요"
            )}
            <span className="mx-1.5 text-line" aria-hidden>
              |
            </span>
            낸 학생{" "}
            <b className="text-ink tabular-nums">
              {day.submitted}/{day.expected}
            </b>
            명
          </p>
          {pickable.length > 0 && (
            <button type="button" onClick={() => onPick(pickable, !allPicked)} className="btn-secondary !px-3 !py-1.5 text-xs">
              {allPicked ? "이 날 고른 것 풀기" : `이 날 안 낸 학생 고르기 (${pickable.length}명)`}
            </button>
          )}
          {allAlerted && <span className="text-xs font-semibold text-mist">이 날 숙제는 모두 알렸어요</span>}
        </div>
        {day.missing.length > 0 &&
          (day.overdue ? (
            list(true)
          ) : (
            // 기한 전 — 아직 안 낸 학생은 접어 둔다 (오늘 · 어제 수업은 거의 모두가 아직이다)
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-xs font-bold text-slate transition hover:text-brand-600">
                <span className="mr-1 inline-block transition group-open:rotate-90">▸</span>
                아직 안 낸 학생 {day.missing.length}명 보기
              </summary>
              {list(false)}
            </details>
          ))}
      </div>
    </article>
  );
});

/** 이 카드에서 고른 학생 id — 글자 하나로 넘겨(쉼표로 이음, uuid 에는 쉼표가 없다) 고른 학생이 바뀐 카드만 다시 그린다 */
const pickedIn = (group: MissingGroupView, selected: ReadonlySet<string>) =>
  group.rows
    .filter((r) => r.alerts && selected.has(r.id))
    .map((r) => r.id)
    .join(",");

/**
 * 반 묶음 카드 하나. **고른 학생이 바뀐 카드만 다시 그린다** (memo · `picked` 는 글자 · `onToggle` 은 고정, 2026-10-09) —
 * 예전에는 한 명을 고를 때마다 모든 카드의 칸(한 레벨에 수천 개)을 다시 그려 휴대폰에서 체크가 늦게 들어갔다.
 */
const GroupCard = memo(function GroupCard({ group, picked, onToggle }: { group: MissingGroupView; picked: string; onToggle: (id: string, on: boolean) => void }) {
  const selected = useMemo(() => new Set(picked ? picked.split(",") : []), [picked]);
  const tracks = new Set(group.columns.map((c) => c.track).filter(Boolean));
  const showTrack = tracks.size > 1;
  const flagged = group.rows.filter((r) => r.alerts && r.missing.length > 0).length;

  return (
    <section className="hw-board-card card overflow-hidden">
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
                <th
                  key={c.date}
                  scope="col"
                  title={c.due ? `숙제 기한 ${dueLabel(c.due)}${c.overdue ? " (지났어요)" : ""}` : "숙제 기한 — 다음 수업일이 아직 달력에 없어요"}
                  className={cn("px-1 py-1.5 text-center align-bottom font-bold", c.isToday && "bg-brand-50")}
                >
                  <span className={cn("block text-[11px] font-black", c.overdue ? "text-brand-600" : "text-mist")}>{c.seq}회</span>
                  <span className={cn("block whitespace-nowrap text-[11px] tabular-nums", c.overdue ? "text-ink" : "text-mist")}>
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
              const on = r.alerts && selected.has(r.id);
              const status = missingStatus(r.rate);
              const tint = on ? "bg-brand-50" : r.alerts ? "bg-paper" : "bg-surface";
              return (
                <tr key={r.id} className={cn(tint, !r.alerts && "text-mist")}>
                  <th scope="row" className={cn("sticky left-0 z-10 px-3 py-2 text-left align-middle font-normal", tint)}>
                    {r.alerts ? (
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
                    ) : (
                      // '알림 안 받기' 를 누른 학생 — 볼 수만 있다 (체크박스 자리는 비워 이름 줄을 맞춘다)
                      <span className="flex items-center gap-2">
                        <span className="size-4 shrink-0" aria-hidden />
                        <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} title={MISSING_STATUS_LABEL[status]} aria-hidden />
                        <span className="whitespace-nowrap font-bold text-ink-soft">{r.name || "이름 없음"}</span>
                        <span className="whitespace-nowrap rounded-md bg-paper px-1.5 py-0.5 text-[10px] font-bold text-slate ring-1 ring-line">알림 안 받음</span>
                      </span>
                    )}
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
                    <td key={c.date} className={cn("whitespace-nowrap px-1 py-2 text-center align-middle", c.isToday && "bg-brand-50/60")}>
                      {c.subjects.map((s, si) => {
                        const kind = r.cells[ci]?.[si] ?? "none";
                        return <CellMark key={s} kind={kind} label={`${r.name} ${c.md} ${SUBJECT_LABEL[s]} — ${CELL_LABEL[kind]}`} />;
                      })}
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
});
