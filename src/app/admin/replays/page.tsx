import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatTime, TRACK_LABEL } from "@/lib/utils";
import { SectionSelect } from "@/components/admin/replays/SectionSelect";
import { ReplayRow } from "@/components/admin/replays/ReplayRow";

export const metadata: Metadata = { title: "다시보기 등록", robots: { index: false } };

export default async function AdminReplaysPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { user, profile } = await requireStaff();
  const { section: sectionParam } = await searchParams;
  const supabase = await createClient();

  const { data: sections } = await supabase
    .from("class_sections")
    .select("id, track, start_time, end_time, time_block, status, closes_at, instructor_id, course:courses(name), term:terms(year, month)")
    .order("id", { ascending: false })
    .limit(200);

  const list = sections ?? [];
  const requested = Number(sectionParam);
  const selected =
    (Number.isInteger(requested) && list.find((s) => s.id === requested)) ||
    list.find((s) => s.status === "open") ||
    list[0] ||
    null;

  const { data: sessions } = selected
    ? await supabase.from("session_dates").select("id, seq, date, start_time, end_time, replays(id, video_url, published_at)").eq("section_id", selected.id).order("date")
    : { data: [] as never[] };

  const options = list.map((s) => ({
    id: s.id,
    label: `${s.course?.name ?? "강좌"} · ${TRACK_LABEL[s.track] ?? s.track} · ${formatTime(s.start_time)}${s.time_block ? ` (${s.time_block})` : ""}`,
    group: s.term ? `${s.term.year}년 ${s.term.month}월` : "기수 미지정",
    status: s.status,
  }));

  const canManage = selected ? profile.role === "admin" || selected.instructor_id === user.id : false;
  const registered = (sessions ?? []).filter((s) => (s.replays?.length ?? 0) > 0).length;

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
                  time={`${formatTime(s.start_time)}–${formatTime(s.end_time)}`}
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
