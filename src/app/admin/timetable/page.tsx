import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, todayKST } from "@/lib/utils";
import { courseShortName, isSeason, PROGRAM_LABEL, PROGRAMS, SEASON_LABEL, SEASONS, seasonOfMonth, VACATION_MONTHS, type Program, type Season } from "@/lib/timetable";
import { blockMinutes, buildBlockTree, minutesLabel } from "@/lib/time-blocks";
import { timeBlockOf } from "@/components/admin/sections/bulk";
import { HOURS, minuteOptions, splitTime } from "@/lib/timetable-admin";
import { deleteTimetableSlot, saveTimetableLevelNote, saveTimetableSlot } from "./actions";

export const metadata: Metadata = { title: "시간표 설정", robots: { index: false } };

/**
 * 시간표 설정 (2026-09-23 Alan — "관리자모드에서 평달과 방학 시간표를 직접 설정할수 있도록 만들어놓는건 어때?
 * 템플릿은 브로슈어와 비슷하게 세팅해주면 강사님들도 시간표를 쉽게 세팅할 수 있을 것 같아").
 *
 * 평달·방학달 **두 벌**이다 (①). 방학달(1·2·7·8월)은 방학 전에 그 벌을 고쳐 쓴다 — 지난 반에는 영향이 없다 (반에 시간이 글자로 박혀 있다).
 * 카드는 브로슈어처럼 **과정 × 레벨**이고 카드 안에 시간대 줄이 쌓인다. 시간대를 더하면 반 일괄 개설 표에 그 줄이 바로 생기고,
 * 60분·120분 묶음 관계 · 권한 · 수강증 매칭은 시간의 포함·일치로 계산하므로 새 시간대도 저절로 따라온다.
 * 레벨은 늘지 않는다 (Alan) — `timetable_levels` 행 그대로이고 시간대만 더한다.
 */
