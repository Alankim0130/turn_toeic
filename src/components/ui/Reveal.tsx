"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 스크롤로 화면에 들어올 때 페이드업. delay 는 ms */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
  once?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 관찰을 못 하면 그냥 보여 준다 — .reveal 은 opacity:0 이라 안 켜 주면 화면이 빈 채로 남는다
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("is-visible");
            if (once) io.unobserve(el);
          } else if (!once) {
            el.classList.remove("is-visible");
          }
        }
      },
      /**
       * **threshold 를 올리지 말 것** (2026-09-16, 실제로 화면이 빈 사고가 났다).
       * threshold 는 "대상의 몇 %가 보이나" 다. 화면보다 긴 카드는 아무리 스크롤해도
       * 그 비율에 닿지 못한다 — 화면 700px 에서 4000px 짜리 카드는 최대 16%, 5000px 면 12% 라
       * threshold 0.15 로는 **영원히 안 나타난다.** 내 시간표가 딱 그렇게 길어져서 통째로 사라졌다.
       * 0 이면 한 픽셀이라도 걸치는 순간 켜지므로 길이와 무관하게 안전하다.
       * 등장 시점은 rootMargin(아래에서 8% 올라온 선)이 정한다.
       */
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return (
    <Tag ref={ref} className={cn("reveal", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}
