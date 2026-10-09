import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 이 구역 안에서 화면을 옮길 때 누르는 순간 보이는 빈 화면 틀 (2026-10-09 화면 전환 속도 — `PageSkeleton` 머리말). 공개 페이지는 레이아웃에 여백이 없어 여기서 둔다 */
export default function Loading() {
  return (
    <div className="container-x py-10">
      <PageSkeleton />
    </div>
  );
}
