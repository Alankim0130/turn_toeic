import { isMaterialSubject, MATERIAL_SUBJECT_LABEL, MATERIAL_SUBJECTS, noteHasText, type MaterialSubject } from "./class-materials";
import { scopeLabel } from "./class-notices";
import { isRoundSet, ROUND_MAX, ROUND_SET_LABEL, type RoundSet } from "./class-rounds";
import { noteImagePaths } from "./note-format";
import { normalizeLevels } from "./staff-board";

/**
 * 직원 게시판 ↔ 수업자료실 옮기기 (2026-10-21 Alan — "이 게시물을 수업게시판으로 옮길 수 있으면 좋겠어. 반대로 수업게시물에 있는 내용을
 * 다시 직원게시판으로 옮길 수 도 있어야해").
 *
 * - **직원 글 → 수업자료실** 은 두 곳 중 하나로 간다 — 공지사항(범위 레벨 × RC/LC, 학생에게 바로 보인다) · 회차 자료(레벨 × 과목 × 과정 × 회차,
 *   그 반의 회차 수업일부터 보인다). 회차 자료 안내에는 사진을 넣을 수 없어 **사진이 든 글은 공지사항으로만** 간다 (`materialMoveBlock`).
 * - **공지 · 회차 자료 → 직원 게시판** — 레벨은 공지의 레벨 · 자료의 레벨 그대로, 원래 자리는 `staff_posts.moved_from` 에 적어 두고
 *   다시 옮길 때 미리 골라 둔다 (회차 번호를 잊어 엉뚱한 회차에 올리지 않게).
 * - 강사 · 관리자만 옮긴다 (수업자료실은 강사 · 관리자 화면이다). **옮긴 사람이 글쓴이가 된다** — 직원 글 쓰기 트리거가 그렇게 적고,
 *   공지도 같은 규칙으로 맞췄다 (학생에게 조교 이름이 가지 않는다 — 숙제 알림과 같은 까닭). 올린 시각도 옮긴 때다.
 * - 사진 · 파일은 저장소에서 새 이름으로 **복사**한 뒤 새 행을 만들고, 그다음 원래 행 · 원래 파일을 지운다. 실패하면 만든 것을 되돌린다
 *   (`src/app/admin/board/move-actions.ts`).
 */

/** 옮길 곳 — 공지사항 또는 회차 자료 */
export type MoveTarget =
  | { kind: "notice"; levels: number[]; subjects: MaterialSubject[] }
  | { kind: "material"; level: number; subject: MaterialSubject; set: RoundSet; seq: number };

/** 수업자료실에서 옮겨 온 글의 원래 자리 — 과정 · 회차가 정해지기 전에 올린 옛 자료는 둘이 비어 있다 */
export type MovedFrom =
  | { kind: "notice"; levels: number[]; subjects: MaterialSubject[] }
  | { kind: "material"; level: number; subject: MaterialSubject; set: RoundSet | null; seq: number | null };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const subjectsOf = (raw: unknown): MaterialSubject[] => {
  const picked = Array.isArray(raw) ? MATERIAL_SUBJECTS.filter((s) => raw.includes(s)) : [];
  // 둘 다 고르면 "둘 다" 와 같다 — 공지 저장과 같은 모양(비운 배열)으로
  return picked.length >= 2 ? [] : picked;
};
const seqOf = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= ROUND_MAX ? n : null;
};
const levelOf = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** 화면이 보낸 옮길 곳 → 꼴이 맞을 때만 (레벨이 목록에 있는지는 `moveTargetError` 가 본다) */
export function moveTargetOf(raw: unknown): MoveTarget | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "notice") {
    return { kind: "notice", levels: normalizeLevels(Array.isArray(raw.levels) ? raw.levels : []), subjects: subjectsOf(raw.subjects) };
  }
  if (raw.kind === "material") {
    const level = levelOf(raw.level);
    const seq = seqOf(raw.seq);
    if (level === null || !isMaterialSubject(raw.subject) || !isRoundSet(raw.set) || seq === null) return null;
    return { kind: "material", level, subject: raw.subject, set: raw.set, seq };
  }
  return null;
}

/** 옮길 곳의 레벨이 레벨 목록(lc_levels)에 있나 — 문제 없으면 null */
export function moveTargetError(target: MoveTarget, knownLevels: readonly number[]): string | null {
  if (target.kind === "notice") return target.levels.some((l) => !knownLevels.includes(l)) ? "레벨을 다시 골라 주세요." : null;
  return knownLevels.includes(target.level) ? null : "레벨을 다시 골라 주세요.";
}

