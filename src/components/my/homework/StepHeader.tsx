"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { isSubject, SUBJECT_LABEL } from "@/lib/homework";

const STEPS = ["레벨", "과목", "사진"] as const;

/** 1 레벨 → 2 과목 → 3 사진. 주소에서 단계를 읽으므로 layout 에 두면 이동해도 그대로 남아 진행 막대가 이어서 움직인다 */
export function StepHeader() {
  const pathname = usePathname();
  const done = !!useSearchParams().get("done");
  const [level, subject] = pathname.replace(/^\/my\/homework\/?/, "").split("/").filter(Boolean);
  const step = done ? 4 : subject ? 3 : level ? 2 : 1;
  const chosen = [level ?? null, subject && isSubject(subject) ? SUBJECT_LABEL[subject] : null, null];
  const hrefs = ["/my/homework", level ? `/my/homework/${level}` : "/my/homework", level && subject ? `/my/homework/${level}/${subject}` : "/my/homework"];

  return (
    <nav aria-label="진행 단계" className="card p-4">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          const inner = (
            <>
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black transition",
                  state === "done" ? "bg-brand-500 text-white" : state === "current" ? "bg-ink text-white ring-4 ring-brand-100" : "bg-line text-mist",
                )}
              >
                {state === "done" ? <Icon name="success" size={16} className="brightness-0 invert" /> : n}
              </span>
              <span className={cn("min-w-0 truncate text-sm", state === "todo" ? "text-mist" : "font-bold text-ink")}>
                {label}
                {chosen[i] && <span className="text-brand-600"> · {chosen[i]}</span>}
              </span>
            </>
          );
          return (
            <li key={label} aria-current={state === "current" ? "step" : undefined}>
              {state === "done" ? (
                <Link href={hrefs[i]} className="flex items-center gap-2 rounded-lg hover:text-brand-600" title="이 단계로 돌아가기">
                  {inner}
                </Link>
              ) : (
                <span className="flex items-center gap-2">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-100" aria-hidden>
        <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-out" style={{ width: `${(Math.min(step, 3) / 3) * 100}%` }} />
      </div>
      {step > 1 && step < 4 && (
        <Link href={hrefs[step - 2]} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-slate hover:text-brand-600">
          ← 이전 단계로
        </Link>
      )}
    </nav>
  );
}
