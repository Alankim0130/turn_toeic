import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate, TRACK_LABEL } from "@/lib/utils";
import { sectionTypeLabel } from "@/lib/section-type";
import { LiveReplayToggle, SessionLiveLinkForm } from "@/components/admin/sections/SessionLiveLinkForm";
import { SectionEditForm } from "@/components/admin/sections/SectionEditForm";
import { LiveLinkForm } from "@/components/admin/sections/LiveLinkForm";
import { DeleteSectionButton } from "@/components/admin/sections/DeleteSectionButton";
import { labelKo, termKey } from "@/components/admin/sections/dates";
import { blockContains, dashLabel } from "@/lib/time-blocks";

export const metadata: Metadata = { title: "반 상세", robots: { index: false } };

const STATUS_LABEL: Record<string, string> = { draft: "준비 중", open: "모집 중", closed: "종료" };

export default async function AdminSectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requireStaff();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();

  const supabase = await createClient();
  const { data: section } = await supabase
    .from("class_sections")
    .select("*, course:courses(id, name, course_type, target_score, program, includes_levels), term:terms(id, year, month), instructor:profiles(id, name, subject)")
    .eq("id", id)
    .maybeSingle();
  if (!section || !section.term) notFound();

  const [{ data: sessions }, { data: sibling }, { data: live }, { count: enrolled }, { data: instructors }, { data: sameCourse }] = await Promise.all([
    supabase.from("session_dates").select("id, seq, date, replays(id, video_url), session_live_links(live_url, promoted_at, source)").eq("section_id", id).order("date"),
    // 주5일 짝 = 같은 기수 · 강좌 · 시간대의 반대 트랙 반 (시간대가 없는 반은 하나씩 만들기의 bundle_id 로)
    section.time_block
      ? supabase
          .from("class_sections")
          .select("id, track")
          .eq("term_id", section.term_id)
          .eq("course_id", section.course_id)
          .eq("time_block", section.time_block)
          .neq("track", section.track)
          .limit(1)
          .maybeSingle()
      : section.bundle_id
        ? supabase.from("class_sections").select("id, track").eq("bundle_id", section.bundle_id).neq("id", id).maybeSingle()
        : Promise.resolve({ data: null }),
    supabase.from("section_live_links").select("live_url, updated_at").eq("section_id", id).maybeSingle(),
    supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("section_id", id),
    isAdmin(profile.role)
      ? supabase.from("profiles").select("id, name, role").in("role", ["instructor", "admin"]).order("name")
      : Promise.resolve({ data: null }),
    supabase.from("class_sections").select("id, track, time_block, book_set").eq("term_id", section.term_id).eq("course_id", section.course_id).neq("id", id),
  ]);

  // 이 반 학생에게 함께 열리는 반 (DB 의 private.section_includes 와 같은 판정):
  // 스파르타 반 → 포함 레벨의 시간 단위 반, 묶음 반(120분·140분) → 안에 든 60분·70분 시간 단위 반
  const isSparta = section.course?.program === "sparta";
  const { data: includeRows } = await supabase.rpc("term_section_includes", { p_term_id: section.term.id });
  const includedIds = (includeRows ?? []).filter((r) => r.section_id === id).map((r) => r.included_id);
  const { data: includedSections } = includedIds.length
    ? await supabase.from("class_sections").select("id, track, time_block, book_set, course:courses(name)").in("id", includedIds).order("time_block")
    : { data: [] as { id: number; track: string; time_block: string | null; book_set: string | null; course: { name: string } | null }[] };
  const isPackage = !isSparta && includedIds.length > 0;
  // 이 반을 안에 품는 묶음 반 (60분 반이면 120분 반) — 그 반 학생도 이 반을 함께 듣는다
  const parents = !isSparta ? (sameCourse ?? []).filter((s) => s.track === section.track && blockContains(s.time_block, section.time_block)) : [];
  // 종합/단과 (2026-09-18 Alan): 시간 단위 반은 담당 한 명의 단과(LC·RC), 묶음·스파르타만 종합
  const groupHasBook = [section, ...(sameCourse ?? [])].some((s) => s.time_block === section.time_block && !!s.book_set);
  const typeLabel = sectionTypeLabel(section, { isPackage, groupHasBook });
  const sessionLink = (s: NonNullable<typeof sessions>[number]) => {
    const l = s.session_live_links;
    return (Array.isArray(l) ? l[0] : l) ?? null;
  };
  const bookSetNote = isSparta
    ? "스파르타 반은 교재를 두지 않아요. 함께 듣는 점수보장반의 교재를 씁니다."
    : isPackage
      ? "묶음 반은 교재를 두지 않아요. 안에 든 시간 단위 반(LC 시간)에 지정하면 이 반 학생도 그 교재를 봅니다."
      : undefined;

  const canManage = isAdmin(profile.role) || section.instructor_id === user.id;
  const sessionList = sessions ?? [];
  const termLabel = `${section.term.year}년 ${section.term.month}월`;
  const calendarHref = `/admin/sections?term=${termKey(section.term.year, section.term.month)}`;
  const title = `${section.course?.name ?? "강좌"} · ${TRACK_LABEL[section.track] ?? section.track}`;

  return (
    <div className="space-y-8">
      <nav aria-label="경로" className="text-sm text-slate">
        <Link href={calendarHref} className="font-semibold hover:text-brand-600">
          ← {termLabel} 반 편성
        </Link>
      </nav>

      <PageHeader icon="calendar" title={title} description={`${termLabel} · ${STATUS_LABEL[section.status] ?? section.status}`}>
        {sibling && (
          <Link href={`/admin/sections/${sibling.id}`} className="btn-secondary">
            <Icon name="bolt" size={18} />
            주5일 짝 ({TRACK_LABEL[sibling.track] ?? sibling.track})
          </Link>
        )}
        <Link href={`/admin/replays?section=${id}`} className="btn-secondary">
          <Icon name="replay" size={18} />
          다시보기
        </Link>
      </PageHeader>

      {!canManage && (
        <Alert kind="warning" title="열람만 가능해요">
          이 반의 담당 강사는 {section.instructor?.name ?? "미지정"} 입니다. 본인 반만 수정할 수 있어요.
        </Alert>
      )}

      {/* 요약 */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "개강일", value: formatDate(section.enrollment_opens_at, { month: "long", day: "numeric", weekday: "short" }) },
          { label: "종강일", value: formatDate(section.closes_at, { month: "long", day: "numeric", weekday: "short" }) },
          { label: "수업일", value: `${sessionList.length}회` },
          { label: "배정 수강생", value: `${enrolled ?? 0}명` },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-mist">{s.label}</p>
            <p className="mt-1 text-lg font-black text-ink">{s.value}</p>
          </div>
        ))}
      </section>

      {/* 60분 시간 단위 반: 이 반을 품는 묶음 반 */}
      {parents.length > 0 && (
        <Alert kind="info" title="묶음 반 학생도 이 시간을 함께 들어요">
          {parents.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " · "}
              <Link href={`/admin/sections/${p.id}`} className="font-bold text-brand-600 hover:underline">
                {section.course?.name} {p.time_block}
              </Link>
            </span>
          ))}{" "}
          반에 배정된 학생은 이 반의 수업일·다시보기·불라방 링크·LC 교재를 그대로 봅니다. 녹화본은 이 반에 한 번만 올리면 돼요.
        </Alert>
      )}

      {/* 스파르타 반 · 묶음 반 권한: 함께 열리는 반 */}
      {(isSparta || isPackage) && (
        <section aria-labelledby="includes-title" className="card p-5 sm:p-6">
          <h2 id="includes-title" className="flex flex-wrap items-center gap-2 text-lg font-black text-ink">
            {isSparta ? (
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-black text-brand-700">스파르타반</span>
            ) : (
              <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-black text-white">묶음 반</span>
            )}
            이 반 학생에게 함께 열리는 반
          </h2>
          {isSparta ? (
            <p className="mt-1 text-sm text-slate">
              {[section.course?.target_score, ...(section.course?.includes_levels ?? [])].filter(Boolean).join(" + ")} 반 중 {termLabel}
              {" "}
              {TRACK_LABEL[section.track] ?? section.track}·{section.time_block ?? "시간대 없음"}과 시간이 겹치는 시간 단위 반입니다. 이 반들의 수업일·다시보기·불라방 링크·LC 음원을 함께 볼 수 있어요.
              녹화본은 아래 반에 올리면 되고 스파르타 반에 따로 올리지 않아도 됩니다.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate">
              {section.time_block} 안에 든 시간 단위 반({(includedSections ?? []).map((s) => (s.time_block ? dashLabel(s.time_block) : "")).filter(Boolean).join(" + ")})입니다.
              이 반 학생은 아래 반의 수업일·다시보기·불라방 링크·LC 교재를 그대로 봐요. 녹화본·불라방 링크·교재는 <strong className="text-ink">아래 반에</strong> 올리고 이 묶음 반에는 따로 올리지 않습니다.
            </p>
          )}
          {(includedSections ?? []).length === 0 ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              아직 함께 열릴 반이 없어요. 같은 트랙·시간대의 {(section.course?.includes_levels ?? []).join("·")} 반과 {section.course?.target_score} 반을 먼저 개설해 주세요.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-xl2 border border-line">
              {(includedSections ?? []).map((inc) => (
                <li key={inc.id}>
                  <Link href={`/admin/sections/${inc.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-brand-50/50">
                    <span className="font-black text-ink">{inc.course?.name ?? "강좌"}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold text-white", inc.track === "mwf" ? "bg-brand-500" : "bg-ink")}>
                      {TRACK_LABEL[inc.track] ?? inc.track}
                    </span>
                    {inc.time_block && <span className="font-bold tabular-nums text-ink-soft">{inc.time_block}</span>}
                    {inc.book_set && <span className="text-xs font-bold text-slate">LC 교재 {inc.book_set}반</span>}
                    <span className="ml-auto text-xs font-bold text-brand-600">반 보기 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 수업일 (달력에서 파생) */}
      <section aria-labelledby="sessions-title" className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brand-50/60 px-5 py-3">
          <h2 id="sessions-title" className="font-black text-ink">
            수업일 <span className="text-sm font-semibold text-slate">— {termLabel} 달력의 {TRACK_LABEL[section.track] ?? section.track} 날짜</span>
          </h2>
          <div className="flex gap-3 text-xs font-bold">
            <Link href={calendarHref} className="text-brand-600 hover:underline">
              달력에서 바꾸기 →
            </Link>
            <Link href={`/admin/replays?section=${id}`} className="text-brand-600 hover:underline">
              다시보기 등록 →
            </Link>
          </div>
        </div>
        {sessionList.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate">
            {termLabel} 달력에 {TRACK_LABEL[section.track] ?? section.track} 수업일이 아직 없어요. 반 편성 달력에서 날짜를 찍고 생성하기를 눌러 주세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="text-left text-xs text-mist">
                <tr>
                  <th className="px-5 py-2 font-semibold">회차</th>
                  <th className="px-3 py-2 font-semibold">날짜</th>
                  <th className="px-3 py-2 font-semibold">불라방 링크</th>
                  <th className="px-3 py-2 font-semibold">다시보기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sessionList.map((s) => {
                  const rep = s.replays?.[0];
                  const link = sessionLink(s);
                  return (
                    <tr key={s.id}>
                      <td className="px-5 py-2.5 font-black text-brand-600">{s.seq}회</td>
                      <td className="px-3 py-2.5 font-semibold text-ink">{labelKo(s.date)}</td>
                      <td className="px-3 py-2.5">
                        {/* 회차마다 라이브 주소가 다르다 — 오전반은 수업이 끝나면 이 주소가 다시보기로 (2026-09-18 Alan) */}
                        <SessionLiveLinkForm
                          sessionDateId={s.id}
                          sectionId={id}
                          seq={s.seq}
                          current={link?.live_url ?? ""}
                          promoted={!!link?.promoted_at}
                          autoReplay={section.live_to_replay}
                          readOnly={!canManage}
                          detected={link?.source === "youtube"}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        {rep ? (
                          <a href={rep.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline">
                            <Icon name="replay" size={14} />
                            {link?.promoted_at && rep.video_url === link.live_url ? "불라방에서 연결됨" : "등록됨"}
                          </a>
                        ) : (
                          <span className="text-xs text-mist">없음</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 불라방 링크 */}
      <section aria-labelledby="live-title" className="card p-5 sm:p-7">
        <h2 id="live-title" className="flex items-center gap-2 text-lg font-black text-ink">
          <Icon name="live" size={24} />
          불라방 입장 링크
        </h2>
        <p className="mt-1 text-sm text-slate">
          이 반에 접근 가능한 수강생에게만 보입니다. 종강일이 지나면 자동으로 닫혀요.
          <strong className="text-ink"> 회차마다 라이브 주소가 다르면 위 수업일 표의 “불라방 링크” 칸에 그 날 주소를 넣어 주세요</strong> —
          학생에게는 오늘(없으면 다음 수업) 회차 링크가 먼저 보이고, 없을 때 아래 상시 링크가 보여요.
        </p>
        <div className="mt-4">
          <LiveReplayToggle sectionId={id} on={section.live_to_replay} readOnly={!canManage} />
        </div>
        <p className="mt-4 text-xs font-bold text-slate">상시 입장 링크 <span className="font-normal text-mist">(Zoom 처럼 늘 같은 방 — 회차 링크가 없을 때)</span></p>
        <div className="mt-2">
          <LiveLinkForm sectionId={id} current={live?.live_url ?? ""} readOnly={!canManage} />
        </div>
      </section>

      {/* 기본 정보 */}
      <section aria-labelledby="info-title" className="card p-5 sm:p-7">
        <h2 id="info-title" className="text-lg font-black text-ink">기본 정보</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-mist">강좌</dt>
            <dd className="font-semibold text-ink">
              {section.course?.name} {typeLabel && `· ${typeLabel}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mist">트랙</dt>
            <dd className="font-semibold text-ink">{TRACK_LABEL[section.track] ?? section.track}</dd>
          </div>
          <div>
            <dt className="text-xs text-mist">담당 강사</dt>
            <dd className="font-semibold text-ink">{section.instructor?.name ?? "미지정"}</dd>
          </div>
        </dl>
        <div className="mt-5">
          <SectionEditForm
            id={section.id}
            values={{
              capacity: section.capacity != null ? String(section.capacity) : "",
              status: section.status,
              book_set: section.book_set ?? "",
              instructor_id: section.instructor_id ?? "",
            }}
            instructors={instructors ?? null}
            readOnly={!canManage}
            bookSetNote={bookSetNote}
          />
        </div>
      </section>

      {canManage && (
        <section aria-labelledby="danger-title" className="rounded-xl2 border border-red-200 bg-red-50/50 p-5">
          <h2 id="danger-title" className="text-base font-black text-red-700">반 삭제</h2>
          <p className="mt-1 text-sm text-slate">
            수업일과 다시보기가 함께 삭제됩니다. 배정된 수강생이 있으면 삭제할 수 없어요 ({enrolled ?? 0}명).
          </p>
          <div className="mt-3">
            <DeleteSectionButton sectionId={id} disabled={(enrolled ?? 0) > 0} />
          </div>
        </section>
      )}
    </div>
  );
}