export default async function AdminTimetablePage({ searchParams }: { searchParams: Promise<{ season?: string; ok?: string; error?: string }> }) {
  // 강사·관리자만 — 조교는 시간표를 고치지 않는다
  await requireStaff();
  const sp = await searchParams;
  const thisSeason = seasonOfMonth(Number(todayKST().slice(5, 7)));
  const season: Season = isSeason(sp.season) ? sp.season : thisSeason;

  const supabase = await createClient();
  const [{ data: levelRows }, { data: slotRows }, { data: courses }, { data: sectionRows }] = await Promise.all([
    supabase.from("timetable_levels").select("level, note, sort_order").order("sort_order").order("level"),
    supabase.from("timetable_slots").select("id, level, program, season, start_time, end_time, ttf_recorded").eq("season", season).order("start_time").order("end_time"),
    supabase.from("courses").select("name, program, target_score").eq("is_active", true),
    // 이 시간대로 이미 만든 반 수 — 지워도 그 반은 남지만, 지우기 전에 알고 누르게 한다
    supabase.from("class_sections").select("time_block, course:courses(target_score, program)"),
  ]);

  const levels = levelRows ?? [];
  const slots = slotRows ?? [];
  const sectionCount = new Map<string, number>();
  for (const s of sectionRows ?? []) {
    if (!s.time_block || !s.course) continue;
    const k = `${s.course.target_score}|${s.course.program}|${s.time_block}`;
    sectionCount.set(k, (sectionCount.get(k) ?? 0) + 1);
  }
  const usedBy = (level: number, program: string, start: string, end: string) => sectionCount.get(`${level}|${program}|${timeBlockOf(start, end)}`) ?? 0;

  // 카드 제목: 점수보장반은 레벨 숫자, 스파르타는 강좌 이름의 짧은 이름 (`650 중급속성`) — 이름은 courses 한곳
  const cardTitle = (level: number, program: Program) => {
    if (program === "score") return `${level}`;
    const c = (courses ?? []).find((c) => c.program === program && c.target_score === level);
    return c ? `${level} ${courseShortName(c.name)}` : `${level} ${PROGRAM_LABEL[program]}`;
  };
  // 스파르타 카드는 그 레벨에 스파르타 강좌가 있을 때만 (850 은 없다)
  const hasProgram = (level: number, program: Program) => program === "score" || (courses ?? []).some((c) => c.program === program && c.target_score === level);

  const vacationMonths = VACATION_MONTHS.map((m) => `${m}월`).join("·");
  const okMsg = sp.ok ? "저장했어요. 랜딩 수업시간표와 반 일괄 개설 표에 바로 반영돼요." : null;
  const errMsg = sp.error ? (sp.error === "save" ? "저장하지 못했어요. 다시 시도해 주세요." : sp.error) : null;

  return (
    <>
      <PageHeader
        icon="timeslot"
        title="시간표 설정"
        description="브로슈어의 수업 시간표예요. 평달과 방학달 두 벌이고, 랜딩 수업시간표와 반 편성의 일괄 개설 표가 이 표를 읽어요."
      >
        <Link href="/admin/sections" className="btn-secondary">
          <Icon name="calendar" size={18} />반 편성
        </Link>
      </PageHeader>

      {okMsg && <Alert kind="success" className="mb-4">{okMsg}</Alert>}
      {errMsg && <Alert kind="warning" className="mb-4">{errMsg}</Alert>}

      <FilterTabs basePath="/admin/timetable" paramKey="season" current={season} tabs={SEASONS.map((s) => ({ value: s, label: SEASON_LABEL[s], count: slots.length && s === season ? slots.length : undefined }))} />

      <div className="mb-5 rounded-xl2 border border-brand-200 bg-brand-50/60 p-4 text-sm text-ink-soft">
        <p>
          <strong className="text-ink">{SEASON_LABEL[season]}</strong> 시간표를 보고 있어요
          {season === "vacation" ? ` — ${vacationMonths} 기수가 이 벌을 씁니다.` : ` — ${vacationMonths}을 뺀 달이 이 벌을 씁니다.`}
          {season === thisSeason && <> 이번 달은 {SEASON_LABEL[thisSeason]}이라 <strong className="text-ink">랜딩에 지금 나가는 표</strong>예요.</>}
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-slate">
          <li>· 시간대를 더하면 반 편성의 일괄 개설 표에 그 줄이 바로 생겨요. 120분 안에 60분 두 개가 들어오면 묶음 반과 시간 단위 반으로 저절로 갈려요.</li>
          <li>· <strong className="text-ink-soft">화목금 인강</strong>을 켠 줄이 저녁 줄이에요 — 그 줄로 만든 화목금 반은 인강, 두 트랙 모두 불라방은 라이브만 하고 다시보기는 오전 반 것을 봐요.</li>
          <li>· 방학달 시간표는 방학 전에 이 벌을 고쳐 쓰세요 (겨울과 여름이 달라도 한 벌이에요). 이미 만든 반은 시간이 박혀 있어 여기서 지워도 그대로예요.</li>
          <li>· 과목(LC/RC)과 과정(A/B)은 여기가 아니라 반을 열 때 고릅니다.</li>
        </ul>
      </div>

      <div className="space-y-6">
        {PROGRAMS.map((program) => (
          <section key={program} aria-labelledby={`program-${program}`}>
            <h2 id={`program-${program}`} className="mb-3 text-lg font-black text-ink">{PROGRAM_LABEL[program]}</h2>
            {/* 카드는 PC 넓은 화면(xl)에서만 두 줄 — 세 줄로 두면 카드가 좁아져 시각이 잘리고 줄마다 접혔다 (2026-09-29) */}
            <div className="grid gap-4 xl:grid-cols-2">
              {levels.filter((l) => hasProgram(l.level, program)).map((l) => {
                const title = cardTitle(l.level, program);
                const mine = slots.filter((s) => s.level === l.level && s.program === program);
                const labels = mine.map((s) => timeBlockOf(s.start_time, s.end_time) ?? "");
                const tree = buildBlockTree(labels, { nest: program === "score" });
                // 분량 칩 — 분량을 셀 수 없는 줄(속성반 190분 · 방학달 통짜 반처럼 쉬는 시간이 끼는 긴 줄)은 칩을 그리지 않는다
                const minutesOf = new Map<string, string>();
                const walk = (nodes: ReturnType<typeof buildBlockTree>, depth: number) => {
                  for (const n of nodes) {
                    const text = [minutesLabel(blockMinutes(n)), n.parts.length ? "묶음" : depth > 0 ? "시간 단위" : null].filter(Boolean).join(" · ");
                    if (text) minutesOf.set(n.label, text);
                    walk(n.parts, depth + 1);
                  }
                };
                walk(tree, 0);
                return (
                  <article key={`${program}-${l.level}`} className="card p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-black text-ink">
                        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-brand-700">{title}</span>
                      </h3>
                      <span className="text-xs text-mist">{mine.length}개 시간대</span>
                    </div>

                    <ul className="mt-2 divide-y divide-line">
                      {mine.map((s) => {
                        const used = usedBy(l.level, program, s.start_time, s.end_time);
                        const label = timeBlockOf(s.start_time, s.end_time) ?? "";
                        const chip = minutesOf.get(label);
                        return (
                          // 저장한 값이 바뀌면 줄을 새로 그린다 — 고르는 칸은 처음 값만 기억해서, 그대로 두면 저장 뒤 옛 시각으로 되돌아가 보인다
                          <li key={`${s.id}-${s.start_time}-${s.end_time}-${s.ttf_recorded}`} className="py-3">
                            <form action={saveTimetableSlot} className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                              <input type="hidden" name="id" value={s.id} />
                              <input type="hidden" name="level" value={l.level} />
                              <input type="hidden" name="program" value={program} />
                              <input type="hidden" name="season" value={season} />
                              <TimeRange start={s.start_time} end={s.end_time} label={`${title} ${label} 줄`} />
                              <div className="flex flex-1 items-center justify-between gap-3">
                                <RecordedCheck defaultChecked={s.ttf_recorded} />
                                <button type="submit" className="btn-secondary whitespace-nowrap !px-4 !py-2">저장</button>
                              </div>
                            </form>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate">
                              {chip && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-black text-brand-700">{chip}</span>}
                              {s.ttf_recorded && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-black text-violet-800">저녁 줄</span>}
                              <span className={cn(used ? "font-bold text-ink-soft" : "")}>{used ? `이 시간대로 만든 반 ${used}개` : "아직 만든 반 없음"}</span>
                              <form action={deleteTimetableSlot} className="ml-auto">
                                <input type="hidden" name="id" value={s.id} />
                                <input type="hidden" name="season" value={season} />
                                <button type="submit" className="btn-ghost !px-2.5 !py-1 text-xs text-red-700" title={used ? "지워도 이미 만든 반은 그대로 남아요" : undefined}>
                                  지우기
                                </button>
                              </form>
                            </div>
                          </li>
                        );
                      })}
                      {mine.length === 0 && <li className="py-3 text-sm text-slate">아직 시간대가 없어요. 아래에서 더해 주세요.</li>}
                    </ul>

                    {/* 시간대가 늘면(또는 줄면) 새로 그려 빈칸으로 되돌린다 */}
                    <form key={`add-${mine.length}`} action={saveTimetableSlot} className="mt-2 rounded-xl bg-brand-50/60 p-3">
                      <input type="hidden" name="level" value={l.level} />
                      <input type="hidden" name="program" value={program} />
                      <input type="hidden" name="season" value={season} />
                      <p className="mb-2 text-xs font-black text-brand-700">새 시간대</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                        <TimeRange label={`${title} 새 시간대`} />
                        <div className="flex flex-1 items-center justify-between gap-3">
                          <RecordedCheck />
                          <button type="submit" className="btn-primary whitespace-nowrap !px-4 !py-2">시간대 더하기</button>
                        </div>
                      </div>
                    </form>

                    {program === "score" && (
                      <form action={saveTimetableLevelNote} className="mt-4">
                        <input type="hidden" name="level" value={l.level} />
                        <input type="hidden" name="season" value={season} />
                        <label htmlFor={`note-${l.level}`} className="block text-xs font-bold text-ink-soft">
                          카드 바닥 메모 <span className="font-normal text-slate">— 선택 · 평달·방학달 공통 · 랜딩 카드 아래에 그대로 나가요</span>
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
    </>
  );
}

/*
 * 시각 고르기 — **시 · 분 두 칸, 24시간제** (2026-09-29 Alan "시간 설정에서 다 보이지가 않아서 설정하는데 어려움이 있어").
 * 브라우저 기본 시간 칸은 한국어 화면에서 `오전 10:00` + 시계 아이콘으로 그려져 좁은 칸에서 `오전 1(` 로 잘렸고,
 * 브로슈어(`18:30`)와 달리 오전·오후를 골라야 했다. 고르는 칸은 고른 값을 통째로 보여 주고 기기마다 모양이 같다.
 * 글자는 16px — 그보다 작으면 아이폰이 누를 때 화면을 확대한다. 합치는 일은 서버(`joinTime`)가 한다.
 * 화살표는 직접 그린다(`select-chevron`) — 기본 화살표로는 `시작 ~ 종료` 가 360px 휴대폰에서 두 줄로 접혔다. 지금은 320px 에서도 한 줄이다.
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
