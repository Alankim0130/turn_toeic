import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, todayKST } from "@/lib/utils";
import { courseShortName, PROGRAM_LABEL, PROGRAMS, SEASON_LABEL, seasonOfMonth, VACATION_MONTHS, type Program } from "@/lib/timetable";
import { buildBlockTree, dashLabel } from "@/lib/time-blocks";
import { HOURS, minuteOptions, splitTime } from "@/lib/timetable-admin";
import {
  bundleCandidates,
  chooseMonthSource,
  madeMonths,
  missingOf,
  parseYm,
  sameYm,
  shiftYm,
  slotKinds,
  slotLabelOf,
  slotMinutes,
  sourceNote,
  ymKey,
  ymLabel,
  type SlotKind,
  type YM,
} from "@/lib/timetable-month";
import { bundleHours, createMonthTimetable, deleteTimetableSlot, saveTimetableLevelNote, saveTimetableSlot } from "./actions";

export const metadata: Metadata = { title: "시간표 설정", robots: { index: false } };

/**
 * 시간표 설정 — **달마다 한 벌** (2026-09-29 Alan — "월별로 디테일하게 확인하기 위해서 최상단에 월별 설정을 할 수 있으면 좋겠어.
 * 1월방학 시간표를 11월이나 12월달에 미리 세팅을 할예정인데, 그때 1월 시간표를 정확하게 세팅하고, 2월 시간표까지 미리").
 * 처음(2026-09-23)에는 평달·방학달 두 벌이었다.
 *
 * 맨 위에서 달을 고르고, 카드는 브로슈어처럼 **과정 × 레벨**이다. 시간 단위 줄마다 편성표처럼 **과정 A/B 와 트랙별 과목 LC/RC** 를 고른다
 * ("시간대마다 A과정과 B과정이 LC, RC가 구분되어있잖아? 이것도 확인할 수 있고, 또 변경이 가능하면 좋겠어" · "시간대별로 과목도 미리 보여주면").
 * 새 달은 앞선 달에서 가져와 과정만 뒤집어 채운다 — 규칙은 `lib/timetable-month.ts`.
 * **고치면 그 달 반에 바로 적용된다** (DB 트리거, 마이그레이션 20260929160000) — 담당 강사 · LC 교재 · 다시보기 짝 · 불라방 · 출석 · 권한이 따라온다.
 *
 * **한달완성 줄**(10:00~12:10)은 따로 적는 시간대가 아니라 두 시간을 이어 듣는 반이다 (2026-09-29 Alan "왜 하나 더 세팅되어있는거야?") —
 * 한달완성 수강증의 수강시간이 `10:00~12:10` 으로 찍혀 자동 등업이 이 반을 찾고, 이 반 하나에 넣으면 두 시간 권한이 저절로 열리며, 출석도 하루 한 번이다.
 * 그래서 두 시간 아래에 붙여 보여 주고, 두 시간의 시각을 바꾸면 따라 바뀐다. 레벨은 늘지 않는다 (Alan) — `timetable_levels` 행 그대로다.
 */
