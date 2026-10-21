import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 이 구역 안에서 화면을 옮길 때 누르는 순간 보이는 빈 화면 틀 (2026-10-09 화면 전환 속도 — `PageSkeleton` 머리말) */
export default function Loading() {
  return <PageSkeleton />;
}
