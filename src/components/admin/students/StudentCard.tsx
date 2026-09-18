import Link from "next/link";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { cn } from "@/lib/utils";

/**
 * 학생명단 한 사람 = 카드 한 장 (2026-09-18 Alan 요청 — "명단이 한화면에 깔끔하게 다 보이면 좋겠어 첫토익앱처럼.
 * 쫌 더 한눈에 들어오며, 글자크기를 쫌 줄이고").
 *
 * 그전에는 여섯 칸짜리 표라 휴대폰에서 **옆으로 밀어야** 반 배정·대학이 보였다 (표는 640px 를 넘는다).
 * 카드는 폭을 넘지 않고 접히므로 320px 에서도 한 화면에 다 들어온다.
 *
 * **모양은 첫토익 학생 리스트를 그대로 본떴다 — 구조만이고 색은 우리 핫핑크다.**
 * 왼쪽 둥근 네모 아바타 · 이름 + 작은 배지 · 그 아래 대학·학과 · 맨 아래 아이콘 한 줄짜리 정보들 · 오른쪽 꺾쇠.
 * **정보를 알약(테두리 있는 상자)에 담지 않는다** — 40명이 쌓이면 상자만 보이고 값이 안 읽힌다.
 * 아이콘 + 작은 회색 이름표 + 검은 값으로 흘려 놓으면 훨씬 조용하고 빽빽하다.
 *
 * **카드 전체가 학생 관리로 가는 링크다** — 이름 링크의 `after:absolute inset-0` 이 카드를 덮는다.
 * 그래서 전화·메일처럼 카드 안에 또 있는 링크는 `relative z-10` 으로 그 위에 올려야 눌린다
 * (링크 안에 링크를 넣으면 HTML 이 깨지므로 겹치는 방식을 쓴다).
 */

export type GlyphName = "phone" | "mail" | "key" | "calendar" | "clock" | "check";

export type StudentCardMeta = { icon: GlyphName; label?: string; value: string; href?: string };

/** 반 배정 배지 — 첫토익의 `불라방 1단계 · 주4일` 자리 */
export type StudentCardClass = { id: number; label: string; mode: string | null; modeLabel: string };

export function StudentCard({
  id,
  name,
  role,
  testRoleLabel,
  tester,
  chip,
  affiliation,
  classes,
  metas,
}: {
  id: string;
  name: string | null;
  role: string;
  /** 테스트 등급 (켜져 있을 때만) */
  testRoleLabel?: string | null;
  /** 강사·관리자 계정 */
  tester?: boolean;
  /** "9월 예비등록생" 같은 칩 */
  chip?: string;
  /** "고신대학교 · 인문계열" */
  affiliation?: string;
  classes: StudentCardClass[];
  metas: StudentCardMeta[];
}) {
  const initial = (name ?? "").trim().charAt(0);
  return (
    <li className="relative min-w-0 rounded-2xl border border-line bg-paper p-3.5 transition hover:border-brand-200 hover:bg-brand-50/30">
      <div className="flex gap-3">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-lg font-black leading-none text-brand-700"
        >
          {initial || "·"}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <Link
              href={`/admin/students/${id}`}
              className="text-[15px] font-black text-ink after:absolute after:inset-0 after:content-['']"
            >
              {name || "이름 없음"}
            </Link>
            {/* 등급 색은 관리자 화면 전체와 같은 StatusBadge 를 쓴다 (수강생 초록 · 졸업생 잉크 · 강사 분홍) */}
            <StatusBadge status={role} className="!px-1.5 !py-0.5 !text-[11px]" />
            {tester && <Badge tone="amber">테스터</Badge>}
            {testRoleLabel && <Badge tone="amberSolid">{testRoleLabel} 테스트 중</Badge>}
            {chip && <Badge tone="brand">{chip}</Badge>}
          </p>

          {affiliation && <p className="mt-1 truncate text-xs text-slate">{affiliation}</p>}

          {classes.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {classes.map((c) => (
                <li key={c.id} className="inline-flex items-center gap-1 rounded-lg bg-surface px-1.5 py-1 text-[10px] font-bold">
                  {/* 현장 · 불라방 — 표에서는 줄 끝에 묻혀 제일 먼저 잘려 나갔다 (2026-09-18 Alan "대면/비대면 신청").
                      좁은 화면에서 "불라/방" 으로 갈리지 않게 붙여 둔다 */}
                  <span className={cn("whitespace-nowrap", c.mode === "live" ? "text-brand-600" : "text-ink")}>{c.modeLabel}</span>
                  <span className="text-slate">{c.label}</span>
                </li>
              ))}
            </ul>
          )}

          {metas.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {metas.map((m) => (
                <span key={`${m.icon}-${m.label ?? ""}-${m.value}`} className="inline-flex min-w-0 max-w-full items-center gap-1">
                  <Glyph name={m.icon} />
                  {m.label && <span className="shrink-0 text-mist">{m.label}</span>}
                  {/* `min-w-0` 이 없으면 긴 이메일이 flex 안에서 줄어들지 않아 카드를 통째로 넘친다 (320px 에서 실제로 넘쳤다) */}
                  {m.href ? (
                    <a href={m.href} className="relative z-10 min-w-0 truncate font-semibold text-ink underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
                      {m.value}
                    </a>
                  ) : (
                    <span className="min-w-0 truncate font-semibold text-ink">{m.value}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        <Glyph name="chevron" className="self-center text-mist" size={18} />
      </div>
    </li>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "brand" | "amber" | "amberSolid" }) {
  const TONE = {
    brand: "bg-brand-500 text-white",
    amber: "bg-amber-100 text-amber-800",
    amberSolid: "bg-amber-500 text-white",
  } as const;
  return <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-black", TONE[tone])}>{children}</span>;
}

/**
 * 한 줄짜리 아이콘 — **도형(인라인 SVG)** 이다.
 * `public/icons/*.png` 는 힉스필드 컬러 아이콘이라 13px 로 줄이면 뭉개지고 글자 색을 따라오지 못한다
 * (LC 플레이어의 재생 버튼·랜딩 재생 삼각형과 같은 이유로 도형을 쓴다). 이모지는 쓰지 않는다.
 */
function Glyph({ name, className, size = 13 }: { name: GlyphName | "chevron"; className?: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: cn("shrink-0", className ?? "text-mist"),
  };
  switch (name) {
    case "phone":
      return (
        <svg {...common}>
          <path d="M6 3h3l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v3a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3.5 7l8.5 6 8.5-6" />
        </svg>
      );
    case "key":
      return (
        <svg {...common}>
          <circle cx="8" cy="12" r="4" />
          <path d="M12 12h9M18 12v3M21 12v2" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.5 2.5L16 9.5" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common} strokeWidth={2.5}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      );
  }
}
