import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { ClassChips, Glyph, type StudentCardClass } from "./StudentCard";

/**
 * 학생명단의 **숙제 미제출 알림을 끈 학생** 목록 (2026-11-13 Alan — "미제출을 (숙제검사를 원치 않는분) 별도로 뺀 리스트를 만들어줘").
 *
 * 미제출 알림은 모두가 기본으로 받고 숙제제출 화면의 스위치를 끈 학생만 빠진다 (도메인 규칙 7). 그 학생만 따로 모았다 —
 * 이름(검은 글자 · 누르면 학생 관리) · 반 배지(카드와 같은 `ClassChips`) · 끈 날짜. 등록생 · 예비등록생 탭의 학생 전부(카드 300명 상한과 상관없이)이고
 * 반별 명단 · 레벨별 명단 · 카드 어느 보기에서도 그 위에 선다. 이름 가나다순.
 * **끈 것은 미제출 알림뿐이다** — 숙제는 그대로 내고 선생님 점검 · 점검완료 알림(코멘트)도 그대로 받는다. 문구가 이것을 말한다.
 * `people` 이 null 이면 끈 학생 명단을 못 읽은 것 — 아무도 없다고 말하지 않는다.
 */
export type AlertsOffPerson = {
  id: string;
  name: string;
  /** 조교 계정 — 이름 옆 `조교` (명단 규칙 `roster-accounts.ts`) */
  assistant: boolean;
  /** "2026.11.5" — 끈 날 (KST, `shortDay`) */
  since: string;
  classes: StudentCardClass[];
};

export function AlertsOffList({ people, ok, tabLabel }: { people: AlertsOffPerson[] | null; ok: boolean; tabLabel: string }) {
  return (
    <section id="alerts-off" aria-labelledby="alerts-off-title" className="card mb-4 p-4">
      <h2 id="alerts-off-title" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-black text-ink">
        <Glyph name="bellOff" size={15} className="text-amber-600" />
        숙제 미제출 알림을 끈 학생
        {people && <span className="text-amber-700">{people.length}명</span>}
        <span className="text-xs font-semibold text-mist">· {tabLabel}</span>
      </h2>
      <p className="mt-1 text-xs text-slate">
        숙제제출 화면에서 알림 스위치를 끈 학생이에요. 숙제 미제출 알림(손으로 보내기 · 자동 알림)만 가지 않고, 숙제 제출 · 선생님 점검 · 점검완료 알림은 그대로예요.
      </p>

      {!people ? (
        <p className="mt-3 rounded-xl2 bg-surface px-3 py-3 text-xs text-slate">알림을 끈 학생 명단을 불러오지 못했어요. 새로고침해 주세요.</p>
      ) : (
        <>
          {!ok && (
            <Alert kind="warning" title="다 불러오지 못했어요" className="mt-3">
              빠진 학생이 있을 수 있어요. 새로고침해 주세요.
            </Alert>
          )}
          {people.length === 0 ? (
            <p className="mt-3 rounded-xl2 bg-surface px-3 py-3 text-xs text-slate">알림을 끈 학생이 없어요 — 모두 숙제 미제출 알림을 받아요.</p>
          ) : (
            <ul className="mt-2 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
              {people.map((p) => (
                <li key={p.id} className="flex min-w-0 items-start gap-2 border-b border-line py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      <Link href={`/admin/students/${p.id}`} className="min-w-0 truncate text-sm font-bold text-ink hover:underline">
                        {p.name || "이름 없음"}
                      </Link>
                      {p.assistant && <span className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-black text-ink-soft ring-1 ring-line">조교</span>}
                    </p>
                    <ClassChips classes={p.classes} className="mt-1" />
                  </div>
                  <span className="shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-mist">{p.since} 끔</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
