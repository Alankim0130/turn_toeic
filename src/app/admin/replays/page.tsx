import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatTime, formatTimeRange, todayKST, TRACK_LABEL } from "@/lib/utils";
import { SectionSelect } from "@/components/admin/replays/SectionSelect";
import { ReplayRow } from "@/components/admin/replays/ReplayRow";
import { sectionPackages } from "@/lib/time-blocks";
import { SUBJECT_LABEL, subjectOf } from "@/lib/instructor-subject";
import { replayTargets } from "@/lib/replay-targets";
import { timeBlockOf } from "@/components/admin/sections/bulk";
import { FilterTabs } from "@/components/admin/FilterTabs";

export const metadata: Metadata = { title: "다시보기 등록", robots: { index: false } };

export default async function AdminReplaysPage({ searchParams }: { searchParams: Promise<{ section?: string; level?: string }> }) {
  const { user, profile } = await requireStaff();
  const { section: sectionParam, level: levelParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: sections }, { data: usedRows }, { data: slots }] = await Promise.all([
    supabase
      .from("class_sections")
      .select(
        "id, term_id, course_id, track, start_time, end_time, time_block, status, enrollment_opens_at, closes_at, instructor_id, book_set, subject, recorded, course:courses(name, program, target_score, includes_levels), term:terms(year, month)",
      )
      .order("id", { ascending: false })
      .limit(200),
    // 녹화본이 이미 붙은 반 — 목록에서 빼면 그 기록에 닿을 길이 사라지므로 무엇이든 남긴다
    supabase.from("session_dates").select("section_id, replays!inner(id)"),
    // 저녁 줄 = 시간표에서 `화목금 인강` 이 켜진 시간대. **시각을 코드에 적지 않는다** (도메인 규칙 1)
    supabase.from("timetable_slots").select("start_time, end_time, ttf_recorded").eq("ttf_recorded", true),
  ]);

  const list = sections ?? [];
  // 묶음 반(120분·140분)에는 녹화본을 올리지 않는다 — 안에 든 시간 단위 반에 올리면 묶음 반 학생도 본다
  const packages = sectionPackages(list);
  const hasReplay = new Set((usedRows ?? []).map((r) => r.section_id));
  const eveningBlocks = new Set((slots ?? []).map((t) => timeBlockOf(t.start_time, t.end_time)).filter((b): b is string => !!b));
  const canUpload = (s: (typeof list)[number]) => replayTargets.uploadable(s, packages, eveningBlocks);
  const requested = Number(sectionParam);
  const requestedSection = (Number.isInteger(requested) && list.find((s) => s.id === requested)) || null;

  /**
   * **레벨은 위 버튼으로 가른다** (2026-09-20 Alan "위에 따로 레벨 버튼을 만들어서 구분하게 해줘").
   * 드롭다운 optgroup 하나에 650·750·850 을 다 담으면 한 번에 스무 줄이라 눈으로 훑기 어렵다.
   * 값은 `courses.target_score` 에서 읽는다 — 코드에 레벨을 적지 않는다 (작업 원칙 4).
   * 주소로 들어온 반이 있으면 **그 반의 레벨**을 켜 준다 (인강 반 안내의 오전 짝 링크가 다른 레벨일 수 있다).
   */
  const listable = list.filter((s) => canUpload(s) || hasReplay.has(s.id));
  const levelTabs = replayTargets.levels(listable);
  const currentLevel = levelTabs.includes(Number(levelParam))
    ? Number(levelParam)
    : (requestedSection && replayTargets.levelOf(requestedSection)) || levelTabs[0] || null;
  const inLevel = (s: (typeof list)[number]) => currentLevel == null || replayTargets.levelOf(s) === currentLevel;

  // 기본으로 여는 반은 **지금 개강일~종강일 안인 반** 먼저 — 다음 달 반을 미리 열어 두면 id 가 더 커서
  // 아직 시작도 안 한 다음 달 반이 먼저 열렸다 (2026-09-22 점검)
  const today = todayKST();
  const running = (s: (typeof list)[number]) => s.enrollment_opens_at <= today && today <= s.closes_at;
  const selected =
    requestedSection ||
    listable.find((s) => running(s) && s.status === "open" && canUpload(s) && inLevel(s)) ||
    listable.find((s) => s.status === "open" && canUpload(s) && inLevel(s)) ||
    listable.find((s) => inLevel(s)) ||
    list.find((s) => inLevel(s)) ||
    null;

  const [{ data: sessions }, { data: pairRows }] = await Promise.all([
    selected
      ? supabase.from("session_dates").select("id, seq, date, start_time, end_time, replays(id, video_url, published_at)").eq("section_id", selected.id).order("date")
      : Promise.resolve({ data: [] as never[] }),
    // 저녁 반(화목금 인강 · 월수금 현장) ↔ 녹화본을 올릴 오전 짝 (마이그레이션 20260920120000 · 20260923140000).
    // 규칙은 DB 한곳(private.recorded_source_section) — **화면에서 다시 계산하지 않는다** (도메인 규칙 1 "반 권한")
    selected?.term_id != null
      ? supabase.rpc("term_recorded_pairs", { p_term_id: selected.term_id })
      : Promise.resolve({ data: null }),
  ]);

  const pairs = pairRows ?? [];
  const byId = new Map(list.map((s) => [s.id, s]));
  const sectionName = (id: number) => {
    const s = byId.get(id);
    return s ? [TRACK_LABEL[s.track] ?? s.track, s.time_block ?? formatTime(s.start_time)].filter(Boolean).join(" ") : `반 #${id}`;
  };
  /** 이 저녁 반(인강 · 현장) 학생이 실제로 보는 녹화본이 올라갈 오전 반 */
  const recordedSource = selected ? (pairs.find((p) => p.recorded_id === selected.id)?.source_id ?? null) : null;
  /** 이 반의 녹화본을 함께 보는 저녁 반들 (화목금 인강 · 월수금 현장) */
  const feedsRecorded = selected ? pairs.filter((p) => p.source_id === selected.id).map((p) => p.recorded_id) : [];

  /**
   * **올릴 수 있는 반만 목록에 둔다** (2026-09-20 Alan — "스파르타반은 결국 두개의 다른 레벨에 접근권한이 다 있는데
   * 왜 다시보기에 추가 되어있는지 모르겠어"). 도메인 규칙 1 "반 권한" 에 적힌 그대로다 —
   * 녹화본은 **시간 단위 반에 한 번만** 두고 묶음 반·스파르타 반에는 올리지 않는다.
   * 그동안 화면은 묶음 반만 고른 뒤에 경고했고 스파르타 반은 아무 처리가 없어 36개가 통째로 쏟아졌다.
   * 단 **이미 녹화본이 붙은 반은 남긴다** — 목록에서 빼면 그 기록을 고치거나 지울 길이 없어진다.
   */
  // 고른 반은 레벨이 달라도 늘 목록에 둔다 — 안 그러면 드롭다운이 빈 값을 가리킨다
  const shown = list.filter((s) => s.id === selected?.id || (inLevel(s) && (canUpload(s) || hasReplay.has(s.id)))).sort(replayTargets.compare);

  const options = shown.map((s) => {
    const pkg = replayTargets.isPackage(s, packages);
    // 과목은 반의 과목 칸이 말해 준다 (도메인 규칙 1 "담당 강사는 과목으로 저절로 정해진다", 2026-09-23)
    const subject = subjectOf({ subject: s.subject, isPackage: pkg || replayTargets.isSparta(s) });
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
            {/* 레벨 버튼 — 누르면 `section` 은 버린다. 안 버리면 다른 레벨 반이 고른 채로 남는다 */}
            {levelTabs.length > 1 && (
              <FilterTabs
                basePath="/admin/replays"
                paramKey="level"
                current={String(currentLevel ?? "")}
                tabs={levelTabs.map((n) => ({ value: String(n), label: `${n}` }))}
              />
            )}
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

          {/* 저녁 반 — 화목금 인강은 다시보기가 수업 그 자체다 (2026-09-20 Alan "인강이라는 말이 녹화된 방송을 본다는 말이야"),
              월수금 현장은 복습이다 (2026-09-23 Alan "저녁 월수금 현장반 학생에게도 다시보기를 열어줘").
              어느 쪽이든 영상은 이 반이 아니라 **오전 짝 반**에 올라가야 보인다. 짝은 DB 가 정한다 — 화면에서 계산하지 않는다 */}
          {selected && (selected.recorded || recordedSource) && (
            <Alert kind="warning" title={selected.recorded ? "인강 반이에요 — 녹화본은 오전 반에 올려 주세요" : "저녁 반이에요 — 녹화본은 오전 반에 올려 주세요"}>
              {selected.recorded ? (
                <>
                  이 반 학생은 교실에 나오지 않고 <strong className="text-ink">그 날 오전 수업의 녹화본</strong>을 봅니다 — 다시보기가 이 반의 수업 그 자체예요.
                </>
              ) : (
                <>
                  이 반 학생은 저녁에 교실에 나오고, <strong className="text-ink">그 날 오전 수업의 녹화본</strong>을 다시보기로 봅니다.
                </>
              )}
              {recordedSource ? (
                <>
                  {" "}
                  영상은{" "}
                  <Link href={`/admin/replays?section=${recordedSource}`} className="font-bold text-brand-600 hover:underline">
                    {sectionName(recordedSource)}
                  </Link>{" "}
                  반에 올려 주세요. 여기에 올리면 저녁 학생만 보고 오전 녹화본과 두 벌이 됩니다.
                </>
              ) : (
                " 같은 과목·같은 트랙의 오전 반에 올리면 여기서도 그대로 보여요."
              )}
            </Alert>
          )}

          {/* 이 반이 저녁 반의 공급원이다 — 화목금 인강 학생에게는 수업 그 자체, 월수금 현장 학생에게는 복습. 여기가 비면 인강 학생은 볼 것이 없다 */}
          {feedsRecorded.length > 0 && (
            <Alert kind="info" title="저녁 반도 이 녹화본을 봅니다">
              {feedsRecorded.map((id, i) => (
                <span key={id}>
                  {i > 0 && " · "}
                  <strong className="text-ink">{sectionName(id)}</strong>
                  <span className="text-xs text-slate">{byId.get(id)?.recorded ? " (인강)" : " (현장)"}</span>
                </span>
              ))}{" "}
              학생이 <strong className="text-ink">이 반의 녹화본</strong>을 다시보기로 봅니다 — 인강 학생에게는 수업 그 자체라 여기가 비어 있으면 볼 것이 없고,
              저녁 현장 학생에게는 복습이에요.
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
