import { WEEK5_LABEL } from "./week5";

/**
 * 수동 등업신청에서 학생이 고르는 **수강월 → 레벨 → 요일 → 시간대** (2026-09-17 Alan 요청
 * "수강증 업로드 + 레벨 / 요일 / 시간대", "하나라도 빠지면 제출이 안되도록").
 *
 * 선택지는 전부 **열려 있는 반(`class_sections`)에서 만든다** — 레벨·시간대를 코드에 적지 않는다 (작업 원칙 4).
 * 그래서 반 편성이 바뀌면 고를 수 있는 것도 따라 바뀌고, 열리지도 않은 반은 애초에 고를 수 없다.
 *
 * **수강월이 여러 달 열려 있을 수 있다** — 개강 전에도 올릴 수 있어서(도메인 규칙 5) 이번 달과 다음 달이
 * 함께 열린다. 한 달만 열려 있으면 화면에서 고르는 칸을 만들지 않고 그대로 쓴다.
 *
 * 같은 규칙을 **화면(고르기)과 서버(검사)가 함께 쓴다** — 화면이 보낸 반 id 를 믿지 않고
 * 서버가 `resolveEnrollChoice` 로 다시 푼다.
 */

export type EnrollSection = {
  id: number;
  track: string;
  time_block: string | null;
  term: { year: number; month: number } | null;
  course: { id: number; name: string; program: string; target_score: number | null } | null;
};

/** 요일 선택지. 주5일은 같은 (기수·강좌·시간대)의 월수금 + 화목금 두 반이다 (도메인 규칙 1) */
export type EnrollTrack = "mwf" | "ttf" | "week5";

export type EnrollChoice = {
  term: string;
  courseId: number;
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

/** 고를 수 있는 반만 남긴다 — 시간대 라벨이 없는 반은 학생이 알아볼 수 없어 뺀다 */
const usable = (s: EnrollSection) => !!s.course && !!s.time_block && !!s.term;

/** 열린 수강월 (이른 달부터) */
export function enrollTerms(sections: readonly EnrollSection[]): { key: string; label: string }[] {
  const keys = [...new Set(sections.filter(usable).map((s) => termKeyOf(s.term)))].sort();
  return keys.map((key) => ({ key, label: termLabelOf(key) }));
}

/** 그 달의 레벨(강좌). 점수보장반 먼저, 그 안에서는 목표 점수 순 */
export function enrollCourses(sections: readonly EnrollSection[], term: string) {
  const byId = new Map<number, NonNullable<EnrollSection["course"]>>();
  for (const s of sections) {
    if (!usable(s) || termKeyOf(s.term) !== term) continue;
    byId.set(s.course!.id, s.course!);
  }
  return [...byId.values()].sort(
    (a, b) =>
      (a.program === b.program ? 0 : a.program === "score" ? -1 : 1) ||
      (a.target_score ?? 0) - (b.target_score ?? 0) ||
      a.name.localeCompare(b.name, "ko"),
  );
}

/** 그 강좌의 요일. 같은 시간대에 두 트랙이 다 있으면 주5일도 고를 수 있다 */
export function enrollTracks(sections: readonly EnrollSection[], term: string, courseId: number): EnrollTrack[] {
  const byBlock = new Map<string, Set<string>>();
  for (const s of sections) {
    if (!usable(s) || termKeyOf(s.term) !== term || s.course!.id !== courseId) continue;
    byBlock.set(s.time_block!, (byBlock.get(s.time_block!) ?? new Set()).add(s.track));
  }
  const all = [...byBlock.values()];
  const out: EnrollTrack[] = [];
  if (all.some((t) => t.has("mwf") && t.has("ttf"))) out.push("week5");
  if (all.some((t) => t.has("mwf"))) out.push("mwf");
  if (all.some((t) => t.has("ttf"))) out.push("ttf");
  return out;
}

/** 그 요일에 실제로 열리는 시간대 (시작 시각 순) */
export function enrollBlocks(sections: readonly EnrollSection[], term: string, courseId: number, track: string): string[] {
  const byBlock = new Map<string, Set<string>>();
  for (const s of sections) {
    if (!usable(s) || termKeyOf(s.term) !== term || s.course!.id !== courseId) continue;
    byBlock.set(s.time_block!, (byBlock.get(s.time_block!) ?? new Set()).add(s.track));
  }
  const ok = (t: Set<string>) => (track === "week5" ? t.has("mwf") && t.has("ttf") : t.has(track));
  return [...byBlock.entries()]
    .filter(([, t]) => ok(t))
    .map(([b]) => b)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * 고른 것 → 실제 반 id. **서버가 학생이 보낸 값을 다시 푸는 곳이다** — 화면이 보낸 반 id 는 믿지 않는다.
 * 하나라도 비었거나 열린 반과 맞지 않으면 이유를 돌려준다 (그대로 학생에게 보여 준다).
 */
export function resolveEnrollChoice(sections: readonly EnrollSection[], choice: Partial<EnrollChoice>): ResolveResult {
  const { term, courseId, track, timeBlock } = choice;
  if (!term) return { ok: false, reason: "수강월을 골라 주세요." };
  if (!courseId) return { ok: false, reason: "레벨을 골라 주세요." };
  if (!track) return { ok: false, reason: "요일을 골라 주세요." };
  if (!timeBlock) return { ok: false, reason: "시간대를 골라 주세요." };

  const matched = sections.filter(
    (s) => usable(s) && termKeyOf(s.term) === term && s.course!.id === courseId && s.time_block === timeBlock,
  );
  const byTrack = new Map(matched.map((s) => [s.track, s.id]));

  if (track === "week5") {
    const mwf = byTrack.get("mwf");
    const ttf = byTrack.get("ttf");
    // 주5일은 두 반이 함께 있어야 한 등록이다 — 한쪽만 있으면 주3일이라 이름부터 틀렸다 (도메인 규칙 1)
    if (mwf === undefined || ttf === undefined) {
      return { ok: false, reason: "고르신 시간대에는 주5일 반이 열려 있지 않아요. 요일을 다시 골라 주세요." };
    }
    return { ok: true, sectionIds: [mwf, ttf] };
  }

  const one = byTrack.get(track);
  if (one === undefined) {
    return { ok: false, reason: "고르신 레벨·요일·시간대에 열린 반이 없어요. 다시 골라 주세요." };
  }
  return { ok: true, sectionIds: [one] };
}
