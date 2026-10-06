import { WEEK5_LABEL } from "./week5";
import { programRank } from "./timetable";
import { blockContains, blockMinutes, buildBlockTree, flattenBlockTree, parseTimeBlock } from "./time-blocks";
import { isContainerProgram } from "./two-week";
import { isSubject } from "./instructor-subject";

/**
 * 수동 등업신청에서 학생이 고르는 **수강월 → 레벨 → 종합 · 단과 → 요일 → 시간대** (2026-09-17 Alan 요청
 * "수강증 업로드 + 레벨 / 요일 / 시간대", "하나라도 빠지면 제출이 안되도록" → 2026-10-06 Alan "등업신청을 할때 지금 단과설정이 안되고 있어.
 * 단과도 설정할 수 있도록 해줘").
 *
 * 선택지는 전부 **열려 있는 반(`class_sections`)에서 만든다** — 레벨·시간대를 코드에 적지 않는다 (작업 원칙 4).
 * 그래서 반 편성이 바뀌면 고를 수 있는 것도 따라 바뀌고, 열리지도 않은 반은 애초에 고를 수 없다.
 *
 * **수강월이 여러 달 열려 있을 수 있다** — 개강 전에도 올릴 수 있어서(도메인 규칙 5) 이번 달과 다음 달이
 * 함께 열린다. 한 달만 열려 있으면 화면에서 고르는 칸을 만들지 않고 그대로 쓴다.
 *
 * **종합 · 단과** (2026-10-06) — 시간 단위 반(60 · 70분) 하나는 강사 한 명의 한 과목 = **단과**(반의 과목 칸 `subject`)이고,
 * 묶음 반(120 · 140분) · 방학달 통짜 반 · 속성반 · 2주완성과 주5일 60분(월수금 RC · 화목금 LC)은 두 과목을 다 듣는 **종합**이다
 * (학생명단의 `singleSubjectOf` 와 같은 뜻). 예전에는 단과 시간이 시간대 목록에 섞여 있기만 하고 무엇이 단과인지 어디에도 없어서
 * 단과 학생이 자기 반을 고를 길이 안 보였다. 과목을 아직 안 고른 반은 **모른다** — 어느 쪽을 골라도 보여 준다 (짐작해 숨기지 않는다).
 *
 * 같은 규칙을 **화면(고르기)과 서버(검사)가 함께 쓴다** — 화면이 보낸 반 id 를 믿지 않고
 * 서버가 `resolveEnrollChoice` 로 다시 푼다.
 */

export type EnrollSection = {
  id: number;
  track: string;
  time_block: string | null;
  /** 반의 과목 칸 (lc · rc) — 시간 단위 반(60 · 70분)만 채워진다. 종합 · 단과를 가린다 (2026-10-06). 읽어 오지 않으면 모르는 것으로 본다 */
  subject?: string | null;
  term: { year: number; month: number } | null;
  course: { id: number; name: string; program: string; target_score: number | null; course_type?: string | null } | null;
};

/** 요일 선택지. 주5일은 같은 (기수·강좌·시간대)의 월수금 + 화목금 두 반이다 (도메인 규칙 1) */
export type EnrollTrack = "mwf" | "ttf" | "week5";

/** 종합 · 단과 — 단과는 과목까지 고른다 (학생은 자기가 RC 를 듣는지 LC 를 듣는지 안다) */
export type EnrollKind = "full" | "rc" | "lc";
export const ENROLL_KINDS: readonly EnrollKind[] = ["full", "rc", "lc"];
export const isEnrollKind = (v: unknown): v is EnrollKind => v === "full" || v === "rc" || v === "lc";
/** 학생명단의 단과 이름표(`SINGLE_SUBJECT_LABEL` — RC단과 · LC단과)와 같은 말 */
export const KIND_CHOICE_LABEL: Record<EnrollKind, string> = { full: "종합반", rc: "RC단과", lc: "LC단과" };

