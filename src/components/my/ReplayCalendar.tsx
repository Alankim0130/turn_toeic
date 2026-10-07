"use client";

import { useId, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { monthHolidayNames } from "@/lib/holidays";
import { SUBJECT_LABEL } from "@/lib/instructor-subject";
import { dayMarks, replayEmbed, replayParts, sortReplays, type ClassDay, type DayMark, type ReplayEntry } from "@/lib/replay-calendar";
import { cn, formatDate, RECORDED_LABEL, RECORDED_NOTE } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** ‹ › 로 넘기는 달 하나 — `initial` 은 그 달로 넘어왔을 때 고르는 날 (`replayInitialDay`) */
export type ReplayMonth = { year: number; month: number; initial: string | null };

/** 재생 삼각형 — 도형으로 그린다 (이모지를 쓰지 않는다. 랜딩 소개 영상 · 수업자료실 링크와 같은 모양) */
function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("fill-current", className)}>
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.5-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

/**
 * 강의 다시보기 일정표 (2026-10-07 Alan — 첫토익 화면을 보여 주며 "일정표 기반으로 다시보기를 할 수 있으면 좋겠어! 본인 등급에 맞는 과정이 나오도록").
 * **구조만 첫토익이고 색은 우리 핫핑크다** — 월수금 분홍 · 화목금 잉크 (내 시간표 달력과 같은 색), 공휴일 이름은 `monthHolidayNames`.
 *
 * - 달력은 **내 수업일**을 칠한다. 녹화본이 올라온 날은 트랙 색 알약에 재생 삼각형, 아직인 날은 가는 막대(지난 날은 흐리게).
 * - 수업일만 누를 수 있다 — 빈 날이 눌리는데 아무 일도 없으면 고장난 것처럼 보인다 (`MonthCalendar` 와 같은 규칙).
 * - 날짜를 고르면 그 날 녹화본이 수업 시간 순으로 선다 — `레벨 과목 N회차` · 시간 · (저녁 반이면) 오전 녹화본 배지.
 *   **누른 뒤에야 플레이어를 불러온다** (유튜브는 youtube-nocookie) — 누르지도 않은 영상까지 플레이어 수백 KB 를 받지 않게. 한 번에 하나만 튼다.
 * - 어느 녹화본 · 어느 수업일이 내 것인지는 서버가 정해서 넘긴다 (`getMyReplays` · `getMySessions` — `my_section_ids()` 로 좁힌 것).
 */