export default async function AdminTimetablePage({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; error?: string }> }) {
  // 강사·관리자만 — 조교는 시간표를 고치지 않는다
  await requireStaff();
  const sp = await searchParams;
  const today = todayKST();
  const thisMonth: YM = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
  const ym = parseYm(sp.month, thisMonth);
  const key = ymKey(ym);
  const season = seasonOfMonth(ym.m);

  const supabase = await createClient();
  const [{ data: levelRows }, { data: index }, { data: slotRows }, { data: courses }, { data: term }] = await Promise.all([
    supabase.from("timetable_levels").select("level, note, sort_order").order("sort_order").order("level"),
    // 시간표가 있는 달 · 계절 기본 줄이 있는가 (새 달의 출발점)
    supabase.from("timetable_slots").select("year, month, season"),
    supabase
      .from("timetable_slots")
      .select("id, year, month, level, program, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf")
      .eq("year", ym.y)
      .eq("month", ym.m)
      .order("start_time")
      .order("end_time"),
    supabase.from("courses").select("id, name, program, target_score").eq("is_active", true),
    supabase.from("terms").select("id").eq("year", ym.y).eq("month", ym.m).maybeSingle(),
  ]);
  // 이 달 반 — 줄마다 "이 달 반 N개" (지울 수 있는지 · 고치면 몇 개에 적용되는지)
  const { data: sectionRows } = term
    ? await supabase.from("class_sections").select("time_block, course_id").eq("term_id", term.id)
    : { data: [] as { time_block: string | null; course_id: number }[] };

  type SlotRow = NonNullable<typeof slotRows>[number];
  const levels = levelRows ?? [];
  const slots = slotRows ?? [];
  const made = madeMonths(index ?? []);
  const source = chooseMonthSource(ym, made, (s) => (index ?? []).some((r) => r.year == null && r.season === s));
  const kinds = slotKinds(slots);
  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));
  const sectionCount = new Map<string, number>();
  for (const s of sectionRows ?? []) {
    const c = courseById.get(s.course_id);
    if (!s.time_block || !c) continue;
    const k = `${c.target_score}|${c.program}|${s.time_block}`;
    sectionCount.set(k, (sectionCount.get(k) ?? 0) + 1);
  }
  const usedBy = (r: SlotRow) => sectionCount.get(`${r.level}|${r.program}|${slotLabelOf(r)}`) ?? 0;
  const missingRows = slots.filter((r) => missingOf(kinds.get(r.id)!, r).length > 0).length;

  // 카드 제목: 점수보장반은 레벨 숫자, 스파르타는 강좌 이름의 짧은 이름 (`650 중급속성`) — 이름은 courses 한곳
  const cardTitle = (level: number, program: Program) => {
    if (program === "score") return `${level}`;
    const c = (courses ?? []).find((c) => c.program === program && c.target_score === level);
    return c ? `${level} ${courseShortName(c.name)}` : `${level} ${PROGRAM_LABEL[program]}`;
  };
  // 스파르타 · 2주완성 카드는 그 레벨에 그 과정 강좌가 있을 때만 (스파르타 850 은 없다 · 2주완성은 850 만)
  const hasProgram = (level: number, program: Program) => program === "score" || (courses ?? []).some((c) => c.program === program && c.target_score === level);

  const prev = shiftYm(ym, -1);
  const next = shiftYm(ym, 1);
  const href = (m: YM) => `/admin/timetable?month=${ymKey(m)}`;
  const vacationMonths = VACATION_MONTHS.map((m) => `${m}`).join("·");
  const empty = slots.length === 0;
  // 가져올 곳이 있으면 먼저 만들기부터 — 빈 카드에 하나씩 더하다가 지난달과 어긋나지 않게
  const showCards = !empty || source.kind === "none";

  return (
    <>
      <PageHeader
        icon="timeslot"
        title="시간표 설정"
        description="달마다 한 벌이에요. 과정 A/B 와 과목 LC/RC 도 여기서 정하고, 고치면 그 달 반과 학생에게 바로 적용돼요."
      >
        <Link href={`/admin/sections?term=${key}`} className="btn-secondary">
          <Icon name="calendar" size={18} />
          {ym.m}월 반 편성
        </Link>
      </PageHeader>

      {sp.ok && <Alert kind="success" className="mb-4">{sp.ok}</Alert>}
      {sp.error && <Alert kind="warning" className="mb-4">{sp.error}</Alert>}

      {/* 달 고르기 — "최상단에 월별 설정" (2026-09-29 Alan) */}
      <nav aria-label="달 고르기" className="card mb-3 flex items-center justify-between gap-2 p-2 sm:p-3">
        <Link href={href(prev)} className="btn-ghost !px-3 !py-2" aria-label={`${ymLabel(prev)} 시간표 보기`}>
          <span aria-hidden className="text-2xl font-black leading-none">‹</span>
          <span className="hidden text-sm sm:inline">{prev.m}월</span>
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-xl font-black tabular-nums text-ink">{ymLabel(ym)}</p>
          <p className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-xs">
            <span className={cn("rounded-full px-2 py-0.5 font-black", season === "vacation" ? "bg-amber-100 text-amber-800" : "bg-brand-50 text-brand-700")}>
              {SEASON_LABEL[season]}
            </span>
            {sameYm(ym, thisMonth) ? (
              <span className="font-semibold text-slate">이번 달</span>
            ) : (
              <Link href={href(thisMonth)} className="font-semibold text-brand-600 underline-offset-2 hover:underline">
                이번 달로
              </Link>
            )}
          </p>
        </div>
        <Link href={href(next)} className="btn-ghost !px-3 !py-2" aria-label={`${ymLabel(next)} 시간표 보기`}>
          <span className="hidden text-sm sm:inline">{next.m}월</span>
          <span aria-hidden className="text-2xl font-black leading-none">›</span>
        </Link>
      </nav>
      {made.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-0.5 font-bold text-slate">만든 달</span>
          {made.map((m) => (
            <Link
              key={ymKey(m)}
              href={href(m)}
              aria-current={sameYm(m, ym) ? "page" : undefined}
              className={cn(
                "rounded-full border px-2.5 py-1 font-bold tabular-nums transition",
                sameYm(m, ym) ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:text-brand-600",
              )}
            >
              {m.y}.{m.m}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-5 rounded-xl2 border border-brand-200 bg-brand-50/60 p-4 text-sm text-ink-soft">
        <p>
          <strong className="text-ink">{ymLabel(ym)}</strong> 시간표예요 ({SEASON_LABEL[season]} — 방학달은 {vacationMonths}월).
          {term ? (
            <> 이 달 반 <strong className="text-ink">{sectionRows?.length ?? 0}개</strong>가 이 표를 따라요.</>
          ) : (
            <> 아직 이 달 반이 없어요 — 반 편성에서 일괄 개설하면 이 표대로 만들어져요.</>
          )}
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-slate">
          <li>· <strong className="text-ink-soft">과정 A/B · 과목 LC/RC</strong>를 여기서 정해요. 고치면 이 달 반에 바로 적용돼요 — 담당 강사 · 학생의 LC 교재 · 저녁 반 다시보기 짝 · 불라방 · 출석 시간이 함께 맞춰져요.</li>
          <li>· 새 달은 지난달 시간표를 가져와 <strong className="text-ink-soft">과정 A/B 만 뒤집어</strong> 미리 채워요 (과목은 그대로). 방학달로 넘어가거나 평달로 돌아오는 달은 시간표가 달라 시간만 가져와요.</li>
          <li>· <strong className="text-ink-soft">한달완성</strong> 줄은 두 시간을 이어 듣는 반이에요. 한달완성 수강증의 수강시간(예: 10:00~12:10)이 이 반을 찾고, 두 시간 권한이 저절로 열려요. 두 시간의 시각을 바꾸면 따라 바뀌어요.</li>
          <li>· <strong className="text-ink-soft">화목금 인강</strong>을 켠 줄이 저녁 줄이에요 — 그 줄 화목금 반은 인강, 불라방은 라이브만 하고 다시보기는 오전 반 것을 봐요.</li>
          <li>· 이 달 반이 쓰는 시간대는 지울 수 없어요. 반 편성에서 반을 먼저 정리해 주세요.</li>
        </ul>
      </div>

      {missingRows > 0 && (
        <Alert kind="warning" className="mb-5">
          과정·과목을 아직 안 고른 시간대가 <strong>{missingRows}개</strong>예요. 고르기 전까지 그 시간 반은 담당 강사 · LC 교재 · 다시보기 짝이 정해지지 않아요.
        </Alert>
      )}

      {empty && (
        <section aria-labelledby="month-empty-title" className="card mb-6 p-5 sm:p-6">
          <h2 id="month-empty-title" className="text-lg font-black text-ink">
            {ymLabel(ym)} 시간표가 아직 없어요
          </h2>
          <p className="mt-1 text-sm text-slate">{sourceNote(ym, source)}</p>
          {source.kind !== "none" && (
            <form action={createMonthTimetable} className="mt-4">
              <input type="hidden" name="month" value={key} />
              <button type="submit" className="btn-primary">
                <Icon name="timeslot" size={18} className="brightness-0 invert" />
                {ym.m}월 시간표 만들기
              </button>
            </form>
          )}
        </section>
      )}

      {showCards && (
        <div className="space-y-6">
          {PROGRAMS.map((program) => (
            <section key={program} aria-labelledby={`program-${program}`}>
              <h2 id={`program-${program}`} className="mb-3 text-lg font-black text-ink">{PROGRAM_LABEL[program]}</h2>
              {/* 2주완성 (2026-10-05 Alan "850반 2주완성반이 있어 … 절반만 수업을 듣는거야. 개강일부터 시작") — 반의 종강일은 저절로 정해진다 */}
              {program === "twoweek" && (
                <p className="-mt-2 mb-3 text-xs text-slate">
                  같은 레벨 수업을 <strong className="text-ink">개강일부터 앞 절반</strong>만 들어요 — 반의 종강일은 그 달 수업일(월수금 + 화목금) 앞 절반의 마지막 날로
                  저절로 정해져요 (18일이면 9번째 날). 과정 · 과목은 같은 레벨 수업 것을 써요. 시간은 그 달 같은 레벨 수업 전체와 같게 적어요 —
                  방학달처럼 수업이 통짜 한 줄이면 그 줄과 같은 시간이에요 (그 수업 시간을 지우면 이 줄도 함께 지워져요).
                </p>
              )}
              {/* 카드는 PC 넓은 화면(xl)에서만 두 줄 — 세 줄로 두면 카드가 좁아져 시각이 잘리고 줄마다 접혔다 */}
              <div className="grid gap-4 xl:grid-cols-2">
                {levels.filter((l) => hasProgram(l.level, program)).map((l) => {
                  const title = cardTitle(l.level, program);
                  const group = slots.filter((s) => s.level === l.level && s.program === program);
                  const items = cardItems(group, program);
                  const missing = group.filter((r) => missingOf(kinds.get(r.id)!, r).length > 0).length;
                  return (
                    <article key={`${program}-${l.level}`} className="card p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-black text-ink">
                          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-brand-700">{title}</span>
                        </h3>
                        <span className={cn("text-xs", missing ? "font-bold text-amber-700" : "text-mist")}>
                          {missing ? `안 고른 시간대 ${missing}개` : `${group.length}개 시간대`}
                        </span>
                      </div>

                      <ul className="mt-2 divide-y divide-line">
                        {items.map((it) =>
                          it.kind === "package" ? (
                            <PackageLine key={`p-${it.row.id}`} row={it.row} parts={it.parts} monthKey={key} used={usedBy(it.row)} />
                          ) : it.kind === "bundle" ? (
                            <BundleLine key={`b-${it.first.id}-${it.second.id}`} first={it.first} second={it.second} label={it.label} monthKey={key} />
                          ) : (
                            <SlotRowForm
                              // 저장한 값이 바뀌면 줄을 새로 그린다 — 고르는 칸은 처음 값만 기억해서, 그대로 두면 저장 뒤 옛 값으로 되돌아가 보인다
                              key={`${it.row.id}-${it.row.start_time}-${it.row.end_time}-${it.row.ttf_recorded}-${it.row.book_set}-${it.row.subject_mwf}-${it.row.subject_ttf}`}
                              row={it.row}
                              kind={kinds.get(it.row.id)!}
                              title={title}
                              monthKey={key}
                              used={usedBy(it.row)}
                            />
                          ),
                        )}
                        {group.length === 0 && <li className="py-3 text-sm text-slate">아직 시간대가 없어요. 아래에서 더해 주세요.</li>}
                      </ul>

                      {/* 시간대가 늘면(또는 줄면) 새로 그려 빈칸으로 되돌린다 */}
                      <form key={`add-${group.length}`} action={saveTimetableSlot} className="mt-2 rounded-xl bg-brand-50/60 p-3">
                        <input type="hidden" name="month" value={key} />
                        <input type="hidden" name="level" value={l.level} />
                        <input type="hidden" name="program" value={program} />
                        <p className="mb-2 text-xs font-black text-brand-700">새 시간대</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                          <TimeRange label={`${title} 새 시간대`} />
                          <div className="flex flex-1 items-center justify-between gap-3">
                            {program === "twoweek" ? <span /> : <RecordedCheck />}
                            <button type="submit" className="btn-primary whitespace-nowrap !px-4 !py-2">시간대 더하기</button>
                          </div>
                        </div>
                        {program === "score" && <p className="mt-2 text-[11px] text-slate">더한 뒤 그 줄에서 과정·과목을 골라 주세요.</p>}
                      </form>

                      {program === "score" && (
                        <form action={saveTimetableLevelNote} className="mt-4">
                          <input type="hidden" name="level" value={l.level} />
                          <input type="hidden" name="month" value={key} />
                          <label htmlFor={`note-${l.level}`} className="block text-xs font-bold text-ink-soft">
                            카드 바닥 메모 <span className="font-normal text-slate">— 선택 · 모든 달 공통 · 랜딩 카드 아래에 그대로 나가요</span>
                          </label>
                          <div className="mt-1.5 flex items-center gap-2">
                            <input id={`note-${l.level}`} name="note" defaultValue={l.note ?? ""} maxLength={80} className="input min-w-0 !py-2 text-base" placeholder="비워 두면 나가지 않아요" />
                            <button type="submit" className="btn-secondary shrink-0 whitespace-nowrap !px-4 !py-2">메모 저장</button>
                          </div>
                          <p className="mt-1 text-xs text-slate">인강은 여기 적지 말고 위 줄마다 ‘화목금 인강’ 을 체크하세요.</p>
                        </form>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── 카드 안 줄 순서 ──────────────────────────────────────────────────────── */

type Row = { id: number; level: number; program: string; start_time: string; end_time: string; ttf_recorded: boolean; book_set: string | null; subject_mwf: string | null; subject_ttf: string | null };
type Item<R extends Row> =
  | { kind: "row"; row: R }
  | { kind: "package"; row: R; parts: R[] }
  | { kind: "bundle"; first: R; second: R; label: string };

/**
 * 시간 순서대로 줄을 놓되, 한달완성 줄은 **품은 두 시간 바로 아래**에 둔다 — 세 번째 시간대처럼 나란히 서면 따로 정하는 시간으로 읽힌다.
 * 묶음이 없는 이어지는 두 시간이 있으면 그 아래에 "한달완성으로 묶기" 를 둔다.
 */
function cardItems<R extends Row>(group: R[], program: Program): Item<R>[] {
  const byLabel = new Map(group.map((r) => [slotLabelOf(r), r]));
  const tree = buildBlockTree(group.map(slotLabelOf), { nest: program === "score" });
  const items: Item<R>[] = [];
  const leaves = (n: (typeof tree)[number]): R[] => (n.parts.length === 0 ? [byLabel.get(n.label)!].filter(Boolean) : n.parts.flatMap(leaves));
  for (const node of tree) {
    const row = byLabel.get(node.label);
    if (!row) continue;
    if (node.parts.length === 0) {
      items.push({ kind: "row", row });
      continue;
    }
    const parts = node.parts.flatMap(leaves);
    for (const p of parts) items.push({ kind: "row", row: p });
    items.push({ kind: "package", row, parts });
  }
  if (program === "score") {
    for (const c of bundleCandidates(group)) {
      const at = items.findIndex((it) => it.kind === "row" && it.row.id === c.second.id);
      if (at >= 0) items.splice(at + 1, 0, { kind: "bundle", first: c.first, second: c.second, label: c.label });
    }
  }
  return items;
}

/* ─── 줄 ─────────────────────────────────────────────────────────────────── */

const KIND_NOTE: Record<SlotKind, string> = {
  hour: "시간 단위",
  block: "통짜 · 두 과목 이어 듣기",
  package: "한달완성",
  sparta: "함께 듣는 반의 과정·과목",
  twoweek: "같은 레벨 수업 앞 절반",
};

function SlotRowForm({ row, kind, title, monthKey, used }: { row: Row; kind: SlotKind; title: string; monthKey: string; used: number }) {
  const label = slotLabelOf(row);
  const name = `${title} ${label}`;
  const missing = missingOf(kind, row);
  const minutes = slotMinutes(row);
  return (
    <li className="py-3">
      <form action={saveTimetableSlot} className="space-y-2.5">
        <input type="hidden" name="id" value={row.id} />
        <input type="hidden" name="month" value={monthKey} />
        <input type="hidden" name="level" value={row.level} />
        <input type="hidden" name="program" value={row.program} />
        <TimeRange start={row.start_time} end={row.end_time} label={`${name} 줄`} />
        {(kind === "hour" || kind === "block") && (
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <Seg name="book_set" title="과정" value={row.book_set} options={[["A", "A"], ["B", "B"]]} label={`${name} 과정`} />
            {kind === "hour" ? (
              <>
                <Seg name="subject_mwf" title="월수금" tone="mwf" value={row.subject_mwf} options={[["lc", "LC"], ["rc", "RC"]]} label={`${name} 월수금 과목`} />
                <Seg name="subject_ttf" title="화목금" tone="ttf" value={row.subject_ttf} options={[["lc", "LC"], ["rc", "RC"]]} label={`${name} 화목금 과목`} />
              </>
            ) : (
              <p className="pb-1 text-[11px] text-slate">두 과목을 이어 듣는 줄이라 과목은 없어요. 과정 글자가 LC 교재예요.</p>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          {/* 2주완성 줄에는 인강이 없다 — 같은 레벨 수업(오전 · 주간)의 앞 절반이다 */}
          {kind === "twoweek" ? (
            <p className="text-[11px] text-slate">같은 레벨 수업의 앞 절반 — 그 수업 시간을 고치면 따라가요</p>
          ) : (
            <RecordedCheck defaultChecked={row.ttf_recorded} />
          )}
          <button type="submit" className="btn-secondary whitespace-nowrap !px-4 !py-2">저장</button>
        </div>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate">
        {/* 분량은 한 교시 줄만 — 통짜·스파르타 줄은 벽시계 길이에 쉬는 시간이 섞여 브로슈어 분량(120분·190분)과 다르다 */}
        <span className="rounded-full bg-brand-50 px-2 py-0.5 font-black text-brand-700">
          {kind === "hour" ? `${minutes}분 · ${KIND_NOTE[kind]}` : KIND_NOTE[kind]}
        </span>
        {row.ttf_recorded && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-black text-violet-800">저녁 줄</span>}
        {missing.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-800">{missing.join(" · ")} 안 고름</span>}
        <span className={cn(used ? "font-bold text-ink-soft" : "")}>{used ? `이 달 반 ${used}개` : "이 달 반 없음"}</span>
        <DeleteButton id={row.id} monthKey={monthKey} used={used} />
      </div>
    </li>
  );
}

/** 한달완성 — 두 시간을 이어 듣는 반. 따로 정하는 시간이 아니라 두 시간을 따라간다 */
function PackageLine({ row, parts, monthKey, used }: { row: Row; parts: Row[]; monthKey: string; used: number }) {
  const minutes = parts.reduce((s, p) => s + slotMinutes(p), 0);
  return (
    <li className="py-3">
      <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/50 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">한달완성</span>
          <span className="font-black tabular-nums text-ink">{slotLabelOf(row)}</span>
          <span className="text-xs font-semibold text-slate">
            {parts.map((p) => dashLabel(slotLabelOf(p))).join(" + ")} 이어 듣기 · {minutes}분
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate">
          {row.ttf_recorded && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-black text-violet-800">저녁 줄</span>}
          <span className={cn(used ? "font-bold text-ink-soft" : "")}>{used ? `이 달 반 ${used}개` : "이 달 반 없음"}</span>
          <DeleteButton id={row.id} monthKey={monthKey} used={used} />
        </div>
      </div>
    </li>
  );
}

/** 이어지는 두 시간인데 한달완성이 없을 때 */
function BundleLine({ first, second, label, monthKey }: { first: Row; second: Row; label: string; monthKey: string }) {
  return (
    <li className="py-2.5">
      <form action={bundleHours} className="flex flex-wrap items-center gap-2 text-xs text-slate">
        <input type="hidden" name="month" value={monthKey} />
        <input type="hidden" name="first" value={first.id} />
        <input type="hidden" name="second" value={second.id} />
        <span>
          {dashLabel(slotLabelOf(first))} + {dashLabel(slotLabelOf(second))} 을 이어 듣는 한달완성 반이 없어요.
        </span>
        <button type="submit" className="btn-secondary !px-3 !py-1.5 text-xs">
          한달완성({label})으로 묶기
        </button>
      </form>
    </li>
  );
}

function DeleteButton({ id, monthKey, used }: { id: number; monthKey: string; used: number }) {
  return (
    <form action={deleteTimetableSlot} className="ml-auto">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="month" value={monthKey} />
      <button
        type="submit"
        disabled={used > 0}
        className="btn-ghost !px-2.5 !py-1 text-xs text-red-700 disabled:!text-mist"
        title={used > 0 ? "이 달 반이 쓰는 시간대는 지울 수 없어요 — 반 편성에서 반을 먼저 정리해 주세요" : undefined}
      >
        지우기
      </button>
    </form>
  );
}

/** 과정 · 과목 고르기 — 알약 두 칸 (라디오) */
function Seg({ name, title, value, options, label, tone }: { name: string; title: string; value: string | null; options: [string, string][]; label: string; tone?: "mwf" | "ttf" }) {
  return (
    <div role="radiogroup" aria-label={label} className="min-w-0">
      <p aria-hidden className={cn("mb-1 text-[11px] font-black", tone === "mwf" ? "text-brand-600" : tone === "ttf" ? "text-ink" : "text-slate")}>
        {title}
      </p>
      <div className={cn("inline-flex rounded-full border bg-surface p-0.5", value ? "border-line" : "border-amber-300")}>
        {options.map(([v, text]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={name} value={v} defaultChecked={value === v} className="peer sr-only" aria-label={`${label} ${text}`} />
            <span className="block min-w-10 rounded-full px-2.5 py-1 text-center text-sm font-black text-slate transition peer-checked:bg-brand-500 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300">
              {text}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/*
 * 시각 고르기 — **시 · 분 두 칸, 24시간제** (2026-09-29 Alan "시간 설정에서 다 보이지가 않아서 설정하는데 어려움이 있어").
 * 브라우저 기본 시간 칸은 한국어 화면에서 `오전 10:00` + 시계 아이콘으로 그려져 좁은 칸에서 `오전 1(` 로 잘렸고,
 * 브로슈어(`18:30`)와 달리 오전·오후를 골라야 했다. 고르는 칸은 고른 값을 통째로 보여 주고 기기마다 모양이 같다.
 * 글자는 16px — 그보다 작으면 아이폰이 누를 때 화면을 확대한다. 합치는 일은 서버(`joinTime`)가 한다.
 * 화살표는 직접 그린다(`select-chevron`) — 기본 화살표로는 `시작 ~ 종료` 가 360px 휴대폰에서 두 줄로 접혔다. 지금은 360px 부터 한 줄이다.
 */
const PICK = "input select-chevron !w-auto !py-2 !pl-2 !pr-[1.375rem] text-base font-bold tabular-nums";

function TimePick({ part, value, label }: { part: "start" | "end"; value?: string | null; label: string }) {
  const t = splitTime(value);
  return (
    <span className="inline-flex items-center gap-0.5">
      <select name={`${part}_h`} defaultValue={t?.h ?? ""} required className={PICK} aria-label={`${label} 시`}>
        {!t && <option value="">시</option>}
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span aria-hidden className="font-black text-ink-soft">
        :
      </span>
      <select name={`${part}_m`} defaultValue={t?.m ?? ""} required className={PICK} aria-label={`${label} 분`}>
        {!t && <option value="">분</option>}
        {minuteOptions(t?.m).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </span>
  );
}

/** 시작 ~ 종료. 자리가 모자라면 `~ 종료` 가 통째로 다음 줄로 내려간다 (시·분 사이에서는 접히지 않는다) */
function TimeRange({ start, end, label }: { start?: string | null; end?: string | null; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <TimePick part="start" value={start} label={`${label} 시작`} />
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="font-black text-mist">
          ~
        </span>
        <TimePick part="end" value={end} label={`${label} 종료`} />
      </span>
    </div>
  );
}

function RecordedCheck({ defaultChecked = false }: { defaultChecked?: boolean }) {
  return (
    <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-ink-soft" title="이 시간대는 화목금이 인강 (저녁 줄)">
      <input type="checkbox" name="ttf_recorded" defaultChecked={defaultChecked} className="size-4 accent-[#ff2e88]" />
      화목금 인강
    </label>
  );
}
