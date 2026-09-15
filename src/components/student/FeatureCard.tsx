import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { StudentAccess } from "@/lib/auth";
import { canUseFeature, type StudentFeature } from "@/lib/site";
import { cn } from "@/lib/utils";
import { lockedHint } from "./unlock";

/** 수강생전용 소개 페이지의 기능 카드. 이용 가능하면 링크, 아니면 잠금 표시 */
export function FeatureCard({ feature, access }: { feature: StudentFeature; access: StudentAccess }) {
  const usable = canUseFeature(feature, access);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100">
          <Icon name={feature.icon} size={36} />
          {!usable && (
            <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-paper shadow-soft ring-1 ring-line">
              <Icon name="lock" size={18} />
            </span>
          )}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
            usable ? "bg-brand-500 text-white" : "bg-ink text-white",
          )}
        >
          {usable ? "이용 가능" : "수강생 전용"}
        </span>
      </div>
      <h2 className="mt-4 text-xl font-black text-ink">{feature.label}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate">{feature.desc}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
        {feature.points.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <Icon name="success" size={16} className="mt-0.5" />
            {p}
          </li>
        ))}
      </ul>
    </>
  );

  if (usable) {
    return (
      <Link href={feature.href} className="card group flex h-full flex-col p-6 transition duration-300 hover:-translate-y-1 hover:shadow-pink">
        {body}
        <span className="mt-auto pt-5 text-sm font-bold text-brand-600 group-hover:underline">바로가기 →</span>
      </Link>
    );
  }

  return (
    <article className="card relative flex h-full flex-col overflow-hidden p-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-brand-50 to-transparent" />
      <div className="relative">{body}</div>
      <div className="relative mt-auto space-y-2 pt-5">
        <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Icon name="lock" size={16} />
          {lockedHint(access)}
        </p>
        {feature.key === "study" && (
          <Link href="/study" className="inline-flex text-sm font-bold text-brand-600 hover:underline">
            이번 달 스터디 일정 보기 →
          </Link>
        )}
      </div>
    </article>
  );
}
