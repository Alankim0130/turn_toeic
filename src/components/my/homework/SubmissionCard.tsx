import { Icon } from "@/components/ui/Icon";
import { cn, formatDate } from "@/lib/utils";
import { classDayLabel, HOMEWORK_STATUS_LABEL, homeworkLabel } from "@/lib/homework";
import { isImageType } from "@/lib/upload";
import { DeleteSubmissionButton } from "./DeleteSubmissionButton";

export type SubmissionLite = {
  id: number;
  level: number | null;
  subject: string | null;
  /** 어느 수업일의 숙제인지 (달력에서 고른 날). 달력 이전에 낸 옛 제출은 비어 있다 */
  class_date?: string | null;
  question: string | null;
  /** 강사 코멘트 · 질문 답변 (점검완료와 함께 온다) */
  feedback?: string | null;
  status: string;
  created_at: string;
  checked_at: string | null;
  homework_files: { id: number; file_name: string; content_type: string | null; created_at: string }[];
};

/** 내 제출 1건. 점검 전에는 취소할 수 있다 */
export function SubmissionCard({ submission: s, highlight = false }: { submission: SubmissionLite; highlight?: boolean }) {
  const checked = s.status === "checked";
  const files = [...(s.homework_files ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);

  return (
    <article className={cn("card p-4 sm:p-5", checked && "border-brand-200", highlight && "ring-2 ring-brand-300")}>
      <div className="flex flex-wrap items-center gap-2">
        {s.level != null && s.subject && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-black text-white">{homeworkLabel(s.level, s.subject)}</span>}
        {s.class_date && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-black text-brand-700">{classDayLabel(s.class_date)} 수업</span>}
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-black", checked ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-700")}>
          {HOMEWORK_STATUS_LABEL[s.status] ?? s.status}
        </span>
        <span className="ml-auto text-xs text-mist">
          {formatDate(s.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 제출 · 사진 {files.length}장
        </span>
      </div>

      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {files.map((f, i) => (
            <li key={f.id}>
              <a
                href={`/files/homework/${f.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-line bg-surface"
                title={`${f.file_name} 크게 보기`}
              >
                {isImageType(f.content_type) ? (
                  // 비공개 서명 URL 로 리다이렉트되는 썸네일이라 next/image 최적화를 쓰지 않는다
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/files/homework/${f.id}?w=300`} alt={`제출한 사진 ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="camera" size={28} />
                )}
              </a>
            </li>
          ))}
        </ul>
      )}

      {s.question && (
        <div className="mt-3 rounded-xl bg-surface px-3 py-2 text-sm">
          <p className="text-xs font-bold text-brand-700">질문</p>
          <p className="whitespace-pre-line text-ink-soft">{s.question}</p>
        </div>
      )}

      {/* 강사 코멘트 — 질문 답변이거나 그냥 하는 말. 점검완료와 함께 알림함으로도 간다 */}
      {s.feedback && (
        <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm">
          <p className="flex items-center gap-1 text-xs font-bold text-brand-700">
            <Icon name="lc" size={14} />
            강사 코멘트
          </p>
          <p className="whitespace-pre-line text-ink">{s.feedback}</p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        {checked ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
            <Icon name="success" size={18} />
            {s.checked_at ? `${formatDate(s.checked_at, { month: "numeric", day: "numeric" })} 강사 점검 완료` : "강사 점검 완료"}
          </p>
        ) : (
          <>
            <p className="text-xs text-mist">강사가 확인하면 점검완료로 바뀌어요.</p>
            <DeleteSubmissionButton id={s.id} />
          </>
        )}
      </div>
    </article>
  );
}
