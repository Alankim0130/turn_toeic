import { inlineTokens, type InlineToken } from "@/lib/handover";
import { cn } from "@/lib/utils";

/**
 * 인수인계 문서의 글 한 덩이 — 굵게 · 코드 · 링크 · https 주소 (판독은 `src/lib/handover.ts` 의 `inlineTokens`).
 * 긴 코드 · 주소는 아무 데서나 줄을 바꿔 좁은 화면에서 옆으로 넘치지 않게 한다.
 */
export function HandoverInline({ text }: { text: string }) {
  return <>{render(inlineTokens(text))}</>;
}

const HANGUL = /[가-힣]/;

function render(tokens: InlineToken[]): React.ReactNode[] {
  return tokens.map((x, i) => {
    switch (x.t) {
      case "text":
        return x.v;
      case "code":
        // 이 문서의 코드 칸은 대부분 화면의 버튼 · 메뉴 이름(`알림 설정`)이다 — 한글은 본문 글꼴로, 낱말 가운데서 줄을 바꾸지 않는다.
        // 영문 · 숫자뿐인 것(환경변수 · 주소 · SQL)만 고정폭 글꼴로 — 짧으면(`3-B`) 한 줄로, 길면 아무 데서나 줄을 바꾼다
        return HANGUL.test(x.v) ? (
          <code key={i} className="rounded bg-surface px-1 py-0.5 font-sans text-[0.95em] font-semibold text-ink ring-1 ring-line box-decoration-clone [word-break:keep-all]">
            {x.v}
          </code>
        ) : (
          <code
            key={i}
            className={cn(
              "rounded bg-surface px-1 py-0.5 font-mono text-[0.88em] text-ink ring-1 ring-line box-decoration-clone",
              x.v.length <= 16 ? "whitespace-nowrap" : "[overflow-wrap:anywhere]",
            )}
          >
            {x.v}
          </code>
        );
      case "strong":
        return (
          <strong key={i} className="font-bold text-ink">
            {render(x.v)}
          </strong>
        );
      case "link":
        return (
          <a
            key={i}
            href={x.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-brand-500"
          >
            {x.v}
          </a>
        );
    }
  });
}
