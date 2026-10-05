import { notePreview } from "@/lib/class-materials";
import { cn } from "@/lib/utils";
import { FoldButton } from "./FoldButton";

/**
 * 수업자료실 자료의 안내 · 스크립트 — 학생 수업자료실과 관리자 자료 줄이 함께 쓴다
 * (2026-10-05 Alan — "여기 안내에 스크립트를 올려줄예정이야. 그래서 글을 쫌 길게 적을 수 있어야해").
 *
 * - **짧은 안내는 예전처럼 늘 펼쳐 둔다** ("수업 전에 출력해 오세요" 를 접어 두면 아무도 안 연다).
 * - **길면(스크립트) 앞 네 줄만 보이고 `전체 보기` 로 편다** (`notePreview`) — 다 펴 두면 자료 하나가 화면 몇 장을 먹어
 *   다음 회차 자료가 한참 아래로 밀린다.
 * - 접기는 `<details>` 라 펼치는 데 자바스크립트가 없다 — 서버 컴포넌트(학생 화면) · 클라이언트 컴포넌트(관리자 줄) 어디서든 쓴다.
 *   펼친 글 끝의 `접기`(`FoldButton`)만 클라이언트다 — 긴 스크립트를 다 읽고 위의 `접기` 까지 거슬러 올라가지 않게.
 * - 줄바꿈은 적은 그대로다(`whitespace-pre-wrap`) — 스크립트의 화자 줄(M: · W:)이 한 덩어리로 뭉개지지 않게.
 * - `showCount` — 관리자 줄에서 접힌 글이 몇 자인지 (붙여 넣은 스크립트가 다 들어갔는지 볼 수 있게). 학생에게는 적지 않는다.
 */
export function MaterialNote({ note, className, showCount = false }: { note: string; className?: string; showCount?: boolean }) {
  const { folded, preview, chars } = notePreview(note);
  const box = cn("rounded-xl px-3 py-2 text-sm leading-relaxed text-ink-soft [overflow-wrap:anywhere]", className);
  const label = <span className="mr-1.5 text-xs font-black text-brand-700">안내</span>;

  if (!folded)
    return (
      <p className={cn("whitespace-pre-wrap", box)}>
        {label}
        {preview}
      </p>
    );

  return (
    <details className={cn("group", box)}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {label}
        <span className="whitespace-pre-wrap group-open:hidden">{preview}…</span>
        <span className="mt-1.5 flex w-fit items-center gap-1 text-xs font-bold text-brand-700 group-open:mt-0 group-open:inline-flex">
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-none stroke-current stroke-[3] transition group-open:rotate-180">
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="group-open:hidden">
            전체 보기{showCount && <> · {chars.toLocaleString("ko-KR")}자</>}
          </span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>
      <p className="mt-1.5 whitespace-pre-wrap">{note.trim()}</p>
      <FoldButton />
    </details>
  );
}
