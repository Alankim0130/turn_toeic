import { NOTE_TABLE, NOTE_TABLE_WRAP, alignClassName, cellClassName, runClassName, splitLines, type NoteAlign, type NoteRun, type NoteTable } from "@/lib/note-format";
import { cn } from "@/lib/utils";

/**
 * 서식 글 그리기 — 수업자료실 안내(`MaterialNote`) · 수업자료실 공지(학생 공지 페이지)가 함께 쓴다 (2026-10-05).
 * 글자는 `note-format.ts` 가 푼 조각에 **정해 둔 클래스만** 붙여 그린다 — HTML 을 그대로 넣지 않는다.
 * 줄마다 `<div>` 하나라 줄 정렬(왼쪽 · 가운데 · 오른쪽)이 줄마다 다르게 선다. 빈 줄은 `<br>` 로 높이를 지킨다.
 * 그림은 `images`(저장소 경로 → 서명 주소)에 있는 것만 그린다 — 주소를 못 만든 그림(권한 없음 · 지워짐)은 자리만 남긴다.
 * 너비는 줄 폭의 몇 % 이고 휴대폰에서도 같은 비율이다.
 * 표(2026-10-07 — 다른 블로그에서 붙여 넣은 표)는 합친 칸 · 칸 정렬 · 머리칸까지 그대로 서고, 칸 글자는 글자로만 넣는다(`NoteTableView`).
 */
export function NoteBody({
  runs,
  aligns,
  images,
  lead,
  tail,
  className,
}: {
  runs: NoteRun[];
  aligns: NoteAlign[];
  images?: Record<string, string>;
  /** 첫 줄 맨 앞에 붙일 것 (안내의 `안내` 이름표) */
  lead?: React.ReactNode;
  /** 마지막 줄 끝에 붙일 것 (접힌 안내의 `…`) */
  tail?: React.ReactNode;
  className?: string;
}) {
  const lines = splitLines(runs);
  return (
    <div className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", className)}>
      {lines.map((line, i) => (
        <div key={i} className={alignClassName(aligns[i] ?? "left")}>
          {i === 0 && lead}
          {line.length === 0 && !(i === 0 && lead) && !(i === lines.length - 1 && tail) ? <br /> : <Runs runs={line} images={images} />}
          {i === lines.length - 1 && tail}
        </div>
      ))}
    </div>
  );
}

/** 서식 조각 — 서식이 없는 조각은 글자 그대로 */
export function Runs({ runs, images }: { runs: NoteRun[]; images?: Record<string, string> }) {
  return runs.map((r, i) => {
    if (r.style.table) return <NoteTableView key={i} table={r.style.table} />;
    const img = r.style.img;
    if (img) {
      const src = images?.[img.path];
      return src ? (
        // 저장소 서명 주소라 next/image 최적화(외부 도메인 과금)를 태우지 않는다 — 수강후기 캡쳐와 같은 규칙
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={src} alt="" loading="lazy" style={{ width: `${img.w}%` }} className="inline-block h-auto max-w-full rounded-lg align-middle" />
      ) : (
        <span key={i} className="inline-block rounded-lg bg-line px-2 py-1 text-xs text-mist" style={{ width: `${img.w}%` }}>
          그림을 불러오지 못했어요
        </span>
      );
    }
    const cls = runClassName(r.style);
    return cls ? (
      <span key={i} className={cls}>
        {r.text}
      </span>
    ) : (
      r.text
    );
  });
}

/** 안내 · 공지 속 표 — 칸이 모자라면 표만 옆으로 민다 (화면 전체가 밀리지 않게) */
export function NoteTableView({ table }: { table: NoteTable }) {
  return (
    <div className={NOTE_TABLE_WRAP}>
      <table className={NOTE_TABLE}>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => {
                const Cell = cell.head ? "th" : "td";
                return (
                  <Cell key={j} rowSpan={cell.rowspan} colSpan={cell.colspan} className={cellClassName(cell)}>
                    {cell.text}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
