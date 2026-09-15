import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { formatTime, TRACK_LABEL, COURSE_TYPE_LABEL } from "@/lib/utils";

const BANDS = [
  { name: "아침", time: "9시 이전" },
  { name: "오전", time: "9시 ~ 12시" },
  { name: "오후", time: "12시 ~ 18시" },
  { name: "저녁", time: "18시 이후" },
];

/** DB 의 열린 반을 읽어 이번 달 시간표를 보여준다 (하드코딩 금지) */
async function loadOpenSections() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_sections")
    .select("id, track, start_time, end_time, time_block, status, term:terms(year, month), course:courses(name, course_type, target_score)")
    .eq("status", "open")
    .order("start_time")
    .limit(40);
  return data ?? [];
}

export async function Schedule() {
  const sections = await loadOpenSections();
  const byTerm = new Map<string, typeof sections>();
  for (const s of sections) {
    const key = s.term ? `${s.term.year}년 ${s.term.month}월` : "개설 예정";
    byTerm.set(key, [...(byTerm.get(key) ?? []), s]);
  }

  return (
    <section aria-labelledby="schedule-title" className="container-x py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="chip">수강 시간대</p>
        <h2 id="schedule-title" className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
          내 일정에 맞는 시간을 고르세요
        </h2>
        <p className="mt-3 text-slate">아침부터 저녁까지, 주3일과 주5일. 반 편성은 매달 강사가 직접 짜서 공개합니다.</p>
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BANDS.map((b, i) => (
          <Reveal key={b.name} delay={i * 80} className="card p-5 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
              <Icon name="timeslot" size={30} />
            </span>
            <p className="mt-3 text-lg font-black text-ink">{b.name}</p>
            <p className="text-sm text-slate">{b.time}</p>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120} className="mt-10">
        {sections.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 p-8 text-center">
            <Icon name="calendar" size={48} />
            <p className="text-lg font-bold text-ink">이번 달 시간표가 곧 공개됩니다</p>
            <p className="max-w-md text-sm text-slate">
              반 편성이 확정되면 여기에 바로 표시돼요. 개설 정보는 YBM 공식 사이트에서도 확인할 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {[...byTerm.entries()].map(([term, list]) => (
              <div key={term} className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-line bg-brand-50/60 px-5 py-3">
                  <p className="font-black text-ink">{term} 개설 반</p>
                  <p className="text-xs font-semibold text-slate">{list.length}개 반</p>
                </div>
                <ul className="divide-y divide-line">
                  {list.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                      <span className="w-28 font-black text-brand-600">
                        {formatTime(s.start_time)}–{formatTime(s.end_time)}
                      </span>
                      <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{TRACK_LABEL[s.track] ?? s.track}</span>
                      <span className="font-semibold text-ink">{s.course?.name ?? "강좌"}</span>
                      {s.course?.course_type && <span className="text-slate">{COURSE_TYPE_LABEL[s.course.course_type]}</span>}
                      {s.time_block && <span className="ml-auto text-xs text-mist">{s.time_block}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Reveal>

      <Reveal delay={160} className="mt-6 text-center text-sm text-slate">
        이미 수강 신청을 하셨나요?{" "}
        <Link href="/my/verify" className="font-bold text-brand-600 underline-offset-2 hover:underline">
          수강증을 올리면 바로 등업됩니다
        </Link>
      </Reveal>
    </section>
  );
}
