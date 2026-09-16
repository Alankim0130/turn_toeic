"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// 마지막으로 본 단계 깊이. 모듈 변수라 클라이언트 내비게이션 사이에 살아남는다 (새로고침이면 0 → 앞으로)
let lastDepth = 0;
const depthOf = (pathname: string) => pathname.split("/").filter(Boolean).length;

/** 앞 단계로 가면 오른쪽에서, 돌아가면 왼쪽에서 밀려 들어온다. template.tsx 가 매 이동마다 새로 마운트한다 */
export function StepTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [dir] = useState<"forward" | "back">(() => {
    if (typeof window === "undefined") return "forward"; // 서버 렌더는 요청끼리 모듈 변수를 공유하므로 보지 않는다
    return lastDepth && depthOf(pathname) < lastDepth ? "back" : "forward";
  });
  useEffect(() => {
    lastDepth = depthOf(pathname);
  }, [pathname]);

  return <div className={dir === "back" ? "animate-step-back" : "animate-step-in"}>{children}</div>;
}
