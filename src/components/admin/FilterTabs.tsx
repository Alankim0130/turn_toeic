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
 * - `solid`(기본) — 연분홍 **바탕 띠 안에서** 고른 칸만 핫핑크로 찬다. 한 줄만 있는 화면과 첫째 줄에 쓴다
 * - `outline` — 테두리만. 같은 화면에 줄이 둘일 때 **둘째 줄**에 써서 첫째 줄에 자리를 내준다
 * 채움색은 잉크 검정이 아니라 **브랜드 핫핑크**다 (디자인 원칙 — 강조는 브랜드색 하나로).
 *
 * **지킬 것**
 * - 칸에 **최소 너비**(`min-w-20`)를 두고 자리가 모자랄 때만 가로로 밀리게 한다 — 다섯 칸짜리 줄
 *   (학생명단 · 교재주문)을 320px 에 욱여넣으면 `입금 확인 전` 이 세 줄로 쪼개진다.
 *   자리가 있으면(레벨 세 칸, PC) `flex-1` 이 그대로 가득 채운다.
 * - 좁은 화면에서는 숫자를 글자 **아래**로 내린다 — 옆에 두면 칸이 그만큼 더 좁아진다.
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
  return (
    <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className={cn("flex min-w-full gap-1.5", solid && "rounded-2xl bg-brand-50 p-1")}>
        {tabs.map((t) => {
          const active = t.value === current;
          return (
            <Link
              key={t.value}
              role="tab"
              aria-selected={active}
              href={q(t.value)}
              className={cn(
                "flex min-w-20 flex-1 basis-0 flex-col items-center justify-center gap-0.5 text-center text-[13px] font-bold leading-tight transition sm:flex-row sm:gap-2 sm:text-sm",
                solid
                  ? cn("rounded-xl2 px-2 py-2", active ? "bg-brand-500 text-white shadow-pink" : "text-ink-soft hover:bg-white/70 hover:text-brand-600")
                  : cn(
                      "rounded-xl2 border px-2 py-2",
                      active ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:text-brand-600",
                    ),
              )}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                    active ? (solid ? "bg-white/25 text-white" : "bg-brand-100 text-brand-700") : "bg-white text-ink-soft",
                  )}
                >
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
