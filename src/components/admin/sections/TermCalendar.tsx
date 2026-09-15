"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTermSchedule, type TermPart } from "@/app/admin/sections/actions";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn, LECTURE_KINDS, lectureKindShort, lectureKindTiny, sortLectureKinds, type LectureKind } from "@/lib/utils";
import { HOLIDAY_YEAR_RANGE, hasHolidayData, holidayNamesBetween } from "@/lib/holidays";
import { WEEKDAY_KO, coveringGrid, labelKo, shiftMonth, termKey, weekdayOf } from "./dates";
import { downloadCalendarImage } from "./calendarImage";

type Mode = "opens" | "closes" | "mwf" | "ttf" | "lecture";
type Track = "mwf" | "ttf";
export type TermLecture = { date: string; lecturerId: number; content: string; kinds: string[] };
/** 다른 기수(월)가 이미 수업일로 쓰고 있는 날짜 — 이 달에는 쓸 수 없다 */
export type OtherTermDate = { date: string; track: Track; year: number; month: number };
export type TermSchedule = { opens: string | null; closes: string | null; mwf: string[]; ttf: string[]; lectures: TermLecture[] };
type Lecture = TermLecture & { key: string };
type Notice = { kind: "success" | "warning" | "info"; text: string };

const MODES: { value: Mode; label: string; hint: string; on: string; off: string }[] = [
  {
    value: "opens",
    label: "개강일",
    hint: "개강일로 쓸 날짜 하나를 누르세요. 이 날부터 이 달 수강생 권한이 열립니다. 앞뒤 달 날짜도 고를 수 있어요.",
    on: "border-emerald-600 bg-emerald-600 text-white",
    off: "border-emerald-200 bg-paper text-emerald-700 hover:border-emerald-400",
  },
  {
    value: "closes",
    label: "종강일",
    hint: "종강일로 쓸 날짜 하나를 누르세요. 이 날이 지나면 다시보기가 닫힙니다. 앞뒤 달 날짜도 고를 수 있어요.",
    on: "border-emerald-600 bg-emerald-600 text-white",
    off: "border-emerald-200 bg-paper text-emerald-700 hover:border-emerald-400",
  },
  {
    value: "mwf",
    label: "월수금",
    hint: "월수금 수업일을 하나씩 누르세요. 다시 누르면 빠지고, 화목금 날짜를 누르면 월수금으로 옮겨집니다. 강의가 이어지면 앞뒤 달 날짜(흐린 칸)도 찍을 수 있어요.",
    on: "border-brand-500 bg-brand-500 text-white",
    off: "border-brand-200 bg-paper text-brand-700 hover:border-brand-400",
  },
  {
    value: "ttf",
    label: "화목금",
    hint: "화목금 수업일을 하나씩 누르세요. 다시 누르면 빠지고, 월수금 날짜를 누르면 화목금으로 옮겨집니다. 강의가 이어지면 앞뒤 달 날짜(흐린 칸)도 찍을 수 있어요.",
    on: "border-ink bg-ink text-white",
    off: "border-ink/20 bg-paper text-ink hover:border-ink/50",
  },
  {
    value: "lecture",
    label: "특강",
    hint: "강사와 내용을 정한 뒤 날짜를 누르세요. 수업일과 같은 날도, 하루에 여러 개도 됩니다. 같은 특강을 다시 누르면 빠져요. 앞뒤 달 날짜도 찍을 수 있어요.",
    on: "border-violet-600 bg-violet-600 text-white",
    off: "border-violet-200 bg-paper text-violet-700 hover:border-violet-400",
  },
];

const TRACK_LABEL: Record<Track, string> = { mwf: "월수금", ttf: "화목금" };

/** 항목별로 따로 저장한다 — 화면에 보여 줄 순서·이름 */
const PART_LABEL: Record<TermPart, string> = { dates: "개강·종강", mwf: "월수금", ttf: "화목금", lectures: "특강" };
const PART_ORDER: TermPart[] = ["dates", "mwf", "ttf", "lectures"];

const sameDates = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
const lectureKey = (ls: TermLecture[]) =>
  ls.map((l) => `${l.date}|${l.lecturerId}|${sortLectureKinds(l.kinds).join("+")}|${l.content.trim()}`).sort().join("¶");

