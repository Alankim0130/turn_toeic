"use client";

import { CLASS_MATERIAL_LINK_LABEL_MAX, CLASS_MATERIAL_LINKS_MAX, normalizeLinkUrl, type MaterialLink } from "@/lib/class-materials";
import { isYoutubeUrl } from "@/lib/live-links";
import { youtubeVideo } from "@/lib/youtube-video";
import { cn } from "@/lib/utils";

/** 입력 중인 링크 한 줄 — 주소 · 이름(선택). 저장할 때 `parseMaterialLinks` 가 읽는다 */
export type LinkRow = { key: string; url: string; label: string };

export const emptyLinkRow = (): LinkRow => ({ key: crypto.randomUUID(), url: "", label: "" });

/** 올려 둔 링크 → 수정 칸. 링크가 없으면 빈 줄 하나 (칸이 보여야 링크를 넣을 수 있는 줄 안다) */
export const linkRowsOf = (links: readonly MaterialLink[]): LinkRow[] =>
  links.length ? links.map((l) => ({ key: crypto.randomUUID(), url: l.url, label: l.label ?? "" })) : [emptyLinkRow()];

/** 줄 아래 작은 안내 — 무엇으로 읽혔는지 미리 보인다 (유튜브 영상이면 학생 화면에서 바로 재생) */
function hintOf(raw: string): { text: string; bad?: boolean } | null {
  if (!raw.trim()) return null;
  const url = normalizeLinkUrl(raw);
  if (!url) return { text: "주소를 확인해 주세요 — https:// 로 시작하는 주소를 그대로 붙여 넣어 주세요", bad: true };
  if (youtubeVideo(url)) return { text: "유튜브 영상 — 학생 화면에서 바로 재생돼요" };
  if (isYoutubeUrl(url)) return { text: "유튜브 링크 — 새 창으로 열려요" };
  return { text: "새 창으로 열려요" };
}

/**
 * 수업자료실 링크 넣기 (2026-10-06 Alan — "수업 자료실에 유튜브 링크를 한번씩 올릴 수도 있어. 그래서 링크를 올릴 수 있는 공간도 있으면 좋겠어.
 * 그리고 링크를 여러개 올릴 수 있도록"). 올리기 폼과 수정 폼이 함께 쓴다 (파일 고르기 `MaterialFilePicker` 와 같은 자리).
 * 줄마다 **주소 + 이름(선택)**, `링크 더하기` 로 줄을 늘리고 `빼기` 로 지운다 (20개까지). 빈 줄은 저장할 때 건너뛴다.
 * 주소를 여러 개 한꺼번에 붙여 넣으면(줄바꿈 · 띄어쓰기로 나뉜 것) 한 줄씩 나눠 넣는다.
 * 주소 칸은 `type="url"` 이 아니다 — 브라우저가 `youtu.be/…` 처럼 https:// 없는 주소를 막아 버린다. 붙여 주는 일은 `normalizeLinkUrl` 이 한다.
 */
export function MaterialLinkEditor({
  rows,
  onChange,
  invalid = null,
  disabled = false,
}: {
  rows: LinkRow[];
  onChange: (rows: LinkRow[]) => void;
  /** 저장을 막은 줄 (`parseMaterialLinks` 의 index) — 빨간 테두리 */
  invalid?: number | null;
  disabled?: boolean;
}) {
  const update = (key: string, patch: Partial<LinkRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => {
    const next = rows.filter((r) => r.key !== key);
    onChange(next.length ? next : [emptyLinkRow()]);
  };

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, row: LinkRow) {
    const urls = [...new Set(e.clipboardData.getData("text").split(/\s+/).map(normalizeLinkUrl).filter((u): u is string => !!u))];
    if (urls.length < 2) return; // 하나면 브라우저가 그대로 붙여 넣는다
    e.preventDefault();
    const at = rows.findIndex((r) => r.key === row.key);
    const fresh = urls.slice(1).map((url) => ({ key: crypto.randomUUID(), url, label: "" }));
    onChange([...rows.slice(0, at), { ...row, url: urls[0] }, ...fresh, ...rows.slice(at + 1)].slice(0, CLASS_MATERIAL_LINKS_MAX));
  }

  return (
    <div className="space-y-1.5">
      <ul className="space-y-1.5" aria-label="넣을 링크">
        {rows.map((r, k) => {
          const hint = hintOf(r.url);
          return (
            <li key={r.key} className={cn("rounded-lg border bg-paper p-2", invalid === k ? "border-red-300 ring-2 ring-red-100" : "border-line")}>
              {/* 넓은 화면: 주소 · 이름 · 빼기 한 줄. 휴대폰: 주소 한 줄, 그 아래 이름 + 빼기 (`sm:contents` 로 감싼 칸이 풀린다) */}
              <div className="grid gap-1.5 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto] sm:items-center">
                <input
                  aria-label={`링크 ${k + 1} 주소`}
                  value={r.url}
                  onChange={(e) => update(r.key, { url: e.target.value })}
                  onPaste={(e) => onPaste(e, r)}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://youtu.be/…"
                  className="input !py-2 text-sm"
                  disabled={disabled}
                />
                <div className="flex gap-1.5 sm:contents">
                  <input
                    aria-label={`링크 ${k + 1} 이름`}
                    value={r.label}
                    onChange={(e) => update(r.key, { label: e.target.value })}
                    maxLength={CLASS_MATERIAL_LINK_LABEL_MAX}
                    placeholder="이름 (선택) · 예: 1강 해설 영상"
                    className="input min-w-0 flex-1 !py-2 text-sm"
                    disabled={disabled}
                  />
                  <button
                    type="button"
                    onClick={() => remove(r.key)}
                    disabled={disabled}
                    aria-label={`링크 ${k + 1} 빼기`}
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-slate transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    빼기
                  </button>
                </div>
              </div>
              {hint && <p className={cn("mt-1 px-0.5 text-[11px] font-semibold", hint.bad ? "text-amber-700" : "text-brand-700")}>{hint.text}</p>}
            </li>
          );
        })}
      </ul>
      {rows.length < CLASS_MATERIAL_LINKS_MAX && (
        <button
          type="button"
          onClick={() => onChange([...rows, emptyLinkRow()])}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line bg-paper px-3 py-2 text-sm font-bold text-ink transition hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-50"
        >
          {/* 더하기 표시는 도형으로 */}
          <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth={2.6} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          링크 더하기
        </button>
      )}
    </div>
  );
}
