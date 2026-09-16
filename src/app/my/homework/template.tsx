import { StepTransition } from "@/components/my/homework/StepTransition";

/** template 은 이동할 때마다 새로 마운트되므로 단계가 바뀔 때마다 들어오는 애니메이션이 다시 재생된다 */
export default function HomeworkTemplate({ children }: { children: React.ReactNode }) {
  return <StepTransition>{children}</StepTransition>;
}
