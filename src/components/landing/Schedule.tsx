import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { InstructorCameo } from "@/components/ui/InstructorCameo";
import { KakaoChatButton } from "@/components/ui/KakaoChatButton";
import { todayKST } from "@/lib/utils";
import { LANDING_PROGRAMS, SEASON_LABEL, seasonOfMonth } from "@/lib/timetable";
import { madeMonths, sameYm, ymIndex } from "@/lib/timetable-month";
import { timeBlockOf } from "@/components/admin/sections/bulk";
import { TimetableCard, type TimetableCardData } from "./TimetableCard";

/**
 * 목표 점수반별 수업 시간 (timetable_levels · timetable_slots). 매달 편성하는 반과 별개인 대표 시간표.
 * 2026-09-29 부터 시간표는 **달마다 한 벌**이다 — **이번 달 시간표**를 보여 주고, 아직 없으면 가장 가까운 앞선 달 것을 그 달 기준이라고 밝혀 보여 준다.
 * 달 시간표가 하나도 없을 때만 예전 두 벌(평달·방학달 기본 줄)로 돌아가고, 그 계절 줄도 없으면 평달 것을 **평달 기준이라고 밝힌다**
 * (잘못된 시간을 그냥 내보내지 않는다).
 * 카드는 과정(한 달 점수보장반 → 스파르타반) × 레벨로 나눈다 — 같은 650 이라도 스파르타반은 시간대가 다르다.
 */
async function loadTimetable() {
  const supabase = await createClient();
  const today = todayKST();
  const target = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
  const season = seasonOfMonth(target.m);
  const [{ data }, { data: spartaCourses }] = await Promise.all([
    supabase
      .from("timetable_levels")
      .select("level, note, timetable_slots(program, season, year, month, start_time, end_time, ttf_recorded)")
      .order("sort_order")
      .order("start_time", { referencedTable: "timetable_slots" }),
    // 스파르타는 두 레벨을 함께 듣는다 (650+ 중급속성 = 650 + 850). 구성은 courses.includes_levels 한곳 — 코드에 적지 않는다
    supabase.from("courses").select("target_score, name, includes_levels").eq("program", "sparta").eq("is_active", true),
  ]);

  const rows = data ?? [];
  const spartaOf = (level: number): TimetableCardData["sparta"] => {
    const c = (spartaCourses ?? []).find((c) => c.target_score === level);
    if (!c) return null;
    return { name: c.name, levels: [level, ...c.includes_levels.filter((l) => l !== level).sort((a, b) => a - b)] };
  };
  type Slot = (typeof rows)[number]["timetable_slots"][number];
  const pick = (keep: (s: Slot) => boolean): TimetableCardData[] =>
    LANDING_PROGRAMS.flatMap((program) =>
      rows.map((t) => ({
        key: `${program}-${t.level}`,
        level: t.level,
        program,
        // 레벨 메모는 점수보장반 카드에만. **인강 여부는 여기가 아니라 시간대마다** `recorded` 로 넘긴다
        note: program === "score" ? t.note : null,
        sparta: program === "sparta" ? spartaOf(t.level) : null,
        slots: t.timetable_slots
          .filter((s) => keep(s) && s.program === program)
          .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time))
          .flatMap((s) => {
            const label = timeBlockOf(s.start_time, s.end_time);
            return label ? [{ label, recorded: s.ttf_recorded }] : [];
          }),
      })),
    ).filter((t) => t.slots.length > 0);

  // 이번 달 시간표 → 없으면 가장 가까운 앞선 달 시간표
  const shown = madeMonths(rows.flatMap((t) => t.timetable_slots))
    .filter((ym) => ymIndex(ym) <= ymIndex(target))
    .at(-1);
  if (shown) {
    const levels = pick((s) => s.year === shown.y && s.month === shown.m);
    if (levels.length > 0) return { levels, caption: sameYm(shown, target) ? `${shown.m}월 수업시간표예요.` : `${shown.m}월 기준 시간표예요.` };
  }
  // 달 시간표가 없을 때만 예전 두 벌 (기본 줄)
  const wanted = pick((s) => s.year == null && s.season === season);
  if (wanted.length > 0) return { levels: wanted, caption: `${SEASON_LABEL[season]} 기준 시간표예요.` };
  return {
    levels: pick((s) => s.year == null && s.season === "regular"),
    caption: season === "regular" ? "평달 기준 시간표예요." : `평달 기준 시간표예요. ${SEASON_LABEL[season]} 시간표는 공지를 확인해 주세요.`,
  };
}

// 그 달에 개설된 반 목록은 랜딩에 두지 않는다 (2026-09-17 Alan — 한 달에 수십 개라 방문자에게 필요 없는 정보였다).
// 대표 시간표 카드만 보여 주고, 실제 반은 수강생의 내 시간표와 관리자 반 편성에서 본다.
export async function Schedule() {
  const { levels: timetable, caption } = await loadTimetable();

  return (
    <section aria-labelledby="schedule-title" className="container-x relative py-20">
      {/* 가운데 제목 옆 여백이 충분한 lg 이상에서만, 시간표 쪽을 가리키는 강사 */}
      <InstructorCameo
        name="이혜영"
        pose="point"
        sizes="200px"
        className="absolute right-4 top-10 hidden h-72 lg:block xl:right-10"
      />
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="chip">수업시간표</p>
        <h2 id="schedule-title" className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
          내 일정에 맞는 시간을 고르세요
        </h2>
        <p className="mt-3 text-slate">목표 점수반마다 수업 시간이 정해져 있어요. 주3일과 주5일 중에 골라 들을 수 있습니다.</p>
        {timetable.length > 0 && <p className="mt-2 text-sm font-semibold text-brand-600">{caption}</p>}
      </Reveal>

      {timetable.length > 0 && (
        <div className="relative z-10 mt-10 grid gap-4 md:grid-cols-3">
          {timetable.map((t, i) => (
            <TimetableCard key={t.key} card={t} delay={i * 80} />
          ))}
        </div>
      )}

      {/* 시간대가 고민되면 카카오톡으로 — 랜딩 곳곳의 카카오톡 상담 버튼 (2026-10-01 Alan) */}
      <Reveal delay={160} className="mt-10 text-center">
        <KakaoChatButton size="lg" label="시간대가 고민되면 카카오톡 상담" />
        <p className="mt-4 text-sm text-slate">
          이미 수강 신청을 하셨나요?{" "}
          <Link href="/my/verify" className="font-bold text-brand-600 underline-offset-2 hover:underline">
            수강증을 올리면 바로 등업됩니다
          </Link>
        </p>
      </Reveal>
    </section>
  );
}
