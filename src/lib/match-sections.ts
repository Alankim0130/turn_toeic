import { receiptCourseMonth, type ParsedReceipt } from "./receipt";
import { termKeyOf, type EnrollSection } from "./enroll-options";

/**
 * 수강증 판독 결과 → 배정할 반 (2026-09-18 Alan: "반을 찾아서 자동승인까지 가줘야 해").
 *
 * 가중합 점수를 매기지 않는다. 수강증 표기(CLAUDE.md "수강증 표기 규칙")가 방식·트랙·레벨·과정·시간을 **글자로** 정하므로
 * 열린 반을 **키로 거른다** — 레벨 = `courses.target_score`, 과정 = `courses.program`, 시간 = `time_block` 문자열 정확 일치,
 * 트랙 = 주3일은 적힌 트랙 하나 · 주5일은 같은 (기수·강좌·시간대)의 월수금 + 화목금 둘.
 *
 * **딱 맞는 반이 정확히 그 수만큼 남을 때만 `match`** 다 (주3일 1개 · 주5일 2개). 둘 이상 남거나 하나도 없으면
 * 스태프 검토로 넘긴다 — 애매한데 골라 넣으면 오배정이고, 오배정은 학생이 남의 반 다시보기를 보게 한다.
 *
 * 수강월은 (1) 배지 `NN월 과정` → (2) 수강요일 줄의 개강일 달 `[4주-09/04]` → (3) 열린 기수가 하나뿐이면 그것, 순서로 정한다.
 * **캡처 시각(`현재시간`)으로는 달을 고르지 않는다** (2026-09-22) — 9월 25일에 캡처한 10월 수강증이 배지를 못 읽으면
 * 9월 반에 자동 배정됐다 (재현). 수강월을 읽었는데 **그 달 반이 없으면 다른 달로 넘어가지 않는다** — 예전에는 날짜로 내려가
 * 10월 과정 수강증을 같은 시간대의 9월 반에 붙였다.
 *
 * 레벨이 흔들리면 대조하지 않는다 — 과정명(`중급속성` = 650)과 숫자가 다르거나, 점수보장반 수강증에 레벨 숫자가 여럿이면
 * 앞의 숫자를 골라 **다른 레벨 반에 자동 배정**할 수 있다 (스파르타는 두 레벨을 함께 들어 숫자가 여럿일 수 있어 뺀다).
 * 화면·엔진·DB 가 없는 순수 함수라 테스트로 굳힌다.
 */

export type MatchInput = Pick<ParsedReceipt, "level" | "levels" | "courseLevel" | "program" | "weekly" | "tracks" | "time" | "courseMonth" | "startMonth">;

export type MatchResult =
  | { kind: "match"; sectionIds: number[]; term: string }
  | { kind: "none" | "ambiguous"; reason: string };

/** 스태프 화면용 대조 기록 — 같은 레벨 반마다 어느 키가 맞았는지 */
export type MatchLog = {
  section_id: number;
  term: string;
  track: string;
  time_block: string | null;
  program: string;
  match: { time: boolean; program: boolean; term: boolean; track: boolean };
};

const usable = (s: EnrollSection): s is EnrollSection & { time_block: string; term: { year: number; month: number }; course: NonNullable<EnrollSection["course"]> } =>
  !!s.course && !!s.time_block && !!s.term;

/**
 * 수강월 후보 기수 — 수강월(배지 → 개강일 달)을 읽었으면 **그 달만**, 못 읽었으면 전부(하나뿐이면 그것이 답이다).
 * 캡처 시각으로 고르지 않는다 (위 설명).
 */
export function pickTerms(parsed: Pick<MatchInput, "courseMonth" | "startMonth">, terms: readonly string[]): string[] {
  const uniq = [...new Set(terms)];
  const month = receiptCourseMonth(parsed);
  return month == null ? uniq : uniq.filter((k) => Number(k.split("-")[1]) === month);
}

export function matchSections(parsed: MatchInput, sections: readonly EnrollSection[]): { result: MatchResult; log: MatchLog[] } {
  const all = sections.filter(usable);

  if (parsed.level == null) return { result: { kind: "none", reason: "레벨을 읽지 못했어요" }, log: [] };
  if (!parsed.time) return { result: { kind: "none", reason: "수업 시간을 읽지 못했어요" }, log: [] };
  if (!parsed.weekly || parsed.tracks.length === 0) return { result: { kind: "none", reason: "주3일/주5일을 읽지 못했어요" }, log: [] };

  const sameLevel = all.filter((s) => s.course.target_score === parsed.level);
  const byKey = sameLevel.filter((s) => s.course.program === parsed.program && s.time_block === parsed.time!.timeBlock);

  const terms = pickTerms(parsed, byKey.map((s) => termKeyOf(s.term)));
  const wantTracks = parsed.weekly === 5 ? ["mwf", "ttf"] : [parsed.tracks[0]];

  const log: MatchLog[] = sameLevel.map((s) => ({
    section_id: s.id,
    term: termKeyOf(s.term),
    track: s.track,
    time_block: s.time_block,
    program: s.course.program,
    match: {
      time: s.time_block === parsed.time!.timeBlock,
      program: s.course.program === parsed.program,
      term: terms.includes(termKeyOf(s.term)),
      track: wantTracks.includes(s.track),
    },
  }));

  // 레벨이 흔들리면 대조를 멈춘다 — 앞의 숫자를 골라 다른 레벨 반에 넣지 않는다
  if (parsed.courseLevel != null && parsed.courseLevel !== parsed.level) {
    return { result: { kind: "ambiguous", reason: `과정명의 레벨(${parsed.courseLevel})과 레벨 숫자(${parsed.level})가 달라요` }, log };
  }
  if (parsed.program === "score" && parsed.levels.length > 1) {
    return { result: { kind: "ambiguous", reason: `레벨 숫자가 여러 개 읽혔어요 (${parsed.levels.join(", ")})` }, log };
  }

  if (byKey.length === 0) {
    return { result: { kind: "none", reason: `${parsed.level} ${parsed.program === "sparta" ? "프리미어반" : ""} ${parsed.time.timeBlock} 에 열린 반이 없어요`.replace(/\s+/g, " ") }, log };
  }
  if (terms.length === 0) {
    // 수강월은 읽었는데 그 달에 이 시간대 반이 없다 — 다른 달 반에 붙이지 않는다
    return { result: { kind: "none", reason: `${receiptCourseMonth(parsed)}월 ${parsed.time.timeBlock} 반이 아직 없어요` }, log };
  }
  if (terms.length !== 1) {
    return { result: { kind: "ambiguous", reason: `수강월을 읽지 못해 어느 달인지 가릴 수 없어요 (${terms.join(", ")})` }, log };
  }

  const inTerm = byKey.filter((s) => termKeyOf(s.term) === terms[0]);
  const picked: number[] = [];
  for (const track of wantTracks) {
    const hit = inTerm.filter((s) => s.track === track);
    if (hit.length !== 1) {
      return {
        result: {
          kind: hit.length === 0 ? "none" : "ambiguous",
          reason: hit.length === 0 ? `${terms[0]} ${track === "mwf" ? "월수금" : "화목금"} 반이 없어요` : `${track === "mwf" ? "월수금" : "화목금"} 반이 여러 개예요`,
        },
        log,
      };
    }
    picked.push(hit[0].id);
  }

  return { result: { kind: "match", sectionIds: picked, term: terms[0] }, log };
}