export type EnrollChoice = {
  term: string;
  courseId: number;
  /** 종합 · 단과. 그 레벨에 한 가지뿐이면(속성반 · 2주완성 · 단과 반이 없는 달) 비워도 된다 */
  kind?: string;
  track: string;
  timeBlock: string;
};

export type ResolveResult = { ok: true; sectionIds: number[] } | { ok: false; reason: string };

export const termKeyOf = (t: { year: number; month: number } | null | undefined) =>
  t ? `${t.year}-${String(t.month).padStart(2, "0")}` : "";
export const termLabelOf = (key: string) => {
  const [y, m] = key.split("-");
  return y && m ? `${y}년 ${Number(m)}월` : "";
};

export const TRACK_CHOICE_LABEL: Record<EnrollTrack, string> = { mwf: "월수금", ttf: "화목금", week5: WEEK5_LABEL };

type Usable = EnrollSection & { time_block: string; term: { year: number; month: number }; course: NonNullable<EnrollSection["course"]> };

/** 고를 수 있는 반만 남긴다 — 시간대 라벨이 없는 반은 학생이 알아볼 수 없어 뺀다 */
const usable = (s: EnrollSection): s is Usable => !!s.course && !!s.time_block && !!s.term;

/** 그 달 · 그 강좌의 고를 수 있는 반 */
const poolOf = (sections: readonly EnrollSection[], term: string, courseId: number): Usable[] =>
  sections.filter(usable).filter((s) => termKeyOf(s.term) === term && s.course.id === courseId);

/**
 * 반 하나가 종합인지 단과(과목)인지 — 모르면 null.
 * pool = 같은 달 · 같은 강좌의 반 (묶음 반을 알아보는 데 쓴다).
 */
function sectionKind(s: Usable, pool: readonly Usable[]): EnrollKind | null {
  const type = s.course.course_type;
  // 단과 상품 강좌 (지금은 없다 — 학생명단 `singleSubjectOf` 와 같은 순서)
  if (type === "lc" || type === "rc") return type;
  // 속성반 · 2주완성 — 두 과목을 이어 듣는 그릇 반
  if (isContainerProgram(s.course.program)) return "full";
  // 묶음 반(120 · 140분) — 같은 트랙에 안에 드는 시간 단위 반이 있다 (time-blocks 의 묶음 규칙)
  if (pool.some((c) => c !== s && c.track === s.track && blockContains(s.time_block, c.time_block))) return "full";
  // 한 교시(90분)보다 긴 한 구간 — 방학달 통짜 반. 두 과목을 이어 듣는다 (blockMinutes 의 90분 규칙)
  const span = parseTimeBlock(s.time_block);
  if (span && span.end - span.start > 90) return "full";
  // 시간 단위 반 = 강사 한 명의 한 과목. 과목 칸이 비면 모른다
  return isSubject(s.subject) ? s.subject : null;
}

/** 고르는 한 칸 = 시간대 × 요일 (주5일이면 월수금 + 화목금 두 반) */
type Unit = { block: string; track: EnrollTrack; sections: Usable[]; kind: EnrollKind | null };

/**
 * 반 한 묶음의 종합 · 단과. 모르는 반이 하나라도 있으면 모른다(null).
 * 모두 같은 과목이면 그 단과, 서로 다르면(주5일 60분 = 월수금 RC + 화목금 LC) 두 과목을 다 듣는 종합이다.
 */
function combine(kinds: readonly (EnrollKind | null)[]): EnrollKind | null {
  if (kinds.length === 0 || kinds.some((k) => k === null)) return null;
  return new Set(kinds).size === 1 ? kinds[0] : "full";
}

function unitsOf(sections: readonly EnrollSection[], term: string, courseId: number): Unit[] {
  const pool = poolOf(sections, term, courseId);
  const byBlock = new Map<string, Map<string, Usable>>();
  for (const s of pool) byBlock.set(s.time_block, (byBlock.get(s.time_block) ?? new Map<string, Usable>()).set(s.track, s));
  const units: Unit[] = [];
  const unit = (block: string, track: EnrollTrack, list: Usable[]): Unit => ({
    block,
    track,
    sections: list,
    kind: combine(list.map((s) => sectionKind(s, pool))),
  });
  for (const [block, byTrack] of byBlock) {
    const mwf = byTrack.get("mwf");
    const ttf = byTrack.get("ttf");
    if (mwf && ttf) units.push(unit(block, "week5", [mwf, ttf]));
    if (mwf) units.push(unit(block, "mwf", [mwf]));
    if (ttf) units.push(unit(block, "ttf", [ttf]));
  }
  return units;
}