const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))} (${WEEKDAY_KO[weekdayOf(d)]})`;

export function TermCalendar({
  year,
  month,
  today,
  saved,
  hasSaved,
  lecturers,
  replayDates,
  otherTermDates = [],
  sectionCount,
  readOnly = false,
}: {
  year: number;
  month: number;
  today: string;
  saved: TermSchedule;
  hasSaved: boolean;
  lecturers: { id: number; name: string }[];
  /** 다시보기가 붙은 수업일 — 달력에서 빼면 저장이 막힌다 */
  replayDates: { date: string; track: Track }[];
  /** 다른 기수(월)가 이미 쓰고 있는 수업일 — 이 달에서는 고를 수 없다 */
  otherTermDates?: OtherTermDate[];
  sectionCount: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [navigating, startNavigating] = useTransition();
  const [exporting, setExporting] = useState(false);
  /** 지금 저장 중인 항목 — "all" 은 전체 저장 */
  const [savingPart, setSavingPart] = useState<TermPart | "all" | null>(null);
  /** 저장 결과. 달력 힌트(notice)와 따로 두어 저장 버튼 바로 옆에 보여 준다 */
  const [result, setResult] = useState<Notice | null>(null);

  const [mode, setMode] = useState<Mode | null>(null);
  const [opens, setOpens] = useState(saved.opens);
  const [closes, setCloses] = useState(saved.closes);
  const [mwf, setMwf] = useState(() => new Set(saved.mwf));
  const [ttf, setTtf] = useState(() => new Set(saved.ttf));
  const [lectures, setLectures] = useState<Lecture[]>(() => saved.lectures.map((l, i) => ({ ...l, key: `saved-${i}` })));
  const [brush, setBrush] = useState<{ lecturerId: number | null; kinds: LectureKind[]; content: string }>({
    lecturerId: lecturers[0]?.id ?? null,
    kinds: [],
    content: "",
  });
  const [notice, setNotice] = useState<Notice | null>(null);

  const monthPrefix = `${termKey(year, month)}-`;
  // 그 달 + 이 기수로 찍힌 앞뒤 달 날짜까지 모두 보이도록 (최소 6주)
  const rows = useMemo(
    () => coveringGrid(year, month, [...mwf, ...ttf, ...lectures.map((l) => l.date), opens, closes].filter((d): d is string => !!d), 6),
    [year, month, mwf, ttf, lectures, opens, closes],
  );
  const cells = useMemo(() => rows.flat(), [rows]);
  const holidays = useMemo(() => holidayNamesBetween(cells[0].date, cells[cells.length - 1].date), [cells]);
  const monthHolidays = useMemo(() => [...holidays].filter(([d]) => d.startsWith(monthPrefix)), [holidays, monthPrefix]);
  const lecturerName = useMemo(() => new Map(lecturers.map((t) => [t.id, t.name])), [lecturers]);
  const locked = useMemo(() => new Set(replayDates.map((r) => `${r.track}|${r.date}`)), [replayDates]);
  /** 날짜 → 그 날짜를 이미 쓰고 있는 다른 기수 */
  const otherTerm = useMemo(() => new Map(otherTermDates.map((o) => [o.date, o])), [otherTermDates]);

  const lecturesByDate = useMemo(() => {
    const map = new Map<string, Lecture[]>();
    for (const l of lectures) map.set(l.date, [...(map.get(l.date) ?? []), l]);
    return map;
  }, [lectures]);
  const sortedLectures = useMemo(
    () => [...lectures].sort((a, b) => a.date.localeCompare(b.date) || (lecturerName.get(a.lecturerId) ?? "").localeCompare(lecturerName.get(b.lecturerId) ?? "")),
    [lectures, lecturerName],
  );

  const current: TermSchedule = useMemo(
    () => ({
      opens,
      closes,
      mwf: [...mwf],
      ttf: [...ttf],
      lectures: lectures.map(({ date, lecturerId, content, kinds }) => ({ date, lecturerId, content, kinds })),
    }),
    [opens, closes, mwf, ttf, lectures],
  );
  /** 항목마다 따로 저장하므로 바뀐 항목도 따로 센다 */
  const partDirty = useMemo<Record<TermPart, boolean>>(
    () => ({
      dates: current.opens !== saved.opens || current.closes !== saved.closes,
      mwf: !sameDates(current.mwf, saved.mwf),
      ttf: !sameDates(current.ttf, saved.ttf),
      lectures: lectureKey(current.lectures) !== lectureKey(saved.lectures),
    }),
    [current, saved],
  );
  const dirtyParts = useMemo(() => PART_ORDER.filter((p) => partDirty[p]), [partDirty]);
  const dirty = dirtyParts.length > 0;

  /** 앞뒤 달로 이어지는 수업일 수 (강의가 다음 달까지 이어지는 기수) */
  const spill = useMemo(
    () => ({
      mwf: [...mwf].filter((d) => !d.startsWith(monthPrefix)).length,
      ttf: [...ttf].filter((d) => !d.startsWith(monthPrefix)).length,
    }),
    [mwf, ttf, monthPrefix],
  );

  // 저장하지 않고 창을 닫거나 새로고침하면 한 번 묻는다
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const warn = (text: string) => setNotice({ kind: "warning", text });

  const go = (delta: number) => {
    if (dirty && !window.confirm("저장하지 않은 변경이 있어요. 다른 달로 이동하면 사라집니다. 이동할까요?")) return;
    const t = shiftMonth(year, month, delta);
    startNavigating(() => router.push(`/admin/sections?term=${termKey(t.y, t.m)}`, { scroll: false }));
  };

  /** 앞뒤 달 날짜를 찍었을 때 어느 기수로 들어가는지 덧붙이는 안내 */
  const spillNote = (date: string, inMonth: boolean) =>
    inMonth ? "" : `${labelKo(date, true)}은 다른 달 날짜지만 ${year}년 ${month}월 기수 일정으로 저장돼요.`;

  const settle = (...parts: string[]) => {
    const text = parts.filter(Boolean).join(" ");
    setNotice(text ? { kind: "info", text } : null);
  };

  const toggleTrack = (track: Track, date: string, inMonth: boolean) => {
    // 한 날짜는 한 기수(월)의 수업일로만 쓴다 — 두 기수에 잡히면 수강생 회차가 겹친다
    const taken = otherTerm.get(date);
    if (taken && !mwf.has(date) && !ttf.has(date)) {
      warn(`${labelKo(date, true)}은 ${taken.year}년 ${taken.month}월 기수가 ${TRACK_LABEL[taken.track]} 수업일로 쓰고 있어요. 먼저 그 달 달력에서 빼야 이 달에 쓸 수 있어요.`);
      return;
    }
    const other: Track = track === "mwf" ? "ttf" : "mwf";
    const mine = track === "mwf" ? mwf : ttf;
    const theirs = track === "mwf" ? ttf : mwf;
    const setMine = track === "mwf" ? setMwf : setTtf;
    const setTheirs = track === "mwf" ? setTtf : setMwf;

    if (mine.has(date)) {
      if (locked.has(`${track}|${date}`)) {
        warn(`${labelKo(date)} ${TRACK_LABEL[track]} 회차에는 다시보기가 등록되어 있어 뺄 수 없어요. 먼저 다시보기를 삭제해 주세요.`);
        return;
      }
      const next = new Set(mine);
      next.delete(date);
      setMine(next);
      setNotice(null);
      return;
    }
    let moved = "";
    if (theirs.has(date)) {
      if (locked.has(`${other}|${date}`)) {
        warn(`${labelKo(date)} ${TRACK_LABEL[other]} 회차에는 다시보기가 등록되어 있어 옮길 수 없어요.`);
        return;
      }
      const nextTheirs = new Set(theirs);
      nextTheirs.delete(date);
      setTheirs(nextTheirs);
      moved = `${labelKo(date)}을 ${TRACK_LABEL[other]}에서 ${TRACK_LABEL[track]}으로 옮겼어요. 한 날짜는 한 트랙에만 들어가요.`;
    }
    const next = new Set(mine);
    next.add(date);
    setMine(next);
    settle(moved, spillNote(date, inMonth));
  };

  const toggleLecture = (date: string, inMonth: boolean) => {
    if (brush.lecturerId === null) {
      warn("특강 강사 명단이 비어 있어요. 관리자에게 강사 등록을 요청해 주세요.");
      return;
    }
    const content = brush.content.trim();
    const kinds = sortLectureKinds(brush.kinds);
    if (kinds.length === 0 && content === "") {
      warn("특강 종류를 하나 이상 고르거나 내용을 적은 뒤 날짜를 눌러 주세요.");
      return;
    }
    const same = (l: Lecture) =>
      l.date === date && l.lecturerId === brush.lecturerId && l.content.trim() === content && sortLectureKinds(l.kinds).join("+") === kinds.join("+");
    const hit = lectures.find(same);
    if (hit) {
      setLectures(lectures.filter((l) => l.key !== hit.key));
      setNotice(null);
      return;
    }
    setLectures([...lectures, { key: crypto.randomUUID(), date, lecturerId: brush.lecturerId, content, kinds }]);
    settle(spillNote(date, inMonth));
  };

  const onDay = (date: string, inMonth: boolean) => {
    if (readOnly) return;
    if (!mode) {
      setNotice({ kind: "info", text: "먼저 위에서 개강일 · 종강일 · 월수금 · 화목금 · 특강 중 하나를 골라 주세요." });
      return;
    }
    // 강의가 다음 달까지 이어질 수 있어 달력에 함께 보이는 앞뒤 달 날짜도 이 기수의 수업일·특강으로 찍는다
    if (mode === "opens") {
      setOpens(opens === date ? null : date);
      setNotice(null);
    } else if (mode === "closes") {
      setCloses(closes === date ? null : date);
      setNotice(null);
    } else if (mode === "lecture") {
      toggleLecture(date, inMonth);
    } else {
      toggleTrack(mode, date, inMonth);
    }
  };

  const updateLecture = (key: string, patch: Partial<TermLecture>) => setLectures(lectures.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** 고른 항목만 저장한다. parts 를 비우면 전부 저장 */
  const save = (parts: TermPart[]) => {
    if (readOnly || parts.length === 0) return;
    const fail = (text: string) => setResult({ kind: "warning", text });
    if (parts.includes("dates")) {
      if (!opens || !closes) {
        fail("개강일과 종강일을 달력에서 찍어 주세요. [개강일]·[종강일] 버튼을 누른 뒤 날짜를 누르면 됩니다.");
        return;
      }
      if (closes < opens) {
        fail("종강일은 개강일과 같거나 그 뒤여야 해요.");
        return;
      }
    }
    if (parts.includes("lectures")) {
      const empty = sortedLectures.find((l) => l.kinds.length === 0 && !l.content.trim());
      if (empty) {
        fail(`${labelKo(empty.date)} 특강은 종류를 하나 이상 고르거나 내용을 적어 주세요.`);
        return;
      }
    }
    const whole = parts.length === PART_ORDER.length;
    setSavingPart(whole ? "all" : parts[0]);
    setResult(null);
    startSaving(async () => {
      const res = await saveTermSchedule({
        year,
        month,
        opens,
        closes,
        mwf: [...mwf].sort(),
        ttf: [...ttf].sort(),
        lectures: sortedLectures.map(({ date, lecturerId, content, kinds }) => ({
          date,
          lecturerId,
          content: content.trim(),
          kinds: sortLectureKinds(kinds),
        })),
        parts,
      });
      setSavingPart(null);
      if (!res.ok) {
        setResult({ kind: "warning", text: res.error });
        return;
      }
      const applied = res.sections ? ` · 이 달 반 ${res.sections}개의 수업일에 반영` : "";
      setNotice(null);
      setResult({
        kind: "success",
        text: whole
          ? `${month}월 일정을 ${hasSaved ? "저장" : "생성"}했어요. 월수금 ${res.mwf}회 · 화목금 ${res.ttf}회 · 특강 ${res.lectures}개${applied}`
          : `${parts.map((x) => PART_LABEL[x]).join(" · ")}만 저장했어요. 월수금 ${res.mwf}회 · 화목금 ${res.ttf}회 · 특강 ${res.lectures}개${applied}`,
      });
      router.refresh();
    });
  };

  const exportImage = async () => {
    setExporting(true);
    try {
      await downloadCalendarImage({ year, month, mwf: [...mwf], ttf: [...ttf] });
    } catch {
      warn("이미지를 만들지 못했어요. 새로고침한 뒤 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  };

  const partSummary = useMemo<Record<TermPart, string>>(() => {
    const track = (n: number, over: number) => `${n}회${over > 0 ? ` · 다른 달 ${over}회` : ""}`;
    return {
      dates: `${opens ? shortDate(opens) : "미정"} → ${closes ? shortDate(closes) : "미정"}`,
      mwf: track(mwf.size, spill.mwf),
      ttf: track(ttf.size, spill.ttf),
      lectures: lectures.length === 0 ? "없음" : `${lectures.length}개`,
    };
  }, [opens, closes, mwf, ttf, spill, lectures]);

  const classDates = [...mwf, ...ttf].sort();
  const beforeOpens = opens ? classDates.filter((d) => d < opens) : [];
  const afterCloses = closes ? classDates.filter((d) => d > closes) : [];
  const activeMode = MODES.find((m) => m.value === mode);

  return (
    <div className="space-y-4">
      {/* 달 이동 + 이미지 저장 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(-1)} disabled={navigating} className="btn-ghost !px-3.5 !py-2 text-2xl leading-none" aria-label="지난달 보기">
            ‹
          </button>
          <h2 id="term-calendar-title" className="min-w-[8.5rem] text-center text-xl font-black tabular-nums text-ink sm:text-2xl">
            {year}년 {month}월
          </h2>
          <button type="button" onClick={() => go(1)} disabled={navigating} className="btn-ghost !px-3.5 !py-2 text-2xl leading-none" aria-label="다음달 보기">
            ›
          </button>
          {navigating && <span className="ml-1 text-xs font-semibold text-mist">불러오는 중…</span>}
        </div>
        <button type="button" onClick={exportImage} disabled={exporting} className="btn-secondary ml-auto !py-2" title="월수금·화목금 수업일이 표시된 달력 이미지를 저장합니다">
          <Icon name="download" size={18} />
          {exporting ? "이미지 만드는 중…" : "이미지 저장"}
        </button>
      </div>

      {/* 찍을 항목 */}
      {!readOnly && (
        <div className="space-y-2">
          <div role="group" aria-label="달력에 찍을 항목" className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={mode === m.value}
                onClick={() => {
                  setMode(mode === m.value ? null : m.value);
                  setNotice(null);
                }}
                className={cn("rounded-full border px-1 py-2 text-sm font-black transition sm:px-5", mode === m.value ? m.on : m.off)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate">{activeMode ? activeMode.hint : "위 버튼 하나를 고른 뒤 달력에서 날짜를 누르세요."}</p>
        </div>
      )}

      {/* 특강 설정 — 강사·종류(중복 선택)·내용을 정한 뒤 날짜를 누른다 */}
      {!readOnly && mode === "lecture" && (
        <div className="space-y-3 rounded-xl2 border border-violet-200 bg-violet-50/60 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <span className="label">강사</span>
              <div className="flex gap-2">
                {lecturers.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={brush.lecturerId === t.id}
                    onClick={() => setBrush({ ...brush, lecturerId: t.id })}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-bold transition",
                      brush.lecturerId === t.id ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-paper text-violet-700 hover:border-violet-400",
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="lecture-brush-content" className="label">
                내용 <span className="font-semibold text-slate">(선택 — 종류만 골라도 돼요)</span>
              </label>
              <input
                id="lecture-brush-content"
                value={brush.content}
                maxLength={100}
                onChange={(e) => setBrush({ ...brush, content: e.target.value })}
                placeholder="예: 파트2 집중"
                className="input !py-2"
              />
            </div>
          </div>
          <div>
            <span className="label">
              종류 <span className="font-semibold text-slate">(여러 개 고를 수 있어요)</span>
            </span>
            <div role="group" aria-label="특강 종류" className="flex flex-wrap gap-2">
              {LECTURE_KINDS.map((k) => (
                <KindChip
                  key={k.value}
                  label={k.label}
                  on={brush.kinds.includes(k.value)}
                  onClick={() =>
                    setBrush({
                      ...brush,
                      kinds: brush.kinds.includes(k.value) ? brush.kinds.filter((x) => x !== k.value) : sortLectureKinds([...brush.kinds, k.value]) as LectureKind[],
                    })
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      {/* 달력 */}
      <div role="grid" aria-labelledby="term-calendar-title" aria-busy={navigating} className={cn("select-none transition-opacity", navigating && "opacity-60")}>
        <div role="row" className="grid grid-cols-7 gap-1 pb-1 text-center text-xs font-black sm:text-sm">
          {WEEKDAY_KO.map((w, i) => (
            <div key={w} role="columnheader" className={cn("py-1", i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-slate")}>
              {w}
            </div>
          ))}
        </div>
        {rows.map((week) => (
          <div key={week[0].date} role="row" className="grid grid-cols-7 gap-1 pb-1">
            {week.map((c) => {
              const wd = weekdayOf(c.date);
              const names = holidays.get(c.date);
              const red = wd === 0 || !!names;
              const track: Track | null = mwf.has(c.date) ? "mwf" : ttf.has(c.date) ? "ttf" : null;
              const dayLectures = lecturesByDate.get(c.date) ?? [];
              // 달력에는 종류를 짧게 (RC · LC · 1차 모의고사 · 2차 모의고사). 종류가 없으면 "특강"
              const dayKinds = [...new Set(dayLectures.flatMap((l) => (l.kinds.length > 0 ? sortLectureKinds(l.kinds) : ["특강"])))];
              const dayTags = dayKinds.map(lectureKindShort);
              const isOpens = opens === c.date;
              const isCloses = closes === c.date;
              const hasReplay = locked.has(`mwf|${c.date}`) || locked.has(`ttf|${c.date}`);
              const marked = !!track || isOpens || isCloses || dayLectures.length > 0;
              // 다른 기수(월)가 이미 수업일로 쓰는 날짜 — 이 달에서는 고를 수 없다
              const taken = !track ? otherTerm.get(c.date) : undefined;
              const label = [
                labelKo(c.date, !c.inMonth),
                names?.join(", "),
                isOpens && "개강일",
                isCloses && "종강일",
                track && `${TRACK_LABEL[track]} 수업일`,
                dayTags.length > 0 && `특강 ${dayTags.join(", ")}`,
                taken && `${taken.month}월 기수가 쓰는 날짜`,
                hasReplay && "다시보기 있음",
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <button
                  key={c.date}
                  type="button"
                  role="gridcell"
                  aria-label={label}
                  aria-selected={marked}
                  onClick={() => onDay(c.date, c.inMonth)}
                  disabled={readOnly}
                  className={cn(
                    "relative flex min-h-[4.5rem] min-w-0 flex-col gap-0.5 overflow-hidden rounded-lg border p-1 text-left transition sm:min-h-[6.25rem] sm:p-1.5",
                    c.inMonth ? "border-line bg-paper" : "border-dashed border-line bg-surface",
                    !c.inMonth && !marked && "opacity-60",
                    taken && "bg-line/40",
                    !readOnly && "hover:border-brand-300 hover:bg-brand-50/50",
                    readOnly && "cursor-default",
                  )}
                >
                  <span className="flex items-center justify-between gap-0.5">
                    {/* 다른 달 날짜는 "10/1" 로 적어 어느 달인지 바로 보이게 한다 (이미지 저장과 같은 표기) */}
                    <span
                      className={cn(
                        "flex h-5 min-w-5 items-center justify-center whitespace-nowrap rounded-full px-0.5 text-xs font-black tabular-nums sm:h-6 sm:min-w-6 sm:text-sm",
                        !c.inMonth ? "text-mist" : red ? "text-red-600" : wd === 6 ? "text-blue-600" : "text-ink",
                        c.date === today && "bg-ink/10",
                      )}
                    >
                      {c.inMonth ? c.day : `${Number(c.date.slice(5, 7))}/${c.day}`}
                    </span>
                    {hasReplay && <Icon name="replay" size={12} className="opacity-70" />}
                  </span>
                  {/* 무슨 날인지 칸 안에 적는다. 좁은 화면은 두 줄까지 (추석 / 연휴), 넓으면 한 줄 */}
                  {names && (
                    <span className="line-clamp-2 text-[9px] font-bold leading-[1.15] text-red-600 sm:line-clamp-1 sm:text-[10px] sm:leading-tight">
                      {names.join("·")}
                    </span>
                  )}
                  <span className="mt-auto flex min-w-0 flex-col gap-0.5">
                    {(isOpens || isCloses) && (
                      <span className="flex gap-0.5">
                        {isOpens && <Tag className="border border-emerald-500 bg-emerald-50 text-emerald-700">개강</Tag>}
                        {isCloses && <Tag className="border border-emerald-500 bg-emerald-50 text-emerald-700">종강</Tag>}
                      </span>
                    )}
                    {track && <Tag className={track === "mwf" ? "bg-brand-500 text-white" : "bg-ink text-white"}>{TRACK_LABEL[track]}</Tag>}
                    {taken && (
                      <Tag className="bg-mist/25 text-slate">
                        {taken.month}월<span className="hidden sm:inline"> 기수</span>
                      </Tag>
                    )}
                    {dayKinds.slice(0, 2).map((k) => (
                      <Tag key={k} className="bg-violet-100 text-violet-800">
                        <span className="sm:hidden">{lectureKindTiny(k)}</span>
                        <span className="hidden sm:inline">{lectureKindShort(k)}</span>
                      </Tag>
                    ))}
                    {dayKinds.length > 2 && <span className="text-center text-[10px] font-bold text-violet-700">+{dayKinds.length - 2}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 범례 · 이 달 공휴일 */}
      <div className="space-y-1.5 text-xs text-slate">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded bg-brand-500" />
            월수금
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded bg-ink" />
            화목금
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded border border-emerald-500 bg-emerald-50" />
            개강 · 종강
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded bg-violet-100" />
            특강
          </li>
          <li className="flex items-center gap-1.5">
            <span className="font-black text-red-600">빨간 날</span>
            일요일 · 공휴일
          </li>
          <li className="flex items-center gap-1.5">
            <Icon name="replay" size={12} />
            다시보기 등록됨 (뺄 수 없음)
          </li>
          {otherTermDates.length > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded bg-mist/30" />
              다른 달 기수가 쓰는 날짜 (이 달에는 못 씀)
            </li>
          )}
        </ul>
        {monthHolidays.length > 0 && (
          <p>
            <span className="font-bold text-red-600">{month}월 공휴일</span>{" "}
            {monthHolidays.map(([d, n]) => `${Number(d.slice(8))}일 ${n.join("·")}`).join(" · ")}
          </p>
        )}
        {!hasHolidayData(year) && (
          <p className="text-mist">
            {year}년 공휴일 정보가 없어요. ({HOLIDAY_YEAR_RANGE.from}~{HOLIDAY_YEAR_RANGE.to}년만 표시)
          </p>
        )}
      </div>

      {/* 특강 목록 */}
      {lectures.length > 0 && (
        <section aria-labelledby="lecture-list-title" className="rounded-xl2 border border-violet-200">
          <h3 id="lecture-list-title" className="border-b border-violet-100 bg-violet-50/60 px-4 py-2.5 text-sm font-black text-ink">
            특강 {lectures.length}개 <span className="font-semibold text-slate">— 강사·종류·내용은 여기서 바로 고칠 수 있어요</span>
          </h3>
          <ul className="divide-y divide-line">
            {sortedLectures.map((l) => {
              const blank = l.kinds.length === 0 && !l.content.trim();
              return (
                <li key={l.key} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-28 shrink-0 text-sm font-black text-violet-700">{labelKo(l.date)}</span>
                    <div className="flex shrink-0 gap-1.5" role="group" aria-label={`${labelKo(l.date)} 특강 강사`}>
                      {lecturers.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          disabled={readOnly}
                          aria-pressed={l.lecturerId === t.id}
                          onClick={() => updateLecture(l.key, { lecturerId: t.id })}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-bold transition",
                            l.lecturerId === t.id ? "border-violet-600 bg-violet-600 text-white" : "border-line bg-paper text-slate hover:border-violet-300",
                          )}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setLectures(lectures.filter((x) => x.key !== l.key))}
                        className="btn-ghost ml-auto shrink-0 !px-3 !py-1.5 text-xs"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <div role="group" aria-label={`${labelKo(l.date)} 특강 종류`} className="flex flex-wrap gap-1.5">
                    {LECTURE_KINDS.map((k) => (
                      <KindChip
                        key={k.value}
                        small
                        label={k.label}
                        on={l.kinds.includes(k.value)}
                        onClick={() =>
                          !readOnly &&
                          updateLecture(l.key, {
                            kinds: l.kinds.includes(k.value) ? l.kinds.filter((x) => x !== k.value) : sortLectureKinds([...l.kinds, k.value]),
                          })
                        }
                      />
                    ))}
                  </div>
                  <input
                    aria-label={`${labelKo(l.date)} 특강 내용`}
                    value={l.content}
                    maxLength={100}
                    disabled={readOnly}
                    onChange={(e) => updateLecture(l.key, { content: e.target.value })}
                    placeholder="내용 (선택) — 종류만 골라도 됩니다"
                    className={cn("input w-full !py-2 text-sm", blank && "border-amber-300")}
                  />
                  {blank && <p className="text-xs font-bold text-amber-600">종류를 하나 이상 고르거나 내용을 적어 주세요.</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(beforeOpens.length > 0 || afterCloses.length > 0) && (
        <Alert kind="warning" title="개강일·종강일 밖에 수업일이 있어요">
          {beforeOpens.length > 0 && <p>개강일 전 수업일 (아직 수강생 권한이 열리지 않아요): {beforeOpens.map(shortDate).join(", ")}</p>}
          {afterCloses.length > 0 && <p>종강일 뒤 수업일 (다시보기를 볼 수 없어요): {afterCloses.map(shortDate).join(", ")}</p>}
        </Alert>
      )}

      {/* 저장 결과 — 누른 버튼 바로 옆에서 보이도록 여기에 둔다 */}
      {result && <Alert kind={result.kind}>{result.text}</Alert>}

      {/* 항목별 저장 — 개강·종강 / 월수금 / 화목금 / 특강을 따로 저장한다 */}
      {!readOnly && (
        <section aria-labelledby="term-parts-title" className="overflow-hidden rounded-xl2 border border-line">
          <h3 id="term-parts-title" className="border-b border-line bg-surface px-4 py-2.5 text-sm font-black text-ink">
            따로 저장 <span className="font-semibold text-slate">— 항목마다 나눠서 저장할 수 있어요. 한 항목을 저장해도 나머지 편성은 그대로 남습니다</span>
          </h3>
          <ul className="divide-y divide-line">
            {PART_ORDER.map((part) => {
              const changed = partDirty[part];
              return (
                <li key={part} className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
                  <span className="w-16 shrink-0 text-sm font-black text-ink sm:w-20">{PART_LABEL[part]}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate sm:text-sm">{partSummary[part]}</span>
                  {changed && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">변경됨</span>}
                  <button
                    type="button"
                    onClick={() => save([part])}
                    disabled={saving || !changed}
                    className="btn-secondary shrink-0 !px-3 !py-1.5 text-xs disabled:opacity-40"
                  >
                    {savingPart === part ? "저장 중…" : "저장"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 요약 + 전체 저장 */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-10 flex items-center justify-between gap-3 rounded-xl2 border border-line bg-paper/95 p-2.5 shadow-soft backdrop-blur sm:p-3 md:bottom-4">
        <dl className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs sm:gap-x-4 sm:text-sm">
          <div className="flex gap-1.5">
            <dt className="font-semibold text-slate">개강</dt>
            <dd className={cn("font-black", opens ? "text-ink" : "text-amber-600")}>{opens ? shortDate(opens) : "미정"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-semibold text-slate">종강</dt>
            <dd className={cn("font-black", closes ? "text-ink" : "text-amber-600")}>{closes ? shortDate(closes) : "미정"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-semibold text-slate">월수금</dt>
            <dd className="font-black tabular-nums text-brand-600">{mwf.size}회</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-semibold text-slate">화목금</dt>
            <dd className="font-black tabular-nums text-ink">{ttf.size}회</dd>
          </div>
          {spill.mwf + spill.ttf > 0 && (
            <div className="flex gap-1.5">
              <dt className="font-semibold text-slate">다른 달</dt>
              <dd className="font-black tabular-nums text-slate">{spill.mwf + spill.ttf}회</dd>
            </div>
          )}
          <div className="flex gap-1.5">
            <dt className="font-semibold text-slate">특강</dt>
            <dd className="font-black tabular-nums text-violet-700">{lectures.length}개</dd>
          </div>
        </dl>
        {!readOnly && (
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
            {dirty && hasSaved && <span className="text-[11px] font-bold text-amber-600 sm:text-xs">저장 안 됨 {dirtyParts.length}개</span>}
            <button type="button" onClick={() => save(PART_ORDER)} disabled={saving || (hasSaved && !dirty)} className="btn-primary !px-4 !py-2.5 sm:!px-5">
              {savingPart === "all" ? "저장 중…" : !hasSaved ? "생성하기" : dirty ? "전체 저장" : "저장됨"}
            </button>
          </div>
        )}
      </div>
      {sectionCount > 0 && !readOnly && (
        <p className="text-xs text-mist">저장하면 이 달 반 {sectionCount}개의 수업일·개강일·종강일이 달력대로 바뀌고, 수강생 시간표와 다시보기 회차도 함께 바뀝니다.</p>
      )}
    </div>
  );
}

function KindChip({ label, on, onClick, small = false }: { label: string; on: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border font-bold transition",
        small ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm",
        on ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-paper text-violet-700 hover:border-violet-400",
      )}
    >
      {label}
    </button>
  );
}

function Tag({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("block truncate rounded px-0.5 py-px text-center text-[9px] font-black leading-tight sm:px-1 sm:text-[11px]", className)}>{children}</span>;
}
