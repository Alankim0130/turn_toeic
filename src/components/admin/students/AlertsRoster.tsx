import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { rosterMarks, type ClassRoster } from "@/lib/class-roster";
import { cn } from "@/lib/utils";
import { TrackLevels } from "./ClassRosterView";
import { Glyph } from "./StudentCard";

/**
 * **숙제 알림받기 · 숙제 알림끄기 명단** — 레벨별 명단과 같은 모양 (2026-11-13 — 레벨별 명단 화면을 보내며 "숙제 알림 명단을 이런식으로 만들어줘").
 *
 * 그날의 흐름: 학생명단 카드 · 반별 명단에 켜짐/꺼짐 표시 → "별도로 뺀 리스트" (맨 위에 늘 서 있는 카드) → "반별명단, 레벨별 명단 저기 왼쪽에 추가 …
 * 숙제 알림받기, 숙제 알림끄기 이렇게 두개" (보기 두 칸 · 이름 + 반 배지 줄 목록) → "조교들이 볼 수 있도록" (숙제 미제출 알림 화면에도) → **이 모양**.
 * **줄 목록(이름 · 반 배지 · 끈 날짜)으로 되돌리지 말 것.**
 *
 * 그림은 레벨별 명단 그대로다(`TrackLevels`) — 레벨마다 엑셀 색 띠, 한 줄에 `월수금 | 화목금`(휴대폰은 위아래), 칸 안 이름은 여러 단 · 가나다순, 이름 뒤 `(불/프/RC)`.
 * 그 달 레벨별 명단(`by: "track"`)에서 켜 둔 학생 / 끈 학생만 남긴 것(`filterRoster`)이라 주5일 학생은 두 칸에 다 선다.
 * 학생명단(강사 · 관리자)과 숙제 미제출 알림(조교도 — 이름 · 등급은 `getProfileNames` 로)이 같이 쓴다.
 * `roster` 가 null 이면 알림 설정을 못 읽은 것 — 아무도 없다고 말하지 않는다.
 */
const COPY = {
  on: {
    label: "숙제 알림받기 명단",
    note: "숙제제출 화면의 알림 스위치가 켜져 있는 학생이에요 (처음엔 모두 켜져 있어요). 기한이 지난 숙제를 안 내면 숙제 미제출 알림이 가요.",
    empty: "이 달 반에 알림을 받는 학생이 없어요 — 모두 알림을 껐어요.",
  },
  off: {
    label: "숙제 알림끄기 명단",
    note: "숙제제출 화면에서 알림 스위치를 끈 학생이에요. 숙제 미제출 알림만 가지 않고, 숙제 제출 · 선생님 점검 · 점검완료 알림은 그대로예요.",
    empty: "이 달 반에 알림을 끈 학생이 없어요 — 모두 숙제 미제출 알림을 받아요.",
  },
} as const;

export function AlertsRoster({
  mode,
  roster,
  ok,
  month,
  period,
  terms = [],
}: {
  mode: "on" | "off";
  /** 그 달 레벨별 명단에서 켜 둔 · 끈 학생만 남긴 것. null = 알림 설정을 못 읽음 */
  roster: ClassRoster | null;
  /** 명단을 다 읽었나 (배정 · 이름) */
  ok: boolean;
  /** 제목 앞 달 — `11월` */
  month: string;
  /** "11/4 개강 ~ 11/30 종강" */
  period: string;
  /** 고를 수 있는 달 — 둘 이상일 때만 칩을 그린다 (숙제 미제출 알림 화면은 위에 기수 칩이 따로 있어 넘기지 않는다) */
  terms?: { key: string; label: string; href: string; active: boolean }[];
}) {
  const copy = COPY[mode];
  return (
    <section aria-labelledby="alerts-roster-title" className="card mb-6 p-4 sm:p-5">
      <h2 id="alerts-roster-title" className="flex items-center gap-1.5 text-lg font-black text-ink">
        <Glyph name={mode === "on" ? "bell" : "bellOff"} size={18} className={mode === "on" ? "text-brand-600" : "text-amber-600"} />
        {month} {copy.label}
      </h2>
      <p className="mt-0.5 text-xs text-slate">
        {[period, roster ? `학생 ${roster.total}명` : null, "레벨마다 월수금 · 화목금 · 이름 가나다순"].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-1 text-xs text-slate">{copy.note}</p>

      {terms.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="달">
          {terms.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold ring-1 transition",
                t.active ? "bg-ink text-white ring-ink" : "bg-paper text-ink-soft ring-line hover:text-brand-600 hover:ring-brand-300",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate">
        <span className="font-bold text-ink-soft">표시</span>
        {rosterMarks("track").map((m) => (
          <span key={m.mark} className="whitespace-nowrap">
            <b className="text-ink">({m.mark})</b> {m.label}
          </span>
        ))}
      </p>

      {!ok && (
        <Alert kind="warning" title="명단을 다 불러오지 못했어요" className="mt-3">
          빠진 학생이 있을 수 있어요. 새로고침해 주세요.
        </Alert>
      )}

      {!roster ? (
        <p className="mt-4 rounded-xl2 bg-surface px-4 py-6 text-center text-sm text-slate">숙제 미제출 알림 설정을 불러오지 못했어요. 새로고침해 주세요.</p>
      ) : roster.levels.length === 0 ? (
        <p className="mt-4 rounded-xl2 bg-surface px-4 py-6 text-center text-sm text-slate">{copy.empty}</p>
      ) : (
        <TrackLevels levels={roster.levels} alertsOff={null} />
      )}
    </section>
  );
}