/** 이 칸이 고른 종합 · 단과에 들어가나 — 고르지 않았거나 모르는 칸은 늘 들어간다 */
const fits = (u: Unit, kind: EnrollKind | null | undefined) => !kind || u.kind === null || u.kind === kind;

/** 열린 수강월 (이른 달부터) */
export function enrollTerms(sections: readonly EnrollSection[]): { key: string; label: string }[] {
  const keys = [...new Set(sections.filter(usable).map((s) => termKeyOf(s.term)))].sort();
  return keys.map((key) => ({ key, label: termLabelOf(key) }));
}

/** 그 달의 레벨(강좌). 점수보장반 → 스파르타반 → 2주완성반, 그 안에서는 목표 점수 순 */
export function enrollCourses(sections: readonly EnrollSection[], term: string) {
  const byId = new Map<number, NonNullable<EnrollSection["course"]>>();
  for (const s of sections) {
    if (!usable(s) || termKeyOf(s.term) !== term) continue;
    byId.set(s.course.id, s.course);
  }
  return [...byId.values()].sort(
    (a, b) =>
      programRank(a.program) - programRank(b.program) ||
      (a.target_score ?? 0) - (b.target_score ?? 0) ||
      a.name.localeCompare(b.name, "ko"),
  );
}

/**
 * 그 레벨의 종합 · 단과 (종합 → RC → LC). 열린 반에서 **가려지는 것만** 내놓는다 — 단과 반이 없는 레벨(속성반 · 2주완성)이나
 * 달(방학달 통짜 반)은 종합 하나라서 화면은 이 줄을 그리지 않는다. 하나도 못 가리면(과목을 아직 안 고른 달) 종합 하나로 두고
 * 예전처럼 모든 시간대를 보여 준다.
 */
export function enrollKinds(sections: readonly EnrollSection[], term: string, courseId: number): EnrollKind[] {
  const units = unitsOf(sections, term, courseId);
  if (units.length === 0) return [];
  const found = new Set(units.map((u) => u.kind));
  const out = ENROLL_KINDS.filter((k) => found.has(k));
  return out.length ? out : ["full"];
}

/** 그 강좌의 요일 (주5일 → 월수금 → 화목금). 같은 시간대에 두 트랙이 다 있으면 주5일도 고를 수 있다. kind 를 주면 그 종합 · 단과의 요일만 */
export function enrollTracks(sections: readonly EnrollSection[], term: string, courseId: number, kind?: EnrollKind | null): EnrollTrack[] {
  const units = unitsOf(sections, term, courseId).filter((u) => fits(u, kind));
  return (["week5", "mwf", "ttf"] as const).filter((t) => units.some((u) => u.track === t));
}

