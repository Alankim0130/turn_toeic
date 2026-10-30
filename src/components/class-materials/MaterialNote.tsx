import { noteView } from "@/lib/class-materials";
import { runsLength, sliceRuns } from "@/lib/note-format";
import { linkRuns } from "@/lib/note-links";
import { NoteBody } from "@/components/note/NoteBody";
import { cn } from "@/lib/utils";
import { FoldButton } from "./FoldButton";

/**
 * 수업자료실 자료의 안내 · 스크립트 — 학생 수업자료실과 관리자 자료 줄이 함께 쓴다
 * (2026-10-05 Alan — "여기 안내에 스크립트를 올려줄예정이야. 그래서 글을 쫌 길게 적을 수 있어야해").
 *
 * - **짧은 안내는 예전처럼 늘 펼쳐 둔다** ("수업 전에 출력해 오세요" 를 접어 두면 아무도 안 연다).
 * - **길면(스크립트) 앞 네 줄만 보이고 `전체 보기` 로 편다** (`notePreview`) — 다 펴 두면 자료 하나가 화면 몇 장을 먹어
 *   다음 회차 자료가 한참 아래로 밀린다.
 * - **표가 들어 있으면 짧아도 접고, 앞부분은 표 앞에서 끊는다** (2026-10-30 — 강사님 "표가 있는경우는 접어서 보기를 해도 접히지가 않아서
 *   파일올린거를 한눈에 보기가 좀 힘든데"). `전체 보기` 옆에 `표 1개` 를 적어 펼치면 표가 있다는 것을 알린다 (학생 · 관리자 모두).
 * - 접기는 `<details>` 라 펼치는 데 자바스크립트가 없다 — 서버 컴포넌트(학생 화면) · 클라이언트 컴포넌트(관리자 줄) 어디서든 쓴다.
 *   펼친 글 끝의 `접기`(`FoldButton`)만 클라이언트다 — 긴 스크립트를 다 읽고 위의 `접기` 까지 거슬러 올라가지 않게.
 * - 줄바꿈은 적은 그대로다 — 스크립트의 화자 줄(M: · W:)이 한 덩어리로 뭉개지지 않게. 줄마다 정렬이 다를 수 있다.
 * - **글자 서식 · 줄 정렬**은 `note-format.ts` 가 풀고 `NoteBody` 가 정해 둔 클래스만 붙여 그린다 — HTML 을 그대로 넣지 않는다.
 *   접을지 · 글자 수는 태그를 빼고 보이는 글자로 센다.
 * - `showCount` — 관리자 줄에서 접힌 글이 몇 자인지 (붙여 넣은 스크립트가 다 들어갔는지 볼 수 있게). 학생에게는 적지 않는다.
 * - `linkify` — 글 속 주소(`https://` · `www.`)를 누르면 새 창으로 간다 (2026-10-16 Alan — 특강 안내. `note-links.ts`). 지금은 학생 특강 카드만 켠다.
 *   주소는 **글 전체에서** 찾은 뒤 앞부분을 자른다 — 접힌 앞부분 끝에서 주소가 잘려도 링크는 온전한 주소로 간다.
 *   접힌 앞부분의 링크는 `<summary>` 안에 있지만 누르면 링크만 열리고 접기는 그대로다 (링크가 먼저 눌린다 — HTML 의 누름 규칙).
 */
export function MaterialNote({ note, className, showCount = false, linkify = false }: { note: string; className?: string; showCount?: boolean; linkify?: boolean }) {
  const view = noteView(note);
  const { folded, aligns, chars } = view;
  const extras = [view.tables > 0 && `표 ${view.tables}개`, view.images > 0 && `사진 ${view.images}장`, showCount && `${chars.toLocaleString("ko-KR")}자`].filter(Boolean);
  const full = linkify ? linkRuns(view.full) : view.full;
  const preview = !linkify ? view.preview : folded ? sliceRuns(full, runsLength(view.preview)) : full;
  const box = cn("rounded-xl px-3 py-2 text-sm leading-relaxed text-ink-soft", className);
  const label = <span className="mr-1.5 text-xs font-black text-brand-700">안내</span>;

  if (!folded) return <NoteBody runs={preview} aligns={aligns} lead={label} className={box} />;

  return (
    <details className={cn("group", box)}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <NoteBody runs={preview} aligns={aligns} lead={label} tail="…" className="group-open:hidden" />
        <span className="hidden group-open:inline">{label}</span>
        <span className="mt-1.5 flex w-fit items-center gap-1 text-xs font-bold text-brand-700 group-open:mt-0 group-open:inline-flex">
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-none stroke-current stroke-[3] transition group-open:rotate-180">
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="group-open:hidden">
            전체 보기{extras.map((x) => ` · ${x}`).join("")}
          </span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>
      <NoteBody runs={full} aligns={aligns} className="mt-1.5" />
      <FoldButton />
    </details>
  );
}
