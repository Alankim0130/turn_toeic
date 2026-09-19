import { studentGate } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * 숙제업로드의 공통 틀. 2026-09-19 Alan 요청으로 **레벨 → 과목 → 사진 3단계를 없애고**
 * 달력 한 화면으로 바꿨다 (`HomeworkCalendar`) — 단계 표시(StepHeader)·전환(template.tsx)도 함께 지웠다.
 * **3단계로 되돌리지 말 것.**
 */
export default async function HomeworkLayout({ children }: { children: React.ReactNode }) {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("homework");
  if (locked) return locked;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="homework"
        title="숙제업로드"
        description="정규 수업 숙제예요. 달력에서 수업 날짜를 고르고 RC·LC 풀이 사진을 올리면, 강사가 확인해 코멘트와 함께 점검완료 알림을 보내 줍니다."
      />
      {children}
    </div>
  );
}
