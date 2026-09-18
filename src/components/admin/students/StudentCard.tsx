import Link from "next/link";
import { Avatar } from "@/components/layout/Avatar";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { cn } from "@/lib/utils";

/**
 * 학생명단 한 사람 = 카드 한 장 (2026-09-18 Alan 요청 — "명단이 한화면에 깔끔하게 다 보이면 좋겠어").
 *
 * 그전에는 여섯 칸짜리 표라 휴대폰에서 **옆으로 밀어야** 반 배정·대학이 보였다 (표는 640px 를 넘는다).
 * 카드는 폭을 넘지 않고 접히므로 320px 에서도 한 화면에 다 들어온다.
 *
 * **카드 전체가 학생 관리로 가는 링크다** — 이름 링크의 `after:absolute inset-0` 이 카드를 덮는다.
 * 그래서 전화·메일처럼 카드 안에 또 있는 링크는 `relative z-10` 으로 그 위에 올려야 눌린다
 * (링크 안에 링크를 넣으면 HTML 이 깨지므로 겹치는 방식을 쓴다).
 */

export type StudentCardEnrollment = { id: number; label: string; mode: string | null };

export type StudentCardMeta = { label: string; value: string; href?: string };

export function StudentCard({
  id,
  name,
  role,
  testRole,
  tester,
  affiliation,
  metas,
  enrollments,
  footLabel,
  footValue,
  chip,
}: {
  id: string;
  name: string | null;
  role: string;
  /** 테스트 등급 라벨 (켜져 있을 때만) */
  testRole?: string | null;
  /** 강사·관리자 계정 */
  tester?: boolean;
  /** "고신대학교 · 인문계열" */
  affiliation?: string;
  metas: StudentCardMeta[];
  enrollments: StudentCardEnrollment[];
  footLabel?: string;
  footValue?: string;
  /** "9월 예비등록생" 같은 칩 */
  chip?: string;
}) {
  return (
    <li className="relative rounded-xl2 border border-line bg-paper p-4 transition hover:border-brand-200 hover:bg-brand-50/30">
      <div className="flex items-start gap-3">
        <Avatar name={name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <Link
              href={`/admin/students/${id}`}
              className="text-base font-black text-ink after:absolute after:inset-0 after:content-['']"
            >
              {name || "이름 없음"}
            </Link>
            <StatusBadge status={role} />
            {tester && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">테스터</span>}
            {testRole && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">{testRole} 테스트 중</span>}
            {chip && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-black text-brand-700">{chip}</span>}
          </p>
          {affiliation && <p className="mt-1 truncate text-xs font-semibold text-slate">{affiliation}</p>}
        </div>
        <Chevron />
      </div>

      {metas.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-1.5">
          {metas.map((m) => (
            <div key={m.label} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs ring-1 ring-line">
              <dt className="shrink-0 font-bold text-mist">{m.label}</dt>
              <dd className="min-w-0 truncate font-semibold text-ink">
                {m.href ? (
                  <a href={m.href} className="relative z-10 underline decoration-brand-200 decoration-2 underline-offset-2 hover:decoration-brand-500">
                    {m.value}
                  </a>
                ) : (
                  m.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {enrollments.length > 0 && (
        <ul className="mt-3 space-y-1">
          {enrollments.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-1.5 rounded-xl bg-brand-50/70 px-2.5 py-1.5 text-xs font-bold text-ink">
              {/* 현장 · 불라방을 **앞에** 둔다 — 표에서는 줄 끝에 묻혀 잘려 나갔다 (2026-09-18 Alan "대면/비대면 신청") */}
              {e.mode && <StatusBadge status={e.mode} className="!text-[11px]" />}
              <span className="min-w-0">{e.label}</span>
            </li>
          ))}
        </ul>
      )}

      {footValue && (
        <p className={cn("mt-2 text-xs font-semibold text-slate", enrollments.length === 0 && "mt-3")}>
          {footLabel && <span className="mr-1.5 font-bold text-mist">{footLabel}</span>}
          {footValue}
        </p>
      )}
    </li>
  );
}

/** 누를 수 있는 줄이라는 표시. 아이콘 자산이 아니라 도형이다 (이모지를 쓰지 않는다) */
function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="mt-1.5 shrink-0 text-mist">
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
