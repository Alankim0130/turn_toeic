import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { InstructorCameo } from "@/components/ui/InstructorCameo";
import { formatTime, todayKST } from "@/lib/utils";
import { PROGRAMS, SEASON_LABEL, seasonOfMonth } from "@/lib/timetable";
import { blockMinutes, buildBlockTree, dashLabel, minutesLabel } from "@/lib/time-blocks";
import { timeBlockOf } from "@/components/admin/sections/bulk";

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
    .select("level, note, timetable_slots(program, season, start_time, end_time)")
    .order("sort_order")
    .order("start_time", { referencedTable: "timetable_slots" });

  const rows = data ?? [];
  const pick = (want: string) =>
    PROGRAMS.flatMap((program) =>
      rows.map((t) => ({
        key: `${program}-${t.level}`,
        level: t.level,
        program,
        // 레벨 안내(예: 월수금반 현장, 화목금반 인강)는 점수보장반 시간표 기준이다
        note: program === "score" ? t.note : null,
        timetable_slots: t.timetable_slots
          .filter((s) => s.season === want && s.program === program)
          .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time)),
      })),
    ).filter((t) => t.timetable_slots.length > 0);

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
            <Reveal key={t.key} delay={i * 80} className="card flex flex-col p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                  <Icon name="timeslot" size={30} />
                </span>
                <h3 className="text-2xl font-black tracking-tight text-ink">
                  {t.program === "sparta" && <span className="mr-1.5 text-lg text-brand-600">스파르타</span>}
                  {t.level}
                  <span className="ml-0.5 text-lg">반</span>
                </h3>
              </div>
              {/* 등록 단위(120분 · 140분)를 크게, 그 안의 60분 · 70분 시간 단위를 아래에 — 60분만 듣는 반도 있다 (2026-09-16 Alan) */}
              <ul className="mt-5 space-y-2">
                {buildBlockTree(
                  t.timetable_slots.map((s) => timeBlockOf(s.start_time, s.end_time)),
                  { nest: t.program === "score" },
                ).map((node) => {
                  const minutes = minutesLabel(blockMinutes(node));
                  return (
                    <li key={node.label} className="rounded-xl bg-brand-50 px-4 py-3 text-center">
                      <p className="text-xl font-black tabular-nums text-brand-600">
                        {formatTime(node.label.slice(0, 5))} ~ {formatTime(node.label.slice(6))}
                        {minutes && <span className="ml-1.5 align-middle text-xs font-black text-brand-700">{minutes}</span>}
                      </p>
                      {node.parts.length > 0 && (
                        <p className="mt-1 text-xs font-semibold text-slate">
                          {node.parts.map((p) => `${dashLabel(p.label)}${minutesLabel(blockMinutes(p)) ? ` (${minutesLabel(blockMinutes(p))})` : ""}`).join(" · ")}
                          <span className="block text-[11px] font-normal text-mist">한 시간만 듣는 반도 있어요</span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {t.note && (
                <p className="mt-3 rounded-xl border border-brand-200 px-4 py-2.5 text-center text-sm font-bold text-brand-700">
                  {t.note}
                </p>
              )}
            </Reveal>
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
