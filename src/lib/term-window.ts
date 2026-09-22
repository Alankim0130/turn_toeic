/**
 * "지금 기수" 는 강사가 정한 개강일~종강일로 정한다 (2026-09-22 Alan — "출석기록은 항상 강사가 설정한 해당달 개강날과 종강날에 맞춰서.
 * 다음달로 넘어가면 예전기록은 빠지고 항상 새롭게 … 다른 것들도 개강날·종강날 개념이 제대로 적용되어 있는지").
 *
 * 기수의 기간은 반 편성 달력의 **개강일 ~ 종강일**(`terms.enrollment_opens_at` · `closes_at`)이다. 달력의 월이 아니다 —
 * 9월 기수가 10/3 에 끝나고 10월 기수가 10/6 에 시작하면 10/1~10/3 은 아직 9월 기수이고 10/4 부터 10월 기수다.
 * 관리자 화면의 기본 기수(대시보드 인원수 · 학생명단 · 스터디 · 특강 · LC 음원 · 학생 반 배정)와 출석이 모두 여기서 고른다.
 * 날짜를 아직 안 정한 기수만 달력의 월(1일~말일)로 대신한다. 순수 함수 (`term-window.test.ts`).
 */

export type TermRow = { id: number; year: number; month: number; enrollment_opens_at?: string | null; closes_at?: string | null };

const pad = (n: number) => String(n).padStart(2, "0");

/** 기수의 기간. 개강일·종강일이 있으면 그것, 없으면 그 달 1일~말일 (dated = false) */
export function termWindow(t: TermRow): { opens: string; closes: string; dated: boolean } {
  if (t.enrollment_opens_at && t.closes_at && t.enrollment_opens_at <= t.closes_at) {
    return { opens: t.enrollment_opens_at, closes: t.closes_at, dated: true };
  }
  const last = new Date(Date.UTC(t.year, t.month, 0)).getUTCDate();
  return { opens: `${t.year}-${pad(t.month)}-01`, closes: `${t.year}-${pad(t.month)}-${pad(last)}`, dated: false };
}

/**
 * 지금 보여 줄 기수:
 * 1. 오늘이 기간 안인 기수 (둘이 겹치면 먼저 끝나는 쪽 — 지금 수업이 이어지는 달)
 * 2. 없으면 앞으로 시작할 가장 가까운 기수 — 지난 기수가 끝났으면 새 기수로 넘어간다
 * 3. 그것도 없으면 가장 최근에 끝난 기수
 * `datedOnly` 면 개강일·종강일을 정한 기수만 본다 (출석 — 날짜 없는 달에는 출석이 없다).
 */
export function pickCurrentTerm<T extends TermRow>(terms: readonly T[], today: string, opts: { datedOnly?: boolean } = {}): T | null {
  const list = terms.map((t) => ({ t, w: termWindow(t) })).filter((x) => !opts.datedOnly || x.w.dated);
  const now = list.filter((x) => x.w.opens <= today && today <= x.w.closes).sort((a, b) => a.w.closes.localeCompare(b.w.closes) || a.w.opens.localeCompare(b.w.opens));
  if (now[0]) return now[0].t;
  const next = list.filter((x) => x.w.opens > today).sort((a, b) => a.w.opens.localeCompare(b.w.opens));
  if (next[0]) return next[0].t;
  const past = list.filter((x) => x.w.closes < today).sort((a, b) => b.w.closes.localeCompare(a.w.closes));
  return past[0]?.t ?? null;
}

/** 날짜를 기수 기간 안으로 넣는다 (밖이면 가까운 끝으로) */
export function clampToTerm(date: string, t: TermRow): string {
  const w = termWindow(t);
  if (date < w.opens) return w.opens;
  if (date > w.closes) return w.closes;
  return date;
}

/** 이 날짜가 기수의 개강일~종강일 안인가 (날짜를 안 정한 기수는 늘 아니다) */
export function inTerm(date: string, t: TermRow): boolean {
  const w = termWindow(t);
  return w.dated && w.opens <= date && date <= w.closes;
}

/** 하루 앞뒤 (YYYY-MM-DD, 한국 날짜) */
export function shiftDate(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00+09:00`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
