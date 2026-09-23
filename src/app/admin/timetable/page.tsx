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
import { normalizeTime } from "@/lib/timetable-admin";
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {levels.filter((l) => hasProgram(l.level, program)).map((l) => {
                const mine = slots.filter((s) => s.level === l.level && s.program === program);
                const labels = mine.map((s) => timeBlockOf(s.start_time, s.end_time) ?? "");
                const tree = buildBlockTree(labels, { nest: program === "score" });
                const minutesOf = new Map<string, string>();
                const walk = (nodes: ReturnType<typeof buildBlockTree>, depth: number) => {
                  for (const n of nodes) {
                    minutesOf.set(n.label, `${minutesLabel(blockMinutes(n))}${n.parts.length ? " · 묶음" : depth > 0 ? " · 시간 단위" : ""}`);
                    walk(n.parts, depth + 1);
                  }
                };
                walk(tree, 0);
                return (
                  <article key={`${program}-${l.level}`} className="card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-black text-ink">
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">{cardTitle(l.level, program)}</span>
                      </h3>
                      <span className="text-xs text-mist">{mine.length}개 시간대</span>
                    </div>

                    <ul className="mt-3 space-y-2">
                      {mine.map((s) => {
                        const used = usedBy(l.level, program, s.start_time, s.end_time);
                        const label = timeBlockOf(s.start_time, s.end_time) ?? "";
                        return (
                          <li key={s.id} className="rounded-xl border border-line p-2.5">
                            <form action={saveTimetableSlot} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="id" value={s.id} />
                              <input type="hidden" name="level" value={l.level} />
                              <input type="hidden" name="program" value={program} />
                              <input type="hidden" name="season" value={season} />
                              <input name="start_time" type="time" defaultValue={normalizeTime(s.start_time) ?? ""} required className="input !w-[6.6rem] !py-1.5 text-sm tabular-nums" aria-label={`${cardTitle(l.level, program)} 시작`} />
                              <span className="text-mist">~</span>
                              <input name="end_time" type="time" defaultValue={normalizeTime(s.end_time) ?? ""} required className="input !w-[6.6rem] !py-1.5 text-sm tabular-nums" aria-label={`${cardTitle(l.level, program)} 종료`} />
                              <label className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft" title="이 시간대는 화목금이 인강 (저녁 줄)">
                                <input type="checkbox" name="ttf_recorded" defaultChecked={s.ttf_recorded} className="size-4 accent-[#ff2e88]" />
                                화목금 인강
                              </label>
                              <button type="submit" className="btn-secondary !px-2.5 !py-1.5 text-xs">저장</button>
                            </form>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate">
                              {minutesOf.get(label) && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 font-black text-brand-700">{minutesOf.get(label)}</span>}
                              {s.ttf_recorded && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 font-black text-violet-800">저녁 줄</span>}
                              <span className={cn(used ? "font-bold text-ink-soft" : "")}>{used ? `이 시간대로 만든 반 ${used}개` : "아직 만든 반 없음"}</span>
                              <form action={deleteTimetableSlot} className="ml-auto">
                                <input type="hidden" name="id" value={s.id} />
                                <input type="hidden" name="season" value={season} />
                                <button type="submit" className="btn-ghost !px-2 !py-0.5 text-[11px] text-red-700" title={used ? "지워도 이미 만든 반은 그대로 남아요" : undefined}>
                                  지우기
                                </button>
                              </form>
                            </div>
                          </li>
                        );
                      })}
                      {mine.length === 0 && <li className="rounded-xl bg-surface px-3 py-3 text-xs text-slate">아직 시간대가 없어요. 아래에서 더해 주세요.</li>}
                    </ul>

                    <form action={saveTimetableSlot} className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50/50 p-2.5">
                      <input type="hidden" name="level" value={l.level} />
                      <input type="hidden" name="program" value={program} />
                      <input type="hidden" name="season" value={season} />
                      <input name="start_time" type="time" required className="input !w-[6.6rem] !py-1.5 text-sm tabular-nums" aria-label={`${cardTitle(l.level, program)} 새 시간대 시작`} />
                      <span className="text-mist">~</span>
                      <input name="end_time" type="time" required className="input !w-[6.6rem] !py-1.5 text-sm tabular-nums" aria-label={`${cardTitle(l.level, program)} 새 시간대 종료`} />
                      <label className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
                        <input type="checkbox" name="ttf_recorded" className="size-4 accent-[#ff2e88]" />
                        화목금 인강
                      </label>
                      <button type="submit" className="btn-primary !px-3 !py-1.5 text-xs">시간대 더하기</button>
                    </form>

                    {program === "score" && (
                      <form action={saveTimetableLevelNote} className="mt-3 flex items-center gap-2">
                        <input type="hidden" name="level" value={l.level} />
                        <input type="hidden" name="season" value={season} />
                        <input name="note" defaultValue={l.note ?? ""} maxLength={80} className="input !py-1.5 text-xs" placeholder="카드 바닥 메모 (선택, 랜딩에 그대로 나가요 — 인강은 여기 적지 말고 위에서 체크)" aria-label={`${l.level} 카드 메모`} />
                        <button type="submit" className="btn-ghost !px-2.5 !py-1.5 text-xs">메모 저장</button>
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
