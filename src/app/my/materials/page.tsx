import type { Metadata } from "next";
import { loadGated } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClassMaterialsView } from "@/components/my/ClassMaterialsView";
import { formatDate, todayKST, TRACK_LABEL } from "@/lib/utils";
import { initialSubject, type MaterialSubject } from "@/lib/class-materials";
import { cellKey, cellsOfSection, isRoundOpen, roundKey, roundsOf } from "@/lib/class-rounds";
import { bookTimesLabel } from "@/lib/lc-audio";
import { getMyAccessibleSections, getMyClassMaterials, getMyClassNotices, getMyOrders, getMyStudyEligibility } from "../_lib/queries";
import { NoticeList } from "@/components/class-materials/NoticeList";

export const metadata: Metadata = { title: "수업자료실", robots: { index: false } };

/**
 * 수업자료실 (2026-10-05 Alan — "지금 수업자료실이 없어! 수업자료실을 하나 만들어야하는데, 레벨별 구분과 RC, LC가 구분되어야해.").
 * **내 반의 레벨 × 과목 × 과정(A/B) 자료가, 그 회차 수업일에 하나씩 열린다** (같은 날 Alan — "자료게시판도 일정표 기반으로 오픈하는 걸로 하고,
 * 해당 날짜가 안되면 잠금이고, 해당날짜 수업이 진행되면 하나씩 오픈" · "A/B 과정 전부다 나눠서") — DB 가 막는다 (`private.my_open_rounds`).
 * 화면은 일정표다: 열린 회차(자료가 있는 것)를 최근 수업일부터, 그 아래 다음 수업일들을 자물쇠와 함께.
 * **RC 단과 학생에게는 RC 만** (2026-10-05 Alan — "RC단과 학생들은 음원파일과 LC수업자료실에 접근 안되는거 맞지?") — LC 칸은 잠긴 채 선다.
 * 중급속성 · 실전속성은 함께 듣는 레벨(850)도 열리므로 레벨이 여럿이면 레벨 칸이 위에 선다.
 * 개강일부터 종강일까지만 열린다 — 스태프도 학생 모드에서는 같다 (LC 음원 · 2026-10-02 Alan "뭐든 권한이 개강일에 맞춰서").
 */
export default async function ClassMaterialsPage({ searchParams }: { searchParams: Promise<{ level?: string; subject?: string }> }) {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다 — 잠금 판정과 데이터를 함께 받는다 (loadGated)
  const g = await loadGated("materials", () =>
    Promise.all([searchParams, getMyClassMaterials(), getMyOrders(), getMyAccessibleSections(), getMyClassNotices()]),
  );
  if (g.locked) return g.locked;
  const [sp, { access, dates, materials }, orders, mySections, notices] = g.data;
  // 공지사항 — 회차 자료보다 앞 (2026-10-05 Alan). 누르면 공지 페이지가 새로 열린다
  const noticeList = notices.length > 0 && (
    <section aria-label="공지사항">
      <NoticeList items={notices} hrefOf={(id) => `/my/materials/notices/${id}`} />
    </section>
  );
  const header = <PageHeader icon="download" title="수업자료실" description="내 수업 자료를 RC · LC 로 나눠 받아요. 회차마다 그 수업일에 열려요." />;

  const { accessTerms, opensOn } = await getMyStudyEligibility(orders);
  if (accessTerms.size === 0 || mySections.length === 0) {
    const opens = [...opensOn.values()].sort()[0];
    return (
      <div className="space-y-8">
        {header}
        {opens ? (
          <EmptyState
            icon="download"
            title="개강일부터 받을 수 있어요"
            description={`${formatDate(opens)} 개강부터 내 레벨의 수업 자료가 열려요.`}
            action={{ href: "/my", label: "내 등록 현황 보기" }}
          />
        ) : (
          <EmptyState
            icon="download"
            title="수강 중인 수강생만 받을 수 있어요"
            description="등업신청이 승인되고 개강일이 되면 수업 자료가 열려요."
            action={{ href: "/my/verify", label: "등업신청 확인하기" }}
          />
        )}
      </div>
    );
  }

  // 내 반의 과정(A/B)을 못 읽었을 때 — 과정이 아직 안 정해진 반이거나 교재 레벨 목록에 그 레벨이 없다. 다른 레벨로 메우지 않는다
  if (access.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        {noticeList}
        <EmptyState icon="download" title="내 수업 자료가 아직 없어요" description="강사님이 내 반의 과정을 정하고 자료를 올리면 수업일마다 여기에서 받을 수 있어요." />
      </div>
    );
  }

  // 레벨마다 내가 듣는 과목 — RC 단과면 RC 하나 (자료는 getMyClassMaterials 가 이미 열린 회차로 좁혔다)
  const here = access.find((a) => a.level === Number(sp.level)) ?? access[0];
  const inLevel = materials.filter((m) => m.level === here.level);
  const counts = Object.fromEntries(here.subjects.map((s) => [s, inLevel.filter((m) => m.subject === s).length])) as Partial<Record<MaterialSubject, number>>;
  const subject = initialSubject(sp.subject, counts, here.subjects);

  // 과정마다 그 과정을 쓰는 내 수업 시간 ("월수금 10:00~11:00") — 주5일 120분이면 RC 가 A(월수금) · B(화목금) 둘이다
  const timeOf = new Map<string, string>();
  for (const set of ["A", "B"] as const) {
    const key = cellKey(here.level, subject, set);
    const using = mySections.filter((sec) => cellsOfSection(sec).some((c) => cellKey(c.level, c.subject, c.set) === key));
    const label = bookTimesLabel(using, TRACK_LABEL);
    if (label) timeOf.set(set, label);
  }

  // 일정표 — 내 수업일마다 한 회차. 열린 회차는 자료가 있는 것만 최근 것부터, 다음 수업일은 날짜순
  const today = todayKST();
  const byKey = new Map<string, typeof inLevel>();
  for (const m of inLevel) {
    if (m.subject !== subject) continue;
    const key = roundKey(m.level, m.subject, m.book_set, m.seq);
    byKey.set(key, [...(byKey.get(key) ?? []), m]);
  }
  const rows = roundsOf(dates, here.level, subject).map((r) => ({ ...r, time: timeOf.get(r.set) ?? null }));
  const opened = rows
    .filter((r) => isRoundOpen(r.date, today))
    .reverse()
    .map((r) => ({ ...r, items: byKey.get(r.key) ?? [] }))
    .filter((r) => r.items.length > 0);
  const upcoming = rows.filter((r) => !isRoundOpen(r.date, today));

  return (
    <div className="space-y-5">
      {header}
      {noticeList}
      <ClassMaterialsView
        levels={access.map((a) => a.level)}
        level={here.level}
        subjects={here.subjects}
        subject={subject}
        counts={counts}
        today={today}
        opened={opened}
        upcoming={upcoming}
      />
    </div>
  );
}
