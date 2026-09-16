import { Suspense } from "react";
import { studentGate } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepHeader } from "@/components/my/homework/StepHeader";

/**
 * 숙제업로드 3단계(레벨 → 과목 → 사진)의 공통 틀.
 * 단계 표시는 주소에서 읽으므로 layout 에 두면 페이지가 바뀌어도 그대로 남아 진행 막대가 이어서 움직인다.
 * 페이지 전환 애니메이션은 template.tsx 가 맡는다.
 */
export default async function HomeworkLayout({ children }: { children: React.ReactNode }) {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("homework");
  if (locked) return locked;

  return (
    <div className="space-y-6">
      <PageHeader icon="homework" title="숙제업로드" description="레벨 → 과목 → 사진 순서로 올려요. 강사가 확인하면 점검완료로 바뀝니다." />
      <Suspense fallback={null}>
        <StepHeader />
      </Suspense>
      {children}
    </div>
  );
}
