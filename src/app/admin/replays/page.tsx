import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatTime, formatTimeRange, TRACK_LABEL } from "@/lib/utils";
import { SectionSelect } from "@/components/admin/replays/SectionSelect";
import { ReplayRow } from "@/components/admin/replays/ReplayRow";
import { sectionPackages } from "@/lib/time-blocks";
import { SUBJECT_LABEL, subjectOf } from "@/lib/instructor-subject";
import { groupHasBookSet, groupKeyOf } from "@/lib/section-type";
import { replayTargets } from "@/lib/replay-targets";

export const metadata: Metadata = { title: "다시보기 등록", robots: { index: false } };

export default async function AdminReplaysPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { user, profile } = await requireStaff();
  const { section: sectionParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: sections }, { data: usedRows }] = await Promise.all([
    supabase
      .from("class_sections")
      .select(
        "id, term_id, course_id, track, start_time, end_time, time_block, status, closes_at, instructor_id, book_set, recorded, course:courses(name, program, target_score, includes_levels), term:terms(year, month)",
      )
      .order("id", { ascending: false })
      .limit(200),
    // 녹화본이 이미 붙은 반 — 목록에서 빼면 그 기록에 닿을 길이 사라지므로 무엇이든 남긴다
    supabase.from("session_dates").select("section_id, replays!inner(id)"),
  ]);

  const list = sections ?? [];
  // 묶음 반(120분·140분)에는 녹화본을 올리지 않는다 — 안에 든 시간 단위 반에 올리면 묶음 반 학생도 본다
  const packages = sectionPackages(list);
  const hasReplay = new Set((usedRows ?? []).map((r) => r.section_id));
  const requested = Number(sectionParam);
  const selected =
    (Number.isInteger(requested) && list.find((s) => s.id === requested)) ||
    list.find((s) => s.status === "open" && replayTargets.uploadable(s, packages)) ||
    list.find((s) => s.status === "open") ||
    list[0] ||
    null;

  const { data: sessions } = selected
    ? await supabase.from("session_dates").select("id, seq, date, start_time, end_time, replays(id, video_url, published_at)").eq("section_id", selected.id).order("date")
    : { data: [] as never[] };

  /**
   * **올릴 수 있는 반만 목록에 둔다** (2026-09-20 Alan — "스파르타반은 결국 두개의 다른 레벨에 접근권한이 다 있는데
   * 왜 다시보기에 추가 되어있는지 모르겠어"). 도메인 규칙 1 "반 권한" 에 적힌 그대로다 —
   * 녹화본은 **시간 단위 반에 한 번만** 두고 묶음 반·스파르타 반에는 올리지 않는다.
   * 그동안 화면은 묶음 반만 고른 뒤에 경고했고 스파르타 반은 아무 처리가 없어 36개가 통째로 쏟아졌다.
   * 단 **이미 녹화본이 붙은 반은 남긴다** — 목록에서 빼면 그 기록을 고치거나 지울 길이 없어진다.
   */
  const groupHasBook = groupHasBookSet(list);
  const shown = list
    .filter((s) => replayTargets.uploadable(s, packages) || hasReplay.has(s.id) || s.id === selected?.id)
    .sort(replayTargets.compare);

  const options = shown.map((s) => {
    const pkg = replayTargets.isPackage(s, packages);
    // 과목은 반의 LC 교재가 말해 준다 (도메인 규칙 1 "담당 강사는 과목으로 저절로 정해진다")
    const subject = subjectOf({ bookSet: s.book_set, isPackage: pkg || replayTargets.isSparta(s), groupHasBook: groupHasBook.has(groupKeyOf(s)) });
    return {
      id: s.id,
      label: [
        subject ? SUBJECT_LABEL[subject] : null,
        TRACK_LABEL[s.track] ?? s.track,
        s.time_block ?? formatTime(s.start_time),
        s.recorded ? "인강" : null,
        replayTargets.isSparta(s) ? "스파르타" : pkg ? "묶음 반" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      group: replayTargets.groupLabel(s),
      status: s.status,
    };
  });

  const canManage = selected ? profile.role === "admin" || selected.instructor_id === user.id : false;
  const registered = (sessions ?? []).filter((s) => (s.replays?.length ?? 0) > 0).length;
  const selectedParts = selected ? (packages.get(selected.id)?.parts ?? []) : [];

  return (
    <div className="space-y-8">
      <PageHeader icon="replay" title="다시보기 등록" description="확정된 회차에 녹화본 주소를 연결합니다. 수강생은 종강일까지 시청할 수 있어요.">
        <Link href="/admin/sections" className="btn-secondary">
          <Icon name="calendar" size={18} />
          반 편성
        </Link>
      </PageHeader>

      {list.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Icon name="calendar" size={48} />
          <p className="font-bold text-ink">아직 개설된 반이 없어요</p>
          <Link href="/admin/sections" className="btn-primary mt-2">반 개설하러 가기</Link>
        </div>
      ) : (
        <>
          <section className="card p-5">
            <label htmlFor="section-select" className="label">반 선택</label>
            <SectionSelect options={options} value={selected?.id ?? null} />
            {selected && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate">
                <span>
                  종강일 <strong className="text-ink">{formatDate(selected.closes_at)}</strong>
                </span>
                <span className="text-xs">종강일까지 수강생이 시청할 수 있어요</span>
                <span className="ml-auto text-xs font-bold text-brand-600">
                  등록 {registered} / {sessions?.length ?? 0}회차
                </span>
              </div>
            )}
          </section>

          {selected && !canManage && (
            <Alert kind="warning" title="열람만 가능해요">이 반의 담당 강사만 다시보기를 등록·수정할 수 있어요.</Alert>
          )}

          {selectedParts.length > 0 && (
            <Alert kind="warning" title="묶음 반이에요 — 녹화본은 시간 단위 반에 올려 주세요">
              이 반 학생은 안에 든{" "}
              {selectedParts
                .slice()
                .sort((a, b) => (a.time_block ?? "").localeCompare(b.time_block ?? ""))
                .map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && " · "}
                    <Link href={`/admin/replays?section=${p.id}`} className="font-bold text-brand-600 hover:underline">
                      {p.time_block}
                    </Link>
                  </span>
                ))}{" "}
              반의 다시보기를 그대로 봅니다. 시간마다 강사가 다르니 그 반에 각각 올리면 60분만 듣는 학생도 자기 시간만 보게 돼요.
            </Alert>
          )}

          {/* 스파르타 반 — 올릴 자리가 아니다. 이 학생들은 포함 레벨의 시간 단위 반 녹화본을 그대로 본다 (2026-09-20 Alan) */}
          {selected && replayTargets.isSparta(selected) && (
            <Alert kind="warning" title="스파르타 반이에요 — 녹화본은 시간 단위 반에 올려 주세요">
              이 반 학생은{" "}
              <strong className="text-ink">
                {[selected.course?.target_score, ...(selected.course?.includes_levels ?? [])].filter((n) => typeof n === "number").join(" · ")}
              </strong>{" "}
              반의 다시보기를 그대로 봅니다. 여기에 올리면 스파르타 학생만 보게 되고, 오전 녹화본과 같은 영상이 두 번 생겨요.
            </Alert>
          )}

          {/* 인강 반 — 그 날 오전 수업 녹화본을 본다. 오전 짝을 찾는 일은 DB(private.recorded_source_section) 몫이라 여기서 계산하지 않는다 */}
          {selected?.recorded && (
            <Alert kind="warning" title="인강 반이에요 — 녹화본은 오전 반에 올려 주세요">
              이 반 학생은 교실에 나오지 않고 <strong className="text-ink">그 날 오전 수업의 녹화본</strong>을 봅니다. 같은 과목 오전 반에 올리면 여기서도 그대로 보여요.
            </Alert>
          )}

          {selected && (sessions?.length ?? 0) === 0 && (
            <div className="card flex flex-col items-center gap-2 p-8 text-center">
              <Icon name="warning" size={44} />
              <p className="font-bold text-ink">이 반은 아직 수업일이 확정되지 않았어요</p>
              <p className="text-sm text-slate">반 편성에서 캘린더를 저장하면 회차가 생성됩니다.</p>
              <Link href={`/admin/sections/${selected.id}`} className="btn-secondary mt-2">편성하러 가기</Link>
            </div>
          )}

          {selected && (sessions?.length ?? 0) > 0 && (
            <ul className="space-y-3">
              {(sessions ?? []).map((s) => (
                <ReplayRow
                  key={s.id}
                  sectionId={selected.id}
                  sessionDateId={s.id}
                  seq={s.seq}
                  date={s.date}
                  time={formatTimeRange(s.start_time, s.end_time)}
                  replay={s.replays?.[0] ? { id: s.replays[0].id, video_url: s.replays[0].video_url, published_at: s.replays[0].published_at } : null}
                  readOnly={!canManage}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
