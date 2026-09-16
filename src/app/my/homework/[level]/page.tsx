import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { HOMEWORK_SUBJECTS, SUBJECT_DESC, SUBJECT_FULL, SUBJECT_ICON, SUBJECT_LABEL } from "@/lib/homework";
import { getHomeworkLevels } from "../../_lib/queries";

export const metadata: Metadata = {
  title: "숙제업로드 · 과목 고르기",
  robots: { index: false },
};

/** 2단계: RC / LC 고르기 */
export default async function HomeworkSubjectStep({ params }: { params: Promise<{ level: string }> }) {
  const { level: raw } = await params;
  const level = Number(raw);
  const levels = await getHomeworkLevels();
  if (!Number.isInteger(level) || !levels.includes(level)) notFound();

  return (
    <section aria-labelledby="step2-title" className="space-y-4">
      <h2 id="step2-title" className="text-xl font-black text-ink">
        <span className="text-brand-600">{level}</span>점 목표반 · 어떤 숙제인가요?
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {HOMEWORK_SUBJECTS.map((s, i) => (
          <li key={s} className="animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
            <Link
              href={`/my/homework/${level}/${s}`}
              className="card group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pink active:scale-[0.98]"
            >
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100 transition group-hover:bg-brand-100">
                <Icon name={SUBJECT_ICON[s]} size={40} />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-black text-ink transition group-hover:text-brand-600">{SUBJECT_LABEL[s]}</span>
                <span className="block text-sm font-semibold text-slate">{SUBJECT_FULL[s]}</span>
                <span className="block text-xs text-mist">{SUBJECT_DESC[s]}</span>
              </span>
              <span aria-hidden className="ml-auto text-xl font-black text-mist transition group-hover:translate-x-1 group-hover:text-brand-500">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
