import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { HomeworkUploadForm } from "@/components/my/homework/HomeworkUploadForm";
import { SubmissionCard } from "@/components/my/homework/SubmissionCard";
import { requireUser } from "@/lib/auth";
import { homeworkLabel, isSubject } from "@/lib/homework";
import { getHomeworkLevels, getMyHomework } from "../../../_lib/queries";

export const metadata: Metadata = {
  title: "숙제업로드 · 사진 올리기",
  robots: { index: false },
};

/** 3단계: 사진 올리기 (+ 제출 직후 완료 화면, 이 레벨·과목의 내 제출 내역) */
export default async function HomeworkUploadStep({
  params,
  searchParams,
}: {
  params: Promise<{ level: string; subject: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ level: raw, subject }, sp] = await Promise.all([params, searchParams]);
  const level = Number(raw);
  if (!Number.isInteger(level) || !isSubject(subject)) notFound();

  const [levels, { user }] = await Promise.all([getHomeworkLevels(), requireUser(`/my/homework/${raw}/${subject}`)]);
  if (!levels.includes(level)) notFound();

  const mine = await getMyHomework({ level, subject });
  const doneId = Number(sp.done);
  const done = Number.isInteger(doneId) ? mine.find((s) => s.id === doneId) : undefined;
  const others = done ? mine.filter((s) => s.id !== done.id) : mine;
  const label = homeworkLabel(level, subject);

  return (
    <div className="space-y-8">
      {done ? (
        <section aria-labelledby="done-title" className="card flex flex-col items-center gap-3 bg-brand-50/60 px-5 py-8 text-center">
          <span className="animate-pop">
            <Icon name="success" size={64} />
          </span>
          <h2 id="done-title" className="text-xl font-black text-ink">숙제를 제출했어요</h2>
          <p className="text-sm text-slate">
            {label} · 사진 {done.homework_files.length}장{done.question ? " · 질문 포함" : ""}. 강사가 확인하면 점검완료로 바뀝니다.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href={`/my/homework/${level}/${subject}`} className="btn-primary">
              같은 과목 더 올리기
            </Link>
            <Link href="/my/homework" className="btn-secondary">
              처음으로
            </Link>
          </div>
        </section>
      ) : (
        <section aria-labelledby="step3-title" className="space-y-4">
          <h2 id="step3-title" className="text-xl font-black text-ink">
            <span className="text-brand-600">{label}</span> 풀이 사진 올리기
          </h2>
          <HomeworkUploadForm userId={user.id} level={level} subject={subject} />
        </section>
      )}

      {(done || others.length > 0) && (
        <section aria-labelledby="mine-title">
          <h2 id="mine-title" className="mb-3 text-lg font-black text-ink">{label} 내 제출 내역</h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {done && (
              <li>
                <SubmissionCard submission={done} highlight />
              </li>
            )}
            {others.map((s) => (
              <li key={s.id}>
                <SubmissionCard submission={s} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
