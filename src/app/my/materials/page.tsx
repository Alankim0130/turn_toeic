import type { Metadata } from "next";
import { studentGate } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClassMaterialsView } from "@/components/my/ClassMaterialsView";
import { formatDate } from "@/lib/utils";
import { initialSubject, type MaterialSubject } from "@/lib/class-materials";
import { getMyAccessibleSections, getMyClassMaterials, getMyOrders, getMyStudyEligibility } from "../_lib/queries";

export const metadata: Metadata = { title: "수업자료실", robots: { index: false } };

/**
 * 수업자료실 (2026-10-05 Alan — "지금 수업자료실이 없어! 수업자료실을 하나 만들어야하는데, 레벨별 구분과 RC, LC가 구분되어야해.").
 * **내가 듣는 레벨 × 과목의 자료만** 보이고(DB 가 막는다 — `private.my_subject_levels`) 그 안에서 RC · LC 로 나눈다.
 * **RC 단과 학생에게는 RC 만** (2026-10-05 Alan — "RC단과 학생들은 음원파일과 LC수업자료실에 접근 안되는거 맞지?") — LC 칸은 잠긴 채 선다.
 * 중급속성 · 실전속성은 함께 듣는 레벨(850)도 열리므로 레벨이 여럿이면 레벨 칸이 위에 선다.
 * 개강일부터 종강일까지만 열린다 — 스태프도 학생 모드에서는 같다 (LC 음원 · 2026-10-02 Alan "뭐든 권한이 개강일에 맞춰서").
 */
export default async function ClassMaterialsPage({ searchParams }: { searchParams: Promise<{ level?: string; subject?: string }> }) {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("materials");
  if (locked) return locked;

  const [sp, { access, materials }, orders, mySections] = await Promise.all([searchParams, getMyClassMaterials(), getMyOrders(), getMyAccessibleSections()]);
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

  // 내 반의 레벨을 못 읽었을 때 — 다른 레벨로 메우지 않는다
  if (access.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState icon="download" title="내 레벨 자료가 아직 없어요" description="강사님이 내 레벨 자료를 올리면 여기에서 바로 받을 수 있어요." />
      </div>
    );
  }

  // 레벨마다 내가 듣는 과목 — RC 단과면 RC 하나 (자료는 getMyClassMaterials 가 이미 그 과목으로 좁혔다)
  const here = access.find((a) => a.level === Number(sp.level)) ?? access[0];
  const inLevel = materials.filter((m) => m.level === here.level);
  const counts = Object.fromEntries(here.subjects.map((s) => [s, inLevel.filter((m) => m.subject === s).length])) as Partial<Record<MaterialSubject, number>>;
  const subject = initialSubject(sp.subject, counts, here.subjects);

  return (
    <div className="space-y-5">
      {header}
      <ClassMaterialsView
        levels={access.map((a) => a.level)}
        level={here.level}
        subjects={here.subjects}
        subject={subject}
        counts={counts}
        list={inLevel.filter((m) => m.subject === subject)}
      />
    </div>
  );
}
