import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { InstructorCameo } from "@/components/ui/InstructorCameo";
import { todayKST } from "@/lib/utils";
import { PROGRAMS, SEASON_LABEL, seasonOfMonth } from "@/lib/timetable";
import { timeBlockOf } from "@/components/admin/sections/bulk";
import { TimetableCard, type TimetableCardData } from "./TimetableCard";

/**
 * 목표 점수반별 수업 시간 (timetable_levels · timetable_slots). 매달 편성하는 반과 별개인 대표 시간표.
 * 평달과 방학달(1·2·7·8월)은 시간대가 다르다 (2026-09-16 Alan) — 이번 달에 맞는 쪽을 보여 준다.
 * 그 계절 시간대가 아직 없으면 평달 것을 보여 주되 **평달 기준이라고 밝힌다** (잘못된 시간을 그냥 내보내지 않는다).
 * 카드는 과정(한 달 점수보장반 → 스파르타반) × 레벨로 나눈다 — 같은 650 이라도 스파르타반은 시간대가 다르다.
 */
async function loadTimetable() {
  const supabase = await createClient();
  const season = seasonOfMonth(Number(todayKST().slice(5, 7)));
  const { data } = await supabase
    .from("timetable_levels")
    .select("level, note, timetable_slots(program, season, start_time, end_time, ttf_recorded)")
    .order("sort_order")
    .order("start_time", { referencedTable: "timetable_slots" });

  const rows = data ?? [];
  const pick = (want: string): TimetableCardData[] =>
    PROGRAMS.flatMap((program) =>
      rows.map((t) => ({
        key: `${program}-${t.level}`,
        level: t.level,
        program,
        // 레벨 메모는 점수보장반 카드에만. **인강 여부는 여기가 아니라 시간대마다** `recorded` 로 넘긴다
        note: program === "score" ? t.note : null,
        slots: t.timetable_slots
          .filter((s) => s.season === want && s.program === program)
          .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time))
          .flatMap((s) => {
            const label = timeBlockOf(s.start_time, s.end_time);
            return label ? [{ label, recorded: s.ttf_recorded }] : [];
          }),
      })),
    ).filter((t) => t.slots.length > 0);

  const wanted = pick(season);
  if (wanted.length > 0) return { levels: wanted, season, fallback: false };
  return { levels: pick("regular"), season, fallback: season !== "regular" };
}

// 그 달에 개설된 반 목록은 랜딩에 두지 않는다 (2026-09-17 Alan — 한 달에 수십 개라 방문자에게 필요 없는 정보였다).
// 대표 시간표 카드만 보여 주고, 실제 반은 수강생의 내 시간표와 관리자 반 편성에서 본다.
export async function Schedule() {
  const { levels: timetable, season, fallback } = await loadTimetable();

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
        {timetable.length > 0 && (
          <p className="mt-2 text-sm font-semibold text-brand-600">
            {fallback ? `평달 기준 시간표예요. ${SEASON_LABEL[season]} 시간표는 공지를 확인해 주세요.` : `${SEASON_LABEL[season]} 기준 시간표예요.`}
          </p>
        )}
      </Reveal>

      {timetable.length > 0 && (
        <div className="relative z-10 mt-10 grid gap-4 md:grid-cols-3">
          {timetable.map((t, i) => (
            <TimetableCard key={t.key} card={t} delay={i * 80} />
          ))}
        </div>
      )}

      <Reveal delay={160} className="mt-8 text-center text-sm text-slate">
        이미 수강 신청을 하셨나요?{" "}
        <Link href="/my/verify" className="font-bold text-brand-600 underline-offset-2 hover:underline">
          수강증을 올리면 바로 등업됩니다
        </Link>
      </Reveal>
    </section>
  );
}
