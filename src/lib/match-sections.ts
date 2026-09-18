import type { ParsedReceipt } from "./receipt";
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
 * 수강월은 (1) 배지 `NN월 과정` → (2) 수강증의 날짜들 → (3) 열린 기수가 하나뿐이면 그것, 순서로 정한다.
 * 화면·엔진·DB 가 없는 순수 함수라 테스트로 굳힌다.
 */

export type MatchInput = Pick<ParsedReceipt, "level" | "program" | "weekly" | "tracks" | "time" | "months" | "courseMonth">;

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

/** 수강월 후보 기수 — 배지 → 날짜 → 하나뿐이면 그것 */
export function pickTerms(parsed: MatchInput, terms: readonly string[]): string[] {
  const uniq = [...new Set(terms)];
  if (parsed.courseMonth) {
    const hit = uniq.filter((k) => Number(k.split("-")[1]) === parsed.courseMonth);
    if (hit.length > 0) return hit;
  }
  if (parsed.months.length > 0) {
    const keys = new Set(parsed.months.map((m) => termKeyOf(m)));
    const hit = uniq.filter((k) => keys.has(k));
    if (hit.length > 0) return hit;
  }
  return uniq;
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

  if (byKey.length === 0) {
    return { result: { kind: "none", reason: `${parsed.level} ${parsed.program === "sparta" ? "프리미어반" : ""} ${parsed.time.timeBlock} 에 열린 반이 없어요`.replace(/\s+/g, " ") }, log };
  }
  if (terms.length !== 1) {
    return { result: { kind: "ambiguous", reason: terms.length === 0 ? "수강월에 맞는 기수가 없어요" : `수강월이 어느 달인지 가릴 수 없어요 (${terms.join(", ")})` }, log };
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