/** DB 의 moved_from → 꼴이 맞으면 원래 자리, 아니면 null (표시 · 미리 고르기에만 쓴다 — 틀린 값은 버린다) */
export function movedFromOf(raw: unknown): MovedFrom | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "notice") {
    return { kind: "notice", levels: normalizeLevels(Array.isArray(raw.levels) ? raw.levels : []), subjects: subjectsOf(raw.subjects) };
  }
  if (raw.kind === "material") {
    const level = levelOf(raw.level);
    if (level === null || !isMaterialSubject(raw.subject)) return null;
    return { kind: "material", level, subject: raw.subject, set: isRoundSet(raw.set) ? raw.set : null, seq: seqOf(raw.seq) };
  }
  return null;
}

/** 수업자료실 자리 이름 — `650 RC A과정 3회차` · `650 RC 자료`(과정 · 회차 미정) · `공지 (650 · 750 RC)` · `공지 (전체)` */
export function classPlaceLabel(place: MovedFrom | MoveTarget): string {
  if (place.kind === "notice") return `공지 (${scopeLabel({ levels: place.levels, subjects: place.subjects })})`;
  const head = `${place.level} ${MATERIAL_SUBJECT_LABEL[place.subject]}`;
  return place.set && place.seq ? `${head} ${ROUND_SET_LABEL[place.set]} ${place.seq}회차` : `${head} 자료`;
}

/** 직원 글 화면의 한 줄 — `수업자료실 650 RC A과정 3회차에서 옮겨 온 글` */
export const movedFromLabel = (m: MovedFrom) => `수업자료실 ${classPlaceLabel(m)}에서 옮겨 온 글`;

/**
 * 회차 자료로 옮길 수 없는 까닭 — 없으면 null.
 *  - 본문에 사진이 있다: 회차 자료 안내에는 사진을 넣을 수 없다 (공지사항은 된다)
 *  - 본문 · 파일 · 링크가 다 없다: 회차 자료는 셋 중 하나가 있어야 한다 (`saveClassMaterial` 과 같은 규칙)
 */
export function materialMoveBlock(post: { body: string; files: number; links: number }): string | null {
  if (noteImagePaths(post.body).length > 0) return "본문에 사진이 있어 회차 자료로는 옮길 수 없어요 — 회차 자료 안내에는 사진을 넣을 수 없어요. 공지사항으로 옮겨 주세요.";
  if (post.files + post.links === 0 && !noteHasText(post.body)) return "본문 · 파일 · 링크가 없는 글은 회차 자료로 옮길 수 없어요.";
  return null;
}

/** 옮기기 대화창이 처음 고를 값 — 원래 자리가 있으면 그것, 없으면 글의 레벨로 공지사항 (회차 자료는 레벨이 하나일 때만 미리 고른다) */
export type MoveDraft = {
  kind: "notice" | "material";
  notice: { levels: number[]; subjects: MaterialSubject[] };
  material: { level: number | null; subject: MaterialSubject | null; set: RoundSet | null; seq: number | null };
};

export function moveDraftOf(post: { levels: readonly number[]; moved_from: unknown }, knownLevels: readonly number[]): MoveDraft {
  const levels = normalizeLevels(post.levels).filter((l) => knownLevels.includes(l));
  const from = movedFromOf(post.moved_from);
  const single = levels.length === 1 ? levels[0] : null;
  const draft: MoveDraft = {
    kind: "notice",
    notice: { levels, subjects: [] },
    material: { level: single, subject: null, set: null, seq: null },
  };
  if (from?.kind === "notice") {
    draft.notice = { levels: from.levels.filter((l) => knownLevels.includes(l)), subjects: from.subjects };
  } else if (from?.kind === "material") {
    draft.kind = "material";
    draft.material = { level: knownLevels.includes(from.level) ? from.level : single, subject: from.subject, set: from.set, seq: from.seq };
  }
  return draft;
}

/** 저장소 복사 계획 한 줄 — 원래 경로 → 새 경로 (다른 버킷 · 새 무작위 이름) */
export type CopyStep = { from: string; to: string };

/** 사진 경로를 새 경로로 바꾸는 표 — 글 속 그림 태그를 고칠 때 (`rewriteNoteImages`) */
export const pathMap = (steps: readonly CopyStep[]) => new Map(steps.map((s) => [s.from, s.to]));
