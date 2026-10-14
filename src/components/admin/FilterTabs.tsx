import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterTab = { value: string; label: string; count?: number };

/**
 * ?key=value 링크 탭. 서버 컴포넌트에서 사용
 *
 * **칸을 똑같이 나눠 한 줄을 가득 채운다** (2026-09-22 Alan — "버튼이 너무 안예쁘게 되어있어 …
 * 한페이지내에서 좌우대칭이 예쁘게 나왔는데 역전토익은 그냥 버튼에 왼쪽에 몰려있어").
 * 알약을 왼쪽부터 늘어놓으면(`flex w-max`) 오른쪽에 빈자리가 남고 **줄마다 끝나는 자리가 달라**
 * 줄이 두세 개 쌓였을 때 흐트러져 보인다. `flex-1 basis-0` 은 글자 길이와 상관없이 칸을 같은 너비로
 * 나누므로 줄이 여러 개여도 끝이 맞는다. 관리자 화면 아홉 곳이 이 줄을 함께 쓴다.
 *
 * **무게가 둘이다** (2026-09-22 Alan — "버튼채우기가 검은색이고 3개가 연속으로 있으니 너무 정신없어").
 * 꽉 찬 검은 알약을 여러 줄 쌓으면 어디가 중요한지 없이 전부 소리친다. 그래서
 * - `solid`(기본) — 흰 **바탕 띠 안에서** 고른 칸만 브랜드색으로 찬다 (관리자 모드는 토스 파랑 — globals.css "관리자 모드 = 토스 모양", 2026-10-09).
 *   한 줄만 있는 화면과 첫째 줄에 쓴다
 * - `outline` — 테두리만. 같은 화면에 줄이 둘일 때 **둘째 줄**에 써서 첫째 줄에 자리를 내준다
 * 채움색은 잉크 검정이 아니라 **브랜드색**이다 (디자인 원칙 — 강조는 브랜드색 하나로. 관리자 모드에서는 그 값이 토스 파랑이다).
 *
 * **지킬 것**
 * - **이름은 한 줄이다**(`whitespace-nowrap`) — 칸이 이름보다 좁아지지 않는다. 자리가 넉넉하면 칸이 똑같은 폭이고,
 *   모자라면 긴 이름의 칸만 제 글자만큼 넓어지고 나머지가 남은 자리를 똑같이 나눈다 (`flex-1 basis-0` + 글자 폭이 최소).
 *   그래도 모자라면(320px 에 다섯 칸) **띠가 칸과 함께 넓어져** 가로로 민다 (`min-w-min`).
 *   2026-10-14 까지는 칸마다 80px 를 못박고(`min-w-20`) 띠는 화면 폭에 묶어 두어, 다섯 칸 줄(학생명단 · 교재주문)이 430px 아이폰에서도 넘쳤고
 *   마지막 `전체` 칸이 흰 띠 밖으로 삐져나와 잘렸다 (Alan "전체 이부분 ui가 이상해"). **칸에 고정 최소 폭을 되살리지 말 것.**
 * - 좁은 화면에서는 숫자를 글자 **아래**로 내린다 — 옆에 두면 칸이 그만큼 더 좁아진다.
 *   **숫자가 있는 칸과 없는 칸(`전체` · `졸업생`)이 한 줄에 섞이면 없는 칸에 보이지 않는 자리를 둔다** — 안 두면 그 칸의 이름만
 *   세로 가운데로 내려가 줄이 들쭉날쭉하다 (같은 날 Alan 의 캡처).
 * - **탭이 없으면 줄을 그리지 않는다** — 레벨·유형 목록 조회가 실패해도 빈 띠가 남지 않게.
 */
export function FilterTabs({
  basePath,
  paramKey,
  current,
  tabs,
  keep = {},
  variant = "solid",
}: {
  basePath: string;
  paramKey: string;
  current: string;
  tabs: FilterTab[];
  keep?: Record<string, string | undefined>;
  variant?: "solid" | "outline";
}) {
  if (tabs.length === 0) return null;
  const q = (value: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
    p.set(paramKey, value);
    return `${basePath}?${p.toString()}`;
  };
  const solid = variant === "solid";
  // 숫자가 있는 칸이 하나라도 있으면 없는 칸에도 숫자 자리를 둔다 (휴대폰에서 이름 줄을 맞춘다)
  const anyCount = tabs.some((t) => typeof t.count === "number");
  const badge = "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums";
  return (
    <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className={cn("flex min-w-min gap-1 sm:gap-1.5", solid && "rounded-2xl bg-paper p-1 ring-1 ring-line")}>
        {tabs.map((t) => {
          const active = t.value === current;
          return (
            <Link
              key={t.value}
              role="tab"
              aria-selected={active}
              href={q(t.value)}
              className={cn(
                "flex flex-1 basis-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-center text-[13px] font-bold leading-tight transition sm:flex-row sm:gap-2 sm:text-sm",
                solid
                  ? cn("rounded-xl2 px-1.5 py-2 sm:px-2", active ? "bg-brand-500 text-white" : "text-ink-soft hover:bg-surface hover:text-ink")
                  : cn(
                      "rounded-xl2 border px-1.5 py-2 sm:px-2",
                      active ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:text-brand-600",
                    ),
              )}
            >
              {t.label}
              {typeof t.count === "number" ? (
                <span className={cn(badge, active ? (solid ? "bg-white/25 text-white" : "bg-brand-100 text-brand-700") : "bg-white text-ink-soft")}>{t.count}</span>
              ) : (
                anyCount && (
                  <span aria-hidden className={cn(badge, "invisible sm:hidden")}>
                    0
                  </span>
                )
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
