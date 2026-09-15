/**
 * 대한민국 관공서 공휴일 — 반 편성 달력의 빨간 날 표시용.
 * 기준: 「공휴일에 관한 법률」·「관공서의 공휴일에 관한 규정」 (2026-05 개정: 노동절·제헌절 공휴일, 대체공휴일 적용)
 *
 *  - 양력 고정: 신정, 삼일절, 노동절(2026~), 어린이날, 현충일, 제헌절(2026~), 광복절, 개천절, 한글날, 성탄절
 *  - 음력: 설 연휴(음 12월 말일~1월 2일), 부처님오신날(음 4월 8일), 추석 연휴(음 8월 14~16일) — LUNAR 표
 *  - 선거일·임시공휴일: SPECIAL 표. 정부가 새로 지정하면 여기에 추가한다
 *  - 대체공휴일 (규정 제3조)
 *      삼일절·노동절·어린이날·부처님오신날·제헌절·광복절·개천절·한글날·성탄절: 토·일요일 또는 다른 공휴일과 겹치면
 *      설·추석 연휴: 일요일 또는 다른 공휴일과 겹치면
 *      → 그 다음 첫 번째 비공휴일(토·일 아닌 날). 대체공휴일끼리 겹치면 그 다음 비공휴일.
 *      신정·현충일·선거일·임시공휴일은 대체공휴일이 없다.
 *  - 음력 날짜는 2024~2028 월력요항(우주항공청·한국천문연구원) 발표값, 2029~2032 는 한국 음력 계산값이다.
 *    이 범위 밖의 해는 공휴일을 표시하지 않는다.
 *
 * 날짜는 항상 'YYYY-MM-DD' 문자열, 계산은 UTC 기준 (타임존 영향 없음).
 */

export type Holiday = { date: string; name: string; substitute: boolean };

export const HOLIDAY_YEAR_RANGE = { from: 2024, to: 2032 } as const;

type SubRule = "weekend" | "period" | "none";

const SOLAR: { md: string; name: string; rule: SubRule; from?: number }[] = [
  { md: "01-01", name: "신정", rule: "none" },
  { md: "03-01", name: "삼일절", rule: "weekend" },
  { md: "05-01", name: "노동절", rule: "weekend", from: 2026 },
  { md: "05-05", name: "어린이날", rule: "weekend" },
  { md: "06-06", name: "현충일", rule: "none" },
  { md: "07-17", name: "제헌절", rule: "weekend", from: 2026 },
  { md: "08-15", name: "광복절", rule: "weekend" },
  { md: "10-03", name: "개천절", rule: "weekend" },
  { md: "10-09", name: "한글날", rule: "weekend" },
  { md: "12-25", name: "성탄절", rule: "weekend" },
];

/** 설날(음 1/1) · 부처님오신날(음 4/8) · 추석(음 8/15) 의 양력 월-일 */
const LUNAR: Record<number, { seollal: string; buddha: string; chuseok: string }> = {
  2024: { seollal: "02-10", buddha: "05-15", chuseok: "09-17" },
  2025: { seollal: "01-29", buddha: "05-05", chuseok: "10-06" },
  2026: { seollal: "02-17", buddha: "05-24", chuseok: "09-25" },
  2027: { seollal: "02-07", buddha: "05-13", chuseok: "09-15" },
  2028: { seollal: "01-27", buddha: "05-02", chuseok: "10-03" },
  2029: { seollal: "02-13", buddha: "05-20", chuseok: "09-22" },
  2030: { seollal: "02-03", buddha: "05-09", chuseok: "09-12" },
  2031: { seollal: "01-23", buddha: "05-28", chuseok: "10-01" },
  2032: { seollal: "02-11", buddha: "05-16", chuseok: "09-19" },
};

/** 선거일(임기만료 선거)·임시공휴일. 대체공휴일 대상이 아니다 */
const SPECIAL: Record<string, string> = {
  "2024-04-10": "국회의원 선거일",
  "2024-10-01": "임시공휴일",
  "2025-01-27": "임시공휴일",
  "2025-06-03": "대통령 선거일",
  "2026-06-03": "지방선거일",
  "2028-04-12": "국회의원 선거일",
};

const DAY = 86_400_000;
const toTime = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
const fromTime = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => fromTime(toTime(ymd) + n * DAY);
const weekdayOf = (ymd: string) => new Date(toTime(ymd)).getUTCDay();

type Base = { date: string; name: string; rule: SubRule; ref: string };

const cache = new Map<number, Holiday[]>();

/** 그 해의 공휴일 (일요일 자체는 넣지 않는다). 날짜순 */
export function holidaysOfYear(year: number): Holiday[] {
  const hit = cache.get(year);
  if (hit) return hit;
  const lunar = LUNAR[year];
  if (!lunar) {
    cache.set(year, []);
    return [];
  }

  const base: Base[] = [];
  const push = (date: string, name: string, rule: SubRule, ref = date) => base.push({ date, name, rule, ref });

  for (const s of SOLAR) {
    if (s.from && year < s.from) continue;
    push(`${year}-${s.md}`, s.name, s.rule);
  }
  push(`${year}-${lunar.buddha}`, "부처님오신날", "weekend");
  for (const [key, label] of [
    ["seollal", "설날"],
    ["chuseok", "추석"],
  ] as const) {
    const day = `${year}-${lunar[key]}`;
    const end = addDays(day, 1);
    push(addDays(day, -1), `${label} 연휴`, "period", end);
    push(day, label, "period", end);
    push(end, `${label} 연휴`, "period", end);
  }
  for (const [date, name] of Object.entries(SPECIAL)) {
    if (date.startsWith(`${year}-`)) push(date, name, "none");
  }

  // 같은 날짜 안에서는 대체 규칙이 없는 날 → 설·추석 → 나머지 순으로 "먼저 쉬는 날"을 차지한다.
  // 이미 쉬는 날(일요일·다른 공휴일, 규칙에 따라 토요일)에 떨어진 공휴일마다 대체공휴일이 하나씩 필요하다.
  const order: Record<SubRule, number> = { none: 0, period: 1, weekend: 2 };
  base.sort((a, b) => a.date.localeCompare(b.date) || order[a.rule] - order[b.rule]);

  const occupied = new Set<string>();
  const refs: string[] = [];
  for (const h of base) {
    const wd = weekdayOf(h.date);
    const taken = wd === 0 || occupied.has(h.date);
    if (h.rule === "weekend" && (taken || wd === 6)) refs.push(h.ref);
    if (h.rule === "period" && taken) refs.push(h.ref);
    occupied.add(h.date);
  }

  const off = new Set(base.map((h) => h.date));
  const result: Holiday[] = base.map((h) => ({ date: h.date, name: h.name, substitute: false }));
  for (const ref of refs.sort()) {
    let d = addDays(ref, 1);
    while (weekdayOf(d) === 0 || weekdayOf(d) === 6 || off.has(d)) d = addDays(d, 1);
    off.add(d);
    result.push({ date: d, name: "대체공휴일", substitute: true });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  cache.set(year, result);
  return result;
}

/** [from, to] 구간의 공휴일을 날짜 → 이름 목록으로 */
export function holidayNamesBetween(from: string, to: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of holidaysOfYear(y)) {
      if (h.date < from || h.date > to) continue;
      const names = map.get(h.date) ?? [];
      if (!names.includes(h.name)) names.push(h.name);
      map.set(h.date, names);
    }
  }
  return map;
}

export const hasHolidayData = (year: number) => year >= HOLIDAY_YEAR_RANGE.from && year <= HOLIDAY_YEAR_RANGE.to;