/** 그 요일에 실제로 열리는 시간대 (시작 시각 순). kind 를 주면 그 종합 · 단과의 시간대만 */
export function enrollBlocks(
  sections: readonly EnrollSection[],
  term: string,
  courseId: number,
  track: string,
  kind?: EnrollKind | null,
): string[] {
  return unitsOf(sections, term, courseId)
    .filter((u) => u.track === track && fits(u, kind))
    .map((u) => u.block)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * 시간대 칸의 분량 — "60분" · "120분" (묶음은 안에 든 시간 단위의 합 — `blockMinutes`). 종합 주5일에는 60분과 120분이 같은 시각에 함께 서서
 * 시각만으로는 갈리지 않는다. 쉬는 시간을 모르는 긴 한 구간(속성반 · 방학달 통짜 반)은 null.
 */
export function enrollBlockMinutes(sections: readonly EnrollSection[], term: string, courseId: number, block: string): number | null {
  const pool = poolOf(sections, term, courseId);
  if (pool.length === 0) return null;
  const tree = buildBlockTree(
    pool.map((s) => s.time_block),
    { nest: !isContainerProgram(pool[0].course.program) },
  );
  const node = flattenBlockTree(tree).find((n) => n.node.label === block)?.node;
  return node ? blockMinutes(node) : null;
}

/**
 * 고른 반들(같은 시간대 — 주5일이면 두 반)이 종합인지 단과인지 — 승인 팝업 · 승인 화면의 이름표 (`assignedLabels`).
 * all = 열린 반 전체 (묶음 반을 알아보는 데 쓴다). 모르면 null.
 */
export function kindOfSections(all: readonly EnrollSection[], picked: readonly EnrollSection[]): EnrollKind | null {
  const list = picked.filter(usable);
  if (list.length === 0) return null;
  return combine(list.map((s) => sectionKind(s, poolOf(all, termKeyOf(s.term), s.course.id))));
}

/**
 * 고른 것 → 실제 반 id. **서버가 학생이 보낸 값을 다시 푸는 곳이다** — 화면이 보낸 반 id 는 믿지 않는다.
 * 하나라도 비었거나 열린 반과 맞지 않으면 이유를 돌려준다 (그대로 학생에게 보여 준다).
 */
export function resolveEnrollChoice(sections: readonly EnrollSection[], choice: Partial<EnrollChoice>): ResolveResult {
  const { term, courseId, track, timeBlock } = choice;
  if (!term) return { ok: false, reason: "수강월을 골라 주세요." };
  if (!courseId) return { ok: false, reason: "레벨을 골라 주세요." };
  // 종합 · 단과 — 그 레벨에서 둘 이상 고를 수 있으면 꼭 골라야 한다 (화면과 같은 순서)
  const kind = isEnrollKind(choice.kind) ? choice.kind : null;
  if (choice.kind && !kind) return { ok: false, reason: "종합반인지 단과인지 다시 골라 주세요." };
  if (!kind && enrollKinds(sections, term, courseId).length > 1) return { ok: false, reason: "종합반인지 단과인지 골라 주세요." };
  if (!track) return { ok: false, reason: "요일을 골라 주세요." };
  if (!timeBlock) return { ok: false, reason: "시간대를 골라 주세요." };

  const matched = sections.filter(
    (s) => usable(s) && termKeyOf(s.term) === term && s.course!.id === courseId && s.time_block === timeBlock,
  );
  const byTrack = new Map(matched.map((s) => [s.track, s.id]));

  let sectionIds: number[];
  if (track === "week5") {
    const mwf = byTrack.get("mwf");
    const ttf = byTrack.get("ttf");
    // 주5일은 두 반이 함께 있어야 한 등록이다 — 한쪽만 있으면 주3일이라 이름부터 틀렸다 (도메인 규칙 1)
    if (mwf === undefined || ttf === undefined) {
      return { ok: false, reason: "고르신 시간대에는 주5일 반이 열려 있지 않아요. 요일을 다시 골라 주세요." };
    }
    sectionIds = [mwf, ttf];
  } else {
    const one = byTrack.get(track);
    if (one === undefined) {
      return { ok: false, reason: "고르신 레벨·요일·시간대에 열린 반이 없어요. 다시 골라 주세요." };
    }
    sectionIds = [one];
  }

  // 고른 종합 · 단과와 반이 맞는가 — RC단과를 골라 놓고 LC 시간을 보내면(열어 둔 옛 화면 · 손으로 만든 요청) 받지 않는다
  if (kind) {
    const unit = unitsOf(sections, term, courseId).find((u) => u.block === timeBlock && u.track === track);
    if (unit && !fits(unit, kind)) {
      return { ok: false, reason: `고르신 시간대는 ${KIND_CHOICE_LABEL[kind]} 수업이 아니에요. 시간대를 다시 골라 주세요.` };
    }
  }
  return { ok: true, sectionIds };
}
