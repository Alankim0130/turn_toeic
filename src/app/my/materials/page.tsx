import type { Metadata } from "next";
import { studentGate } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClassMaterialsView } from "@/components/my/ClassMaterialsView";
import { formatDate } from "@/lib/utils";
import { initialSubject, MATERIAL_SUBJECTS, type MaterialSubject } from "@/lib/class-materials";
import { getMyAccessibleSections, getMyClassMaterials, getMyOrders, getMyStudyEligibility } from "../_lib/queries";

export const metadata: Metadata = { title: "수업자료실", robots: { index: false } };

/**
 * 수업자료실 (2026-10-05 Alan — "지금 수업자료실이 없어! 수업자료실을 하나 만들어야하는데, 레벨별 구분과 RC, LC가 구분되어야해.").
 * **내 레벨 자료만** 보이고(DB 가 막는다 — `private.my_lc_levels()`, LC 음원과 같은 규칙) 그 안에서 RC · LC 로 나눈다.
 * 중급속성 · 실전속성은 함께 듣는 레벨(850)도 열리므로 레벨이 여럿이면 레벨 칸이 위에 선다.
 * 개강일부터 종강일까지만 열린다 — 스태프도 학생 모드에서는 같다 (LC 음원 · 2026-10-02 Alan "뭐든 권한이 개강일에 맞춰서").
 */
export default async function ClassMaterialsPage({ searchParams }: { searchParams: Promise<{ level?: string; subject?: string }> }) {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("materials");
  if (locked) return locked;

  const [sp, { levels, materials }, orders, mySections] = await Promise.all([searchParams, getMyClassMaterials(), getMyOrders(), getMyAccessibleSections()]);
  const header = <PageHeader icon="download" title="수업자료실" description="내 레벨의 수업 자료를 RC · LC 로 나눠 받아요." />;

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

  // 내 반의 레벨이 레벨 목록(lc_levels)에 없을 때 — 다른 레벨로 메우지 않는다
  if (levels.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState icon="download" title="내 레벨 자료가 아직 없어요" description="강사님이 내 레벨 자료를 올리면 여기에서 바로 받을 수 있어요." />
      </div>
    );
  }

  const level = levels.includes(Number(sp.level)) ? Number(sp.level) : levels[0];
  const inLevel = materials.filter((m) => m.level === level);
  const counts = Object.fromEntries(MATERIAL_SUBJECTS.map((s) => [s, inLevel.filter((m) => m.subject === s).length])) as Record<MaterialSubject, number>;
  const subject = initialSubject(sp.subject, counts);

  return (
    <div className="space-y-5">
      {header}
      <ClassMaterialsView levels={levels} level={level} subject={subject} counts={counts} list={inLevel.filter((m) => m.subject === subject)} />
    </div>
  );
}
