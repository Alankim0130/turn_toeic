import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import type { StudentAccess } from "@/lib/auth";
import { STUDENT_HUB, type StudentFeature } from "@/lib/site";
import { lockedHeadline, UnlockActions } from "./unlock";

/** 수강생이 아닌 회원이 수강생전용 페이지에 들어왔을 때 보여주는 안내 */
export function LockedFeature({ feature, access }: { feature: StudentFeature; access: StudentAccess }) {
  return (
    <div className="space-y-6">
      <PageHeader icon={feature.icon as IconName} title={feature.label} description={feature.summary} />

      <section className="card relative overflow-hidden p-6 sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-100 blur-3xl animate-blob" />
        <div className="relative grid items-center gap-8 md:grid-cols-[auto_1fr]">
          <div className="relative mx-auto h-32 w-32">
            <span className="flex h-32 w-32 items-center justify-center rounded-3xl bg-brand-50 ring-1 ring-brand-100 animate-float-slow">
              <Icon name={feature.icon} size={76} />
            </span>
            <span className="absolute -bottom-3 -right-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-paper shadow-soft ring-1 ring-line">
              <Icon name="lock" size={34} />
            </span>
          </div>

          <div>
            <p className="chip">
              <Icon name="exclusive" size={16} />
              {STUDENT_HUB.label}
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-ink sm:text-3xl">{lockedHeadline(access)}</h2>
            <p className="mt-3 leading-relaxed text-slate">{feature.desc}</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              {feature.points.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Icon name="success" size={18} className="mt-0.5" />
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-2">
              <UnlockActions access={access} feature={feature} />
              <Link href={STUDENT_HUB.href} className="btn-ghost">
                수강생전용 전체 보기
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
