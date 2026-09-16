import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatWon, TRACK_LABEL, COURSE_TYPE_LABEL } from "@/lib/utils";
import { SectionEditForm } from "@/components/admin/sections/SectionEditForm";
import { LiveLinkForm } from "@/components/admin/sections/LiveLinkForm";
import { DeleteSectionButton } from "@/components/admin/sections/DeleteSectionButton";
import { labelKo, termKey } from "@/components/admin/sections/dates";

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
    .select("*, course:courses(id, name, course_type, target_score), term:terms(id, year, month), instructor:profiles(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!section || !section.term) notFound();

  const [{ data: sessions }, { data: sibling }, { data: live }, { count: enrolled }, { data: instructors }] = await Promise.all([
    supabase.from("session_dates").select("id, seq, date, replays(id, video_url)").eq("section_id", id).order("date"),
    section.bundle_id
      ? supabase.from("class_sections").select("id, track").eq("bundle_id", section.bundle_id).neq("id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("section_live_links").select("live_url, updated_at").eq("section_id", id).maybeSingle(),
    supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("section_id", id),
    isAdmin(profile.role)
      ? supabase.from("profiles").select("id, name, role").in("role", ["instructor", "admin"]).order("name")
      : Promise.resolve({ data: null }),
  ]);

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
            묶음 반 ({TRACK_LABEL[sibling.track] ?? sibling.track})
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
                  <th className="px-3 py-2 font-semibold">다시보기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sessionList.map((s) => {
                  const rep = s.replays?.[0];
                  return (
                    <tr key={s.id}>
                      <td className="px-5 py-2.5 font-black text-brand-600">{s.seq}회</td>
                      <td className="px-3 py-2.5 font-semibold text-ink">{labelKo(s.date)}</td>
                      <td className="px-3 py-2.5">
                        {rep ? (
                          <a href={rep.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline">
                            <Icon name="replay" size={14} />
                            등록됨
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
        <p className="mt-1 text-sm text-slate">이 반에 접근 가능한 수강생에게만 보입니다. 종강일이 지나면 자동으로 닫혀요.</p>
        <div className="mt-4">
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
              {section.course?.name} {section.course?.course_type && `· ${COURSE_TYPE_LABEL[section.course.course_type]}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mist">트랙</dt>
            <dd className="font-semibold text-ink">{TRACK_LABEL[section.track] ?? section.track}</dd>
          </div>
          <div>
            <dt className="text-xs text-mist">수강료 (현장 / 불라방)</dt>
            <dd className="font-semibold text-ink">
              {section.tuition != null ? formatWon(section.tuition) : "미입력"} / {section.live_tuition != null ? formatWon(section.live_tuition) : "미운영"}
            </dd>
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
              tuition: section.tuition != null ? String(section.tuition) : "",
              live_tuition: section.live_tuition != null ? String(section.live_tuition) : "",
              status: section.status,
              book_set: section.book_set ?? "",
              instructor_id: section.instructor_id ?? "",
            }}
            instructors={instructors ?? null}
            readOnly={!canManage}
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
