import { HandoverCheck } from "./HandoverCheck";
import { HandoverInline } from "./HandoverInline";
import { handoverProgress, plainText, type HandoverBlock, type HandoverDoc, type HandoverProgress } from "@/lib/handover";
import { cn, formatDate } from "@/lib/utils";

export type HandoverCheckRow = { item: string; checked_name: string | null; checked_at: string };

/** 짧은 칸(번호 · 이름 · 짧은 값)은 접지 않는다 — 표는 카드 안에서 옆으로 밀리므로 `1` / `0` 처럼 쪼개질 까닭이 없다 */
const short = (cell: string) => plainText(cell).length <= 12;

const doneAt = (iso: string) => formatDate(iso, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * 인수인계 체크리스트 본문 (2026-10-04) — 맨 위 진행 카드 + docs/HANDOVER.md 의 블록들. 데이터는 화면(`/admin/handover`)이 읽어 넘긴다.
 * 표는 카드 안에서만 옆으로 밀린다(페이지가 넘치지 않게). 체크 칸은 테스트 등급이거나 체크를 못 읽었으면 잠근다.
 */
export function HandoverView({
  doc,
  checks,
  testing,
  loadError,
}: {
  doc: HandoverDoc;
  checks: Map<string, HandoverCheckRow>;
  testing: boolean;
  loadError: boolean;
}) {
  const canCheck = !testing && !loadError;
  const progress = handoverProgress(doc, new Set(checks.keys()));
  return (
    <>
      <Progress progress={progress} testing={testing} loadError={loadError} />
      <article aria-label={doc.title} className="max-w-3xl">
        {doc.blocks.map((b, i) => (b.kind === "heading" && b.level === 1 ? null : <Block key={i} block={b} checks={checks} canCheck={canCheck} progress={progress} />))}
      </article>
    </>
  );
}

function Progress({ progress, testing, loadError }: { progress: HandoverProgress; testing: boolean; loadError: boolean }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <section aria-labelledby="handover-progress" className="card mb-8 max-w-3xl p-5">
      <div className="flex items-end justify-between gap-3">
        <h2 id="handover-progress" className="text-sm font-bold text-slate">
          끝낸 항목
        </h2>
        <p className="text-2xl font-black tabular-nums text-ink">
          {progress.done}
          <span className="text-base font-bold text-mist"> / {progress.total}</span>
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="끝낸 항목"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-brand-100"
      >
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>

      <ol aria-label="단계별" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {progress.stages.map((s) => {
          const complete = s.keys.length > 0 && s.done === s.keys.length;
          return (
            <li key={s.id} className="min-w-0">
              <a
                href={`#${s.id}`}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition",
                  complete ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line bg-paper text-ink hover:border-brand-200",
                )}
              >
                <span className="min-w-0 truncate">
                  {s.stage} · {s.label}
                </span>
                <span className="shrink-0 tabular-nums">
                  {s.done}/{s.keys.length}
                </span>
              </a>
            </li>
          );
        })}
      </ol>

      {testing && (
        <p className="mt-4 rounded-xl border border-line bg-surface p-3 text-sm text-slate">
          테스트 등급으로 보는 중이라 <b className="text-ink">체크</b>를 볼 수 없어요 — 테스트를 끝내면 보여요.
        </p>
      )}
      {loadError && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate">체크를 불러오지 못했어요 — 잠시 뒤 새로고침해 주세요.</p>}
      <p className="mt-4 text-xs leading-relaxed text-mist">
        체크는 강사 · 관리자 모두에게 같이 보여요. 내용은 저장소의 <code className="font-mono">docs/HANDOVER.md</code> 이고, 그 파일을 고치면 이 화면도 바뀌어요.
      </p>
    </section>
  );
}

function Block({ block, checks, canCheck, progress }: { block: HandoverBlock; checks: Map<string, HandoverCheckRow>; canCheck: boolean; progress: HandoverProgress }) {
  switch (block.kind) {
    case "heading": {
      if (block.level === 3) {
        return (
          <h3 id={block.id} className="mt-8 scroll-mt-24 text-base font-black text-ink">
            <HandoverInline text={block.text} />
          </h3>
        );
      }
      const stage = progress.stages.find((s) => s.id === block.id);
      return (
        <h2 id={block.id} className="mt-12 flex scroll-mt-24 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-6 text-xl font-black text-ink first:mt-0 first:border-t-0 first:pt-0">
          <span className="min-w-0">
            <HandoverInline text={block.text} />
          </span>
          {stage && stage.keys.length > 0 && (
            <span className={cn("text-sm font-bold tabular-nums", stage.done === stage.keys.length ? "text-brand-600" : "text-mist")}>
              {stage.done} / {stage.keys.length}
            </span>
          )}
        </h2>
      );
    }
    case "paragraph":
      return (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          <HandoverInline text={block.text} />
        </p>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List className={cn("mt-3 space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft marker:text-mist", block.ordered ? "list-decimal marker:font-bold" : "list-disc")}>
          {block.items.map((t, i) => (
            <li key={i}>
              <HandoverInline text={t} />
            </li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-paper">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-surface text-xs font-bold text-slate">
              <tr>
                {block.header.map((h, i) => (
                  <th key={i} scope="col" className={cn("px-3 py-2.5 align-bottom", short(h) && "whitespace-nowrap")}>
                    <HandoverInline text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={cn("px-3 py-2.5 align-top leading-relaxed", j === 0 ? "font-bold text-ink" : "text-ink-soft", short(c) && "whitespace-nowrap")}>
                      <HandoverInline text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "tasks":
      return (
        <ul className="mt-4 space-y-3">
          {block.items.map((t) => {
            const c = checks.get(t.key);
            return (
              <li key={t.key} id={`item-${t.key}`} className={cn("scroll-mt-24 rounded-2xl border p-4 transition", c ? "border-brand-200 bg-brand-50/60" : "border-line bg-paper")}>
                <HandoverCheck itemKey={t.key} label={`${t.key} ${plainText(t.title)}`} checked={!!c} disabled={!canCheck}>
                  <p className={cn("font-bold leading-snug", c ? "text-slate" : "text-ink")}>
                    <span className="mr-1.5 inline-block rounded-md bg-ink px-1.5 py-0.5 align-[1px] text-[11px] font-black tabular-nums text-white">{t.key}</span>
                    <HandoverInline text={t.title} />
                    {t.note && (
                      <span className="ml-1 text-sm font-normal text-slate">
                        <HandoverInline text={t.note} />
                      </span>
                    )}
                  </p>
                  {c && (
                    <p className="mt-1 text-xs font-bold text-brand-700">
                      끝냄 · {c.checked_name || "이름 없음"} · {doneAt(c.checked_at)}
                    </p>
                  )}
                </HandoverCheck>
                {t.steps.length > 0 && (
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft marker:font-bold marker:text-mist sm:ml-10">
                    {t.steps.map((s, i) => (
                      <li key={i}>
                        <HandoverInline text={s} />
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      );
  }
}