export function ReplayCalendar({
  today,
  months,
  start,
  classDays,
  replays,
  flags,
}: {
  today: string;
  months: ReplayMonth[];
  /** 처음 띄우는 달 (months 의 칸) */
  start: number;
  classDays: ClassDay[];
  replays: ReplayEntry[];
  /** 날짜 → `개강` · `종강` (내 반의 기간) */
  flags: Record<string, string[]>;
}) {
  const [idx, setIdx] = useState(start);
  const [picked, setPicked] = useState<string | null>(months[start]?.initial ?? null);
  const [playing, setPlaying] = useState<number | null>(null);
  const base = useId();

  const marks = useMemo(() => dayMarks(classDays, replays), [classDays, replays]);
  const parts = useMemo(() => replayParts(replays), [replays]);
  const byDate = useMemo(() => {
    const map = new Map<string, ReplayEntry[]>();
    for (const r of replays) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    for (const [d, list] of map) map.set(d, sortReplays(list));
    return map;
  }, [replays]);

  const view = months[idx];
  if (!view) return null;
  const { year, month } = view;
  const multi = months.length > 1;

  const goTo = (next: number) => {
    if (next < 0 || next >= months.length) return;
    setIdx(next);
    setPicked(months[next].initial);
    setPlaying(null);
  };
  const choose = (date: string) => {
    setPicked(date);
    setPlaying(null);
  };

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // 공휴일 · 대체공휴일은 일요일처럼 칠하고 칸에 이름을 적는다 (2026-10-02 Alan — 학생 달력 모두)
  const holidays = monthHolidayNames(year, month);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: `${prefix}${String(d).padStart(2, "0")}` });
  while (cells.length % 7 !== 0) cells.push(null);

  // 범례는 이 달에 있는 것만
  const monthMarks = [...marks.entries()].filter(([d]) => d.startsWith(prefix)).flatMap(([, ms]) => ms);
  const has = (track: string) => monthMarks.some((m) => m.track === track);
  const hasReplay = monthMarks.some((m) => m.replays > 0);

  const list = picked ? (byDate.get(picked) ?? []) : [];
  const pickedIsClass = !!picked && (marks.get(picked)?.length ?? 0) > 0;
  const dayTitleId = `${base}-day`;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
      <section aria-label="수업일 달력" className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-brand-50/60 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1">
            {multi && (
              <button
                type="button"
                onClick={() => goTo(idx - 1)}
                disabled={idx === 0}
                aria-label="이전 달"
                className="flex size-8 items-center justify-center rounded-full text-ink transition hover:bg-brand-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Chevron dir="prev" />
              </button>
            )}
            <p className="px-1 font-black tabular-nums text-ink" aria-live="polite">
              {year}년 {month}월
            </p>
            {multi && (
              <button
                type="button"
                onClick={() => goTo(idx + 1)}
                disabled={idx === months.length - 1}
                aria-label="다음 달"
                className="flex size-8 items-center justify-center rounded-full text-ink transition hover:bg-brand-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Chevron dir="next" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate">
            {has("mwf") && (
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                월수금
              </span>
            )}
            {has("ttf") && (
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-ink" />
                화목금
              </span>
            )}
            {hasReplay && (
              <span className="flex items-center gap-1">
                <span className="flex h-3.5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
                  <PlayGlyph className="size-2.5" />
                </span>
                녹화본
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-line text-center text-xs font-bold text-mist">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={cn("py-2", i === 0 && "text-brand-500")}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            // 칸은 세로로 쌓고 표시는 바닥에 붙인다 — 개강 · 공휴일 이름이 있는 칸 옆에서도 한 줄의 숫자 · 막대 높이가 맞는다
            // (버튼은 내용을 세로 가운데에 두어서, 그냥 두면 같은 줄에서 숫자가 칸마다 들쭉날쭉했다)
            const box = cn("flex min-h-14 flex-col items-start border-b border-r border-line/70 p-1 text-left sm:min-h-16", (i + 1) % 7 === 0 && "border-r-0");
            if (!c) return <div key={i} className={box} />;
            const ms = marks.get(c.date) ?? [];
            const isToday = c.date === today;
            const past = c.date < today;
            const on = c.date === picked;
            const names = holidays.get(c.date);
            const tags = flags[c.date];
            const count = ms.reduce((n, m) => n + m.replays, 0);
            const inner = (
              <>
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                    isToday ? "bg-brand-500 text-white" : i % 7 === 0 || names ? "text-brand-500" : past ? "text-mist" : "text-ink",
                  )}
                >
                  {c.day}
                </span>
                {/* 내 반의 개강 · 종강 (첫토익의 `개강` · `수강종료` 자리) — 종강일까지 다시보기를 본다 */}
                {tags && (
                  <span className="block text-[9px] font-black leading-tight sm:text-[10px]">
                    {tags.map((t, k) => (
                      <span key={t} className={t === "개강" ? "text-brand-600" : "text-ink"}>
                        {k > 0 && "·"}
                        {t}
                      </span>
                    ))}
                  </span>
                )}
                {names && (
                  <span className="line-clamp-2 text-[9px] font-bold leading-[1.15] text-brand-600 sm:line-clamp-1 sm:text-[10px] sm:leading-tight">
                    {names.join("·")}
                  </span>
                )}
                <span className="mt-auto flex w-full flex-col gap-0.5 pt-0.5">
                  {ms.map((m) => (
                    <MarkBar key={m.track} mark={m} dim={past && !on} />
                  ))}
                </span>
              </>
            );
            if (ms.length === 0) {
              return (
                <div key={i} className={box}>
                  {inner}
                </div>
              );
            }
            const what = count > 0 ? `녹화본 ${count}개` : past ? "수업 — 녹화본이 아직 없어요" : "수업 — 수업이 끝나면 녹화본이 올라와요";
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={`${month}월 ${c.day}일${tags ? ` ${tags.join("·")}` : ""}${names ? ` ${names.join("·")}` : ""} ${what}`}
                onClick={() => choose(c.date)}
                className={cn(box, "transition hover:bg-brand-50/70", on && "bg-brand-50 ring-2 ring-inset ring-brand-400")}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby={dayTitleId} className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-brand-50/60 px-4 py-3">
          <h2 id={dayTitleId} className="min-w-0 flex-1 font-black text-ink" aria-live="polite">
            {picked ? (
              <>
                {formatDate(picked)} 강의
                {picked === today && <span className="ml-2 text-sm font-black text-brand-600">오늘</span>}
              </>
            ) : (
              "날짜를 골라 주세요"
            )}
          </h2>
          {list.length > 0 && <span className="shrink-0 text-xs font-bold text-slate">녹화본 {list.length}개</span>}
        </div>

        {list.length > 0 ? (
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <ReplayRow
                key={r.id}
                replay={r}
                part={parts.get(r.id)}
                open={playing === r.id}
                onToggle={() => setPlaying(playing === r.id ? null : r.id)}
                playerId={`${base}-player-${r.id}`}
              />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-slate">
            <Icon name="replay" size={32} className="opacity-60" />
            <p>
              {!picked
                ? "달력에서 수업일을 눌러 보세요."
                : !pickedIsClass
                  ? "이 날은 내 수업이 없어요."
                  : picked > today
                    ? "이 날 수업이 끝나면 녹화본이 여기에 올라와요."
                    : picked === today
                      ? "오늘 수업이 끝나면 녹화본이 여기에 올라와요."
                      : "이 날 녹화본이 아직 올라오지 않았어요."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * 달력 칸의 트랙 표시 하나 — 녹화본이 있으면 트랙 색 알약에 재생 삼각형(넓은 화면은 2개부터 수도),
 * 없으면 가는 막대. 지난 날의 막대만 흐리게 한다 (볼 것이 없다) — 녹화본 알약은 지나도 또렷해야 한다
 */
function MarkBar({ mark, dim }: { mark: DayMark; dim: boolean }) {
  const color = mark.track === "ttf" ? "bg-ink" : "bg-brand-500";
  if (mark.replays > 0) {
    return (
      <span className={cn("flex h-4 w-full max-w-8 items-center justify-center gap-0.5 rounded-full text-white sm:h-5 sm:max-w-none", color)}>
        <PlayGlyph className="size-2.5 sm:size-3" />
        {mark.replays > 1 && <span className="hidden text-[10px] font-black leading-none tabular-nums sm:inline">{mark.replays}</span>}
      </span>
    );
  }
  return <span className={cn("block h-1.5 w-full max-w-8 rounded-full sm:max-w-none", color, dim && "opacity-30")} />;
}

/** 녹화본 한 줄 — 누르면 그 자리에서 튼다. 영상 하나가 아닌 주소(드라이브 · 재생목록 …)는 새 창으로 */
function ReplayRow({
  replay: r,
  part,
  open,
  onToggle,
  playerId,
}: {
  replay: ReplayEntry;
  part: number | undefined;
  open: boolean;
  onToggle: () => void;
  playerId: string;
}) {
  const embed = replayEmbed(r.url);
  const subject = r.subject ? SUBJECT_LABEL[r.subject] : null;
  const name = [r.level, subject, `${r.seq}회차`, part ? `영상 ${part}` : null].filter(Boolean).join(" ");
  const spoken = [name, r.time].filter(Boolean).join(" ");

  const body = (
    <>
      {/* 과목 그림 — LC 헤드폰 · RC 책 (첫토익 카드의 그림 자리). 두 과목을 이어 듣는 반은 다시보기 그림 */}
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100">
        <Icon name={r.subject ?? "replay"} size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          {r.level && <span className="text-sm font-black tabular-nums text-slate">{r.level}</span>}
          {subject && <span className="font-black text-ink">{subject}</span>}
          <span className="font-black text-brand-600">{r.seq}회차</span>
          {part && <span className="text-xs font-bold text-mist">영상 {part}</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate">
          {r.time && <span className="font-semibold tabular-nums">{r.time}</span>}
          {/* 저녁 반 학생은 오전 짝 반의 녹화본을 본다 (화목금 인강 2026-09-18 · 월수금 현장 2026-09-23) */}
          {r.pair === "recorded" && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 font-black text-violet-800" title={RECORDED_NOTE}>
              {RECORDED_LABEL} · 오전 수업 녹화본
            </span>
          )}
          {r.pair === "evening" && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 font-black text-brand-600" title="저녁 반은 그 날 오전 수업 녹화본을 다시보기로 봐요">
              오전 수업 녹화본
            </span>
          )}
        </span>
      </span>
    </>
  );
  const row = "flex w-full items-center gap-3 px-4 py-3 text-left";

  if (embed.kind === "link") {
    return (
      <li>
        <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`${spoken} 녹화본 새 창으로 보기`} className={cn(row, "transition hover:bg-brand-50/60")}>
          {body}
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-pink">
            {/* 새 창 표시 — 사이트 밖으로 나간다는 것을 미리 보이게 (도형) */}
            <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
          </span>
        </a>
      </li>
    );
  }
  if (embed.kind === "none") {
    return (
      <li className={row}>
        {body}
        <span className="shrink-0 text-xs font-bold text-mist">열 수 없는 주소</span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={playerId}
        aria-label={`${spoken} 녹화본 ${open ? "닫기" : "보기"}`}
        className={cn(row, "transition hover:bg-brand-50/60", open && "bg-brand-50/60")}
      >
        {body}
        <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-white shadow-pink transition", open ? "bg-ink" : "bg-brand-500")}>
          {open ? (
            <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth={2.8} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <PlayGlyph className="ml-0.5 size-4" />
          )}
        </span>
      </button>
      {open && (
        <div id={playerId} className="px-4 pb-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-ink">
            <iframe
              src={embed.src}
              title={`${name} 녹화본`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        </div>
      )}
    </li>
  );
}
