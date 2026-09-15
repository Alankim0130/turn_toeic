import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { HomeworkCard } from "@/components/my/HomeworkCard";
import { requireUser } from "@/lib/auth";
import { getMyHomework, getMyStudyMaterials, getMyStudySignups } from "../_lib/queries";

export const metadata: Metadata = {
  title: "숙제제출",
  robots: { index: false },
};

export default async function HomeworkPage() {
  const [{ user }, materials, homework, signups] = await Promise.all([requireUser("/my/homework"), getMyStudyMaterials(), getMyHomework(), getMyStudySignups()]);
  const submissionByMaterial = new Map(homework.map((h) => [h.material_id, h]));
  const hasOnline = signups.some((s) => s.study?.kind === "online");

  const header = (
    <PageHeader
      icon="homework"
      title="숙제제출"
      description="비대면스터디 자료를 풀고, 풀이 사진이나 PDF를 날짜별로 올려 주세요. 강사가 확인하면 점검완료로 바뀌어요."
    />
  );

  if (materials.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        {hasOnline ? (
          <EmptyState icon="homework" title="아직 열린 자료가 없어요" description="수업일마다 그날 자료가 열리면 여기에서 숙제를 제출할 수 있어요." action={{ href: "/my/study", label: "내 스터디 보기" }} />
        ) : (
          <EmptyState icon="homework" title="비대면스터디를 신청하면 숙제를 낼 수 있어요" description="자료를 받아 풀고, 풀이를 올리면 강사가 점검해 드려요." action={{ href: "/study", label: "스터디 신청하러 가기" }} />
        )}
      </div>
    );
  }

  const pending = materials.filter((m) => !submissionByMaterial.has(m.id)).length;

  return (
    <div className="space-y-6">
      {header}
      <p className="text-sm text-slate">
        열린 자료 <strong className="text-ink">{materials.length}개</strong> · 미제출 <strong className={pending ? "text-brand-600" : "text-ink"}>{pending}개</strong>
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {materials.map((m) => {
          const sub = submissionByMaterial.get(m.id);
          return (
            <HomeworkCard
              key={m.id}
              userId={user.id}
              material={{ id: m.id, date: m.date, title: m.title, file_name: m.file_name }}
              submission={sub ? { id: sub.id, status: sub.status, created_at: sub.created_at, checked_at: sub.checked_at, files: sub.homework_files ?? [] } : null}
            />
          );
        })}
      </div>
      <p className="text-xs text-mist">사진은 글씨가 잘 보이게 찍어 주세요. 한 숙제에 파일 20개까지, 파일당 20MB 이하로 올릴 수 있어요. 점검이 끝나면 바꿀 수 없어요.</p>
    </div>
  );
}
