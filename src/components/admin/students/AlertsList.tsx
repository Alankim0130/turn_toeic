import { Alert } from "@/components/ui/Alert";
import Link from "next/link";
import { ClassChips, Glyph, type StudentCardClass } from "./StudentCard";

/**
 * 학생명단 보기 `숙제 알림받기` · `숙제 알림끄기` (2026-11-13 Alan — "미제출을 (숙제검사를 원치 않는분) 별도로 뺀 리스트를 만들어줘" →
 * 같은 날 휴대폰 화면을 보내며 "지금처럼하지말고, 반별명단, 레벨별 명단 저기 왼쪽에 추가부탁해. 숙제 알림받기, 숙제 알림끄기 이렇게 두개를 만들어줘").
 * 처음 몇 시간은 등록생 탭 맨 위에 늘 서 있는 `끈 학생` 카드였다 — **보기 고르기 줄의 두 칸으로 옮겼다(맨 위 카드로 되돌리지 말 것).**
 *
 * 미제출 알림은 모두가 기본으로 받고 숙제제출 화면의 스위치를 끈 학생만 빠진다 (도메인 규칙 7). `on` = 켜 둔 학생, `off` = 끈 학생.
 * 레벨별 묶음 · 가나다순(카드와 같은 `groupByLevel` — 두 레벨을 들으면 두 묶음에, 반이 없으면 `반 미배정`),
 * 줄마다 이름(검은 글자 · 누르면 학생 관리) · 조교면 `조교` · 반 배지(카드와 같은 `ClassChips`) · 끈 학생은 끈 날짜.
 * **끈 것은 미제출 알림뿐이다** — 숙제는 그대로 내고 선생님 점검 · 점검완료 알림(코멘트)도 그대로 받는다. 설명 줄이 이것을 말한다.
 * `groups` 가 null 이면 알림 설정을 못 읽은 것 — 아무도 없다고 말하지 않는다.
 */
export type AlertsListPerson = {
  id: string;
  name: string;
  /** 조교 계정 — 이름 옆 `조교` (명단 규칙 `roster-accounts.ts`) */
  assistant: boolean;
  /** 끈 날 "2026.11.5" (KST, `shortDay`) — 끈 학생만 */
  since: string | null;
  classes: StudentCardClass[];
};
export type AlertsListGroup = { key: string; label: string; items: AlertsListPerson[] };

const COPY = {
  on: {
    title: "숙제 미제출 알림을 받는 학생",
    note: "숙제제출 화면의 알림 스위치가 켜져 있는 학생이에요 (처음엔 모두 켜져 있어요). 기한이 지난 숙제를 안 내면 숙제 미제출 알림(손으로 보내기 · 자동 알림)이 가요.",
    empty: "알림을 받는 학생이 없어요 — 모두 알림을 껐어요.",
  },
  off: {
    title: "숙제 미제출 알림을 끈 학생",
    note: "숙제제출 화면에서 알림 스위치를 끈 학생이에요. 숙제 미제출 알림(손으로 보내기 · 자동 알림)만 가지 않고, 숙제 제출 · 선생님 점검 · 점검완료 알림은 그대로예요.",
    empty: "알림을 끈 학생이 없어요 — 모두 숙제 미제출 알림을 받아요.",
  },
} as const;

export function AlertsList({
  mode,
  groups,
  total,
  ok,
  tabLabel,
}: {
  mode: "on" | "off";
  groups: AlertsListGroup[] | null;
  /** 목록에 선 사람 수 (한 사람은 한 번) */
  total: number;
  /** 카드 밖 학생의 이름을 다 읽었나 */
  ok: boolean;
  tabLabel: string;
}) {
  const copy = COPY[mode];
  return (
    <section aria-labelledby="alerts-list-title" className="card mb-6 p-4 sm:p-5">
      <h2 id="alerts-list-title" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-base font-black text-ink">
        <Glyph name={mode === "on" ? "bell" : "bellOff"} size={16} className={mode === "on" ? "text-brand-600" : "text-amber-600"} />
        {copy.title}
        {groups && <span className={mode === "on" ? "text-brand-600" : "text-amber-700"}>{total}명</span>}
        <span className="text-xs font-semibold text-mist">· {tabLabel}</span>
      </h2>
      <p className="mt-1 text-xs text-slate">{copy.note}</p>

      {!groups ? (
        <p className="mt-3 rounded-xl2 bg-surface px-3 py-3 text-xs text-slate">숙제 미제출 알림 설정을 불러오지 못했어요. 새로고침해 주세요.</p>
      ) : (
        <>
          {!ok && (
            <Alert kind="warning" title="다 불러오지 못했어요" className="mt-3">
              빠진 학생이 있을 수 있어요. 새로고침해 주세요.
            </Alert>
          )}
          {groups.length === 0 ? (
            <p className="mt-3 rounded-xl2 bg-surface px-3 py-3 text-xs text-slate">{copy.empty}</p>
          ) : (
            groups.map((g) => (
              <section key={g.key} aria-label={g.label} className="mt-4">
                <h3 className="flex items-baseline gap-1.5 text-sm font-black text-ink">
                  {g.label}
                  <span className="text-xs font-bold text-mist">{g.items.length}명</span>
                </h3>
                <ul className="mt-1 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((p) => (
                    <li key={p.id} className="flex min-w-0 items-start gap-2 border-b border-line py-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5">
                          <Link href={`/admin/students/${p.id}`} className="min-w-0 truncate text-sm font-bold text-ink hover:underline">
                            {p.name || "이름 없음"}
                          </Link>
                          {p.assistant && (
                            <span className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-black text-ink-soft ring-1 ring-line">조교</span>
                          )}
                        </p>
                        <ClassChips classes={p.classes} className="mt-1" />
                      </div>
                      {p.since && <span className="shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-mist">{p.since} 끔</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </section>
  );
}
