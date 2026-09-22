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

/**
 * 내 제출 1건 — **길쭉한 카드 한 장에 `제출함` 한 줄** (2026-09-22 Alan 요청: "학생이 숙제제출을 눌렀을때
 * 사진이 다 오픈되어있는데, 길쭉한 카드모양에 제출함 이렇게 간단하게 나오고, 강사가 확인했다면
 * **강사 점검 완료! 수고하셨습니다!** 이렇게 글자가 남아있으면 좋겠어").
 *
 * 그전에는 사진 썸네일이 카드마다 **전부 펼쳐져** 있어 한 화면에 한두 건밖에 안 들어왔다 — 학생이
 * 확인하고 싶은 것은 "냈나 / 봐 주셨나" 두 가지인데 그 답이 사진 더미에 묻혔다.
 *
 * **지킬 것**
 * - 사진은 **접어 두되 없애지 않는다** — 내가 무엇을 냈는지 되볼 길은 여기뿐이다.
 *   `<details>` 라 자바스크립트 없이 열리고 이 카드는 서버 컴포넌트로 남는다.
 * - **질문과 강사 코멘트는 접지 않는다** — 강사가 답을 적어 준 자리라 접으면 읽히지 않는다.
 * - 상태 문구는 `HOMEWORK_STATUS_LABEL`(`src/lib/homework.ts`) 한곳이다. 점검 상태를 **배지로 또 적지 않는다** —
 *   같은 말이 한 카드에 두 번 나온다.
 */
export function SubmissionCard({ submission: s, highlight = false }: { submission: SubmissionLite; highlight?: boolean }) {
  const checked = s.status === "checked";
  const files = [...(s.homework_files ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);

  return (
    <article className={cn("card p-3.5 sm:p-4", checked && "border-brand-200 bg-brand-50/30", highlight && "ring-2 ring-brand-300")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {s.level != null && s.subject && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-black text-white">{homeworkLabel(s.level, s.subject)}</span>}
        {s.class_date && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-black text-brand-700">{classDayLabel(s.class_date)} 수업</span>}
        <span className="ml-auto text-xs text-mist">{formatDate(s.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 제출</span>
      </div>

      {/* 학생이 보려는 답 한 줄 — 냈나 · 봐 주셨나 */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className={cn("flex min-w-0 items-center gap-1.5 text-sm font-black", checked ? "text-brand-700" : "text-ink")}>
          {/* 점검이 끝났을 때만 체크 — 흐린 체크를 미리 보여 주면 "봐 주신 건가" 가 헷갈린다 */}
          {checked && <Icon name="success" size={18} />}
          <span className="min-w-0">
            {HOMEWORK_STATUS_LABEL[s.status] ?? s.status}
            {checked && s.checked_at && <span className="ml-1.5 font-semibold text-mist">{formatDate(s.checked_at, { month: "numeric", day: "numeric" })}</span>}
          </span>
        </p>
        {/* 점검 전에만 취소할 수 있다 — 점검이 끝난 제출은 손대지 않는다 */}
        {!checked && <DeleteSubmissionButton id={s.id} />}
      </div>
      {!checked && <p className="mt-1 text-xs text-mist">강사가 확인하면 알림으로 알려드려요.</p>}

      {s.question && (
        <div className="mt-3 rounded-xl bg-surface px-3 py-2 text-sm">
          <p className="text-xs font-bold text-brand-700">내 질문</p>
          <p className="whitespace-pre-line text-ink-soft">{s.question}</p>
        </div>
      )}

      {/* 강사 코멘트 — 질문 답변이거나 그냥 하는 말. 점검완료와 함께 알림함으로도 간다 */}
      {s.feedback && (
        <div className="mt-3 rounded-xl border border-brand-200 bg-paper px-3 py-2 text-sm">
          <p className="flex items-center gap-1 text-xs font-bold text-brand-700">
            <Icon name="lc" size={14} />
            강사 코멘트
          </p>
          <p className="whitespace-pre-line text-ink">{s.feedback}</p>
        </div>
      )}

      {files.length > 0 && (
        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-bold text-slate transition hover:text-brand-600">
            <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-none stroke-current stroke-[3] transition group-open:rotate-90">
              <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            내가 올린 사진 {files.length}장 보기
          </summary>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
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
        </details>
      )}
    </article>
  );
}
