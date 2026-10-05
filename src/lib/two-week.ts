/**
 * 850 2주완성 (2026-10-05 Alan — "850반 2주완성반이 있어. 새로운 등급을 만들어야해. 단과반은 없어. 대신 불라방은 있어.
 * 2주완성은 절반만 수업을 듣는거야. 개강일부터 시작이야." · 고른 것 "같은 850 수업의 앞 절반" · "앞 절반 마지막 수업일에 자동으로").
 *
 * - 과정(`courses.program`) `twoweek` — 강좌 `850+ 2주완성`. 단과는 없고 850 시간 전체(12:30~15:00) 한 줄이다. 현장 · 불라방 둘 다.
 * - 2주완성 반은 **그릇**이다 (속성반처럼): 과정 · 과목 · 담당 강사가 없고, 같은 레벨 점수보장반의 시간 단위 반(12:30~13:40 · 13:50~15:00)을
 *   품는다 (DB `private.section_includes`). 교실 · 불라방 링크 · 다시보기 · LC 교재 · 수업자료가 일반 850 과 같다.
 * - **개강일부터 앞 절반만**: 반의 종강일 = 그 달 수업일(월수금 + 화목금 합쳐 날짜순, 개강일~종강일 안)의 **ceil(N/2) 번째 날**
 *   (18일 → 9번째 · 19일 → 10번째). 회차도 그날까지. DB `private.term_half_date` · `private.sync_section_schedule`
 *   (마이그레이션 20261005140000)과 같은 규칙이다 — **바꾸면 둘 다.** 강사가 날짜를 정하지 않는다 — 달력을 고치면 저절로 맞는다.
 * 순수 함수 (`two-week.test.ts`).
 */

export const TWO_WEEK_PROGRAM = "twoweek";

/** 점수보장반이 아닌 과정 = **그릇 반** (스파르타 · 2주완성) — 과정 · 과목 · 담당 강사가 없고, 품은 점수보장반 시간 단위 반이 내용을 갖는다 */
export const isContainerProgram = (program: string | null | undefined): boolean => program != null && program !== "score";

export const isTwoWeek = (program: string | null | undefined): boolean => program === TWO_WEEK_PROGRAM;

/** 앞 절반의 마지막 수업일 — 그 달 수업일(트랙 섞여도 됨)을 하루씩 날짜순으로 세어 ceil(N/2) 번째. 수업일이 없으면 null */
export function termHalfDate(dates: readonly string[], window: { opens?: string | null; closes?: string | null } = {}): string | null {
  const days = [...new Set(dates)].filter((d) => (!window.opens || d >= window.opens) && (!window.closes || d <= window.closes)).sort();
  if (days.length === 0) return null;
  return days[Math.ceil(days.length / 2) - 1];
}

type DatedSession = { date: string; section: { id: number; term_id: number } | null };

/**
 * 품은 반의 수업일을 **내 반(직접 배정)의 수업일 범위**로 자른다 — 기수마다 내 반 회차의 첫날 ~ 마지막 날.
 * 2주완성 반은 앞 절반 회차만 갖는데 품은 850 시간 단위 반은 그 달 끝까지 수업일이 있어서, 그대로 두면
 * 숙제 · LC 음원 · 수업자료실 달력에 들을 수 없는 뒤 절반 날짜가 선다.
 * 다른 반은 품은 반이 같은 기수 · 같은 트랙 달력이라 범위가 같아 **아무것도 빠지지 않는다**.
 * 그 기수에 내 반 회차가 없으면(등록을 못 읽었다) 자르지 않는다 — 근거 없이 지우면 진짜 학생의 달력이 빈다.
 */
export function clipToOwnRange<T extends DatedSession>(sessions: readonly T[], direct: ReadonlySet<number>): T[] {
  const range = new Map<number, { from: string; to: string }>();
  for (const s of sessions) {
    if (!s.section || !direct.has(s.section.id)) continue;
    const r = range.get(s.section.term_id);
    range.set(s.section.term_id, r ? { from: s.date < r.from ? s.date : r.from, to: s.date > r.to ? s.date : r.to } : { from: s.date, to: s.date });
  }
  if (range.size === 0) return [...sessions];
  return sessions.filter((s) => {
    if (!s.section || direct.has(s.section.id)) return true;
    const r = range.get(s.section.term_id);
    return !r || (s.date >= r.from && s.date <= r.to);
  });
}
