import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { cn, formatDate, lectureWayLabel, todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { TermChips } from "@/components/admin/TermChips";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { LectureOpenButton } from "@/components/admin/lectures/LectureOpenButton";
import { LectureSettingsForm } from "@/components/admin/lectures/LectureSettingsForm";
import { LectureMaterialsPanel } from "@/components/admin/lectures/LectureMaterialsPanel";
import { groupLectureMaterials } from "@/lib/lecture-materials";
import { LECTURE_STATE_CLASS, LECTURE_STATE_LABEL, lectureState, lectureTitle } from "@/lib/lecture";
import { termParam } from "@/lib/study";
import { pickTerm } from "../../_lib/queries";
import { getLectureTerms, getTermLectures, lectureTypeOf, lectureTypeTabs, pickLectureType } from "../_lib/lectures";

export const metadata: Metadata = { title: "특강 설정", robots: { index: false } };

/**
 * **특강 설정 — 종류별로** (2026-10-16 Alan — "일정표에서 수업일정을 만들때 특강신청에 관한 디테일을 전부다 기입하지말고, 간략하게 …
 * 특강설정은 특강신청에서 다 할 수 있도록 부탁해" · "특강설정 버튼을 특강신청에 하나 넣어놓고 해당 버튼을 누르면 종류별로 설정할 수 있도록 해줘").
 * 특강 신청 화면의 `특강 설정` 버튼이 여기로 온다. 맨 위 종류 버튼(RC특강 · LC특강 · 1차 · 2차 모의고사)으로 고르고, 특강마다
 * **신청 받기 · 취소**(누르는 순간) · **신청 방식마다 받기 · 신청 조건 · 정원** · **안내**(저장)를 정한다.
 * 날짜 · 강사 · 무슨 특강 · 메모는 반 편성 달력에서 정한다.
 * **특강 자료실**(2026-10-30 Alan — "신청한 사람들만 보이는 자료실")도 특강마다 여기서 올린다 — 그 특강을 신청한 학생만 특강 신청 화면에서 본다.
 */
export default async function LectureSettingsPage({ searchParams }: { searchParams: Promise<{ term?: string; type?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  const terms = await getLectureTerms(supabase);
  const term = pickTerm(terms, sp.term, today);
  const back = (
    <Link href={term ? `/admin/lectures?term=${termParam(term.year, term.month)}` : "/admin/lectures"} className="btn-secondary">
      특강 신청으로
    </Link>
  );
  if (!term) {
    return (
      <>
        <PageHeader icon="bolt" title="특강 설정" description="종류별로 신청 방식 · 신청 조건 · 정원 · 안내를 정해요.">
          {back}
        </PageHeader>
        <EmptyState
          icon="calendar"
          title="아직 만든 특강이 없어요"
          description="반 편성 달력에서 [특강] 을 고르고 날짜를 누르면 여기에 나타납니다."
          action={{ href: "/admin/sections", label: "반 편성에서 특강 만들기" }}
        />
      </>
    );
  }

  const termKey = termParam(term.year, term.month);
  const { lectures, error } = await getTermLectures(supabase, term.id);
  const type = pickLectureType(lectures, sp.type, today);
  const ofType = lectures.filter((l) => lectureTypeOf(l) === type);
  // 특강 자료실 — 보고 있는 종류의 특강 자료 (강사 · 관리자는 정책이 전부 연다). 표가 아직 없으면(배포 사이) 빈 채로 — 자료 칸만 "읽지 못했어요"
  const materialsRes =
    ofType.length > 0
      ? await supabase
          .from("special_lecture_materials")
          .select("id, lecture_id, title, note, links, sort_order, created_at, updated_at, files:special_lecture_material_files(id, file_name, file_size, content_type, sort_order)")
          .in(
            "lecture_id",
            ofType.map((l) => l.id),
          )
      : { data: [], error: null };
  const materialsByLecture = groupLectureMaterials(materialsRes.data);

  return (
    <>
      <PageHeader
        icon="bolt"
        title="특강 설정"
        description="종류를 고르고 특강마다 신청 받기, 신청 방식(받기 · 조건 · 정원), 안내를 정해요. 날짜 · 강사는 반 편성 달력에서 바꿔요."
      >
        {back}
        <Link href={`/admin/sections?term=${termKey}`} className="btn-secondary">
          <Icon name="calendar" size={18} />
          반 편성
        </Link>
      </PageHeader>

      {error && (
        <Alert kind="warning" title="특강을 읽지 못했어요" className="mb-4">
          <p>데이터베이스 업데이트가 아직 적용되지 않았거나 잠깐 연결이 끊겼어요. 잠시 뒤 새로고침해 주세요.</p>
        </Alert>
      )}

      <TermChips basePath="/admin/lectures/settings" terms={terms} current={termKey} />
      {type && <FilterTabs basePath="/admin/lectures/settings" paramKey="type" current={type} tabs={lectureTypeTabs(lectures)} keep={{ term: termKey }} />}

      <div className="space-y-4">
        {ofType.map((l) => {
          const state = lectureState(l, l.ways, today);
          const past = l.date < today;
          return (
            <section key={l.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line bg-violet-50/50 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-black text-ink">{lectureTitle(l)}</p>
                  <p className="mt-0.5 text-sm text-slate">
                    {formatDate(l.date)}
                    {l.lecturer?.name && <span className="ml-2 font-bold text-violet-700">{l.lecturer.name}</span>}
                    <span className="ml-2 text-xs text-mist">신청 {l.applied_count}명</span>
                  </p>
                </div>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", LECTURE_STATE_CLASS[state])}>{LECTURE_STATE_LABEL[state]}</span>
                  <LectureOpenButton lectureId={l.id} open={l.signup} past={past} signups={l.applied_count} />
                </span>
              </div>
              <div className="px-4 py-4">
                {!past && !l.signup && (
                  <p className="mb-3 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
                    아직 학생 화면에 보이지 않아요. 아래를 정하고 저장한 뒤 &lsquo;신청 받기&rsquo; 를 누르면 바로 열려요.
                  </p>
                )}
                {/* 방식이 바뀔 때만(반 편성에서 무슨 특강을 바꿈) 새로 그린다 — 값이 바뀔 때마다 다시 그리면 저장 뒤 "저장했어요" 가 바로 사라진다 */}
                <LectureSettingsForm
                  key={`${l.id}:${l.ways.map((w) => w.way).join("|")}`}
                  lectureId={l.id}
                  ways={l.ways.map((w) => ({
                    way: w.way,
                    label: lectureWayLabel(w.way),
                    enabled: w.enabled,
                    capacity: w.capacity,
                    condition: w.signup_condition,
                    applied: w.applied_count,
                  }))}
                  notice={l.notice}
                />
                {materialsRes.error ? (
                  <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">특강 자료실을 읽지 못했어요. 데이터베이스 업데이트가 아직 적용되지 않았거나 잠깐 연결이 끊겼어요.</p>
                ) : (
                  <LectureMaterialsPanel lectureId={l.id} materials={materialsByLecture.get(l.id) ?? []} signups={l.applied_count} />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
