import { isMaterialSubject, MATERIAL_SUBJECT_LABEL, MATERIAL_SUBJECTS, noteHasText, type MaterialSubject } from "./class-materials";
import { scopeLabel } from "./class-notices";
import { isRoundSet, ROUND_MAX, ROUND_SET_LABEL, type RoundSet } from "./class-rounds";
import { noteImagePaths } from "./note-format";
import { normalizeLevels, normalizeSet, normalizeSubject, type BoardCell } from "./staff-board";

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
 *  - `photo` 본문에 사진이 있다: 회차 자료 안내에는 사진을 넣을 수 없다 (공지사항은 된다)
 *  - `empty` 본문 · 파일 · 링크가 다 없다: 회차 자료는 셋 중 하나가 있어야 한다 (`saveClassMaterial` 과 같은 규칙)
 */
export type MaterialIssue = "photo" | "empty";

export function materialMoveIssue(post: { body: string; files: number; links: number }): MaterialIssue | null {
  if (noteImagePaths(post.body).length > 0) return "photo";
  if (post.files + post.links === 0 && !noteHasText(post.body)) return "empty";
  return null;
}

const MATERIAL_BLOCK: Record<MaterialIssue, string> = {
  photo: "본문에 사진이 있어 회차 자료로는 옮길 수 없어요 — 회차 자료 안내에는 사진을 넣을 수 없어요. 공지사항으로 옮겨 주세요.",
  empty: "본문 · 파일 · 링크가 없는 글은 회차 자료로 옮길 수 없어요.",
};

/** 하나 옮기기 대화창 · 서버 액션의 말 (`materialMoveIssue` 의 긴 글) */
export function materialMoveBlock(post: { body: string; files: number; links: number }): string | null {
  const issue = materialMoveIssue(post);
  return issue ? MATERIAL_BLOCK[issue] : null;
}

/**
 * 옮기기 대화창이 처음 고를 값 — 원래 자리가 있으면 그것, 없으면 글의 레벨 · 과목으로 공지사항 (회차 자료는 레벨이 하나일 때만 레벨을 미리 고르고,
 * 과목 · 과정은 글의 것 — 2026-10-21 직원 게시판 과목 · 과정)
 */
export type MoveDraft = {
  kind: "notice" | "material";
  notice: { levels: number[]; subjects: MaterialSubject[] };
  material: { level: number | null; subject: MaterialSubject | null; set: RoundSet | null; seq: number | null };
};

export function moveDraftOf(
  post: { levels: readonly number[]; moved_from: unknown; subject?: string | null; book_set?: string | null },
  knownLevels: readonly number[],
): MoveDraft {
  const levels = normalizeLevels(post.levels).filter((l) => knownLevels.includes(l));
  const from = movedFromOf(post.moved_from);
  const single = levels.length === 1 ? levels[0] : null;
  const subject = normalizeSubject(post.subject);
  const draft: MoveDraft = {
    kind: "notice",
    notice: { levels, subjects: subject ? [subject] : [] },
    material: { level: single, subject, set: normalizeSet(post.book_set), seq: null },
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

/*
 * ── 여러 개 한꺼번에 옮기기 (2026-10-21 Alan — "자료를 넘길때 여러개를 한번에 선택해서 넘길수 있도록 하면 좋겠어. 그리고 전체선택도 같이 만들어줘") ──
 * 화면이 고른 것을 **하나씩 차례로** 옮긴다 — 하나 옮기기와 같은 서버 액션이라 규칙 · 되돌리기가 그대로고, 한 번에 하나라 서버 시간(60초)에 걸리지 않으며,
 * 중간에 하나가 실패해도 나머지는 옮기고 실패한 것만 남는다. 직원 글 → 수업자료실은 옮길 곳을 한 번 고른다:
 *  - 공지사항 — 고른 범위로 글마다 공지 하나씩
 *  - 회차 자료 — 고른 회차에 모두 (그 회차의 끝에 차례로 선다)
 *  - 원래 자리로 — 수업자료실에서 옮겨 온 글은 글마다 옮겨 오기 전 자리로 (직원 게시판에서 쓴 글은 건너뛴다)
 * 회차 자료로 못 가는 글(사진 · 빈 글)은 건너뛰고 까닭을 적는다. 순서는 오래된 글부터 — 같은 회차에 들어가면 쓴 순서대로 선다.
 */

/** 직원 게시판에서 고른 글 — 일괄 옮기기 계획에 쓰는 것만 (본문은 서버가 읽어 `materialIssue` 로 줄인다) */
export type BulkPost = {
  id: number;
  title: string;
  levels: number[];
  /** 글의 과목 · 과정 (비우면 둘 다 — 2026-10-21) */
  subject: MaterialSubject | null;
  set: RoundSet | null;
  /** 수업자료실에서 옮겨 온 글의 원래 자리 */
  movedFrom: MovedFrom | null;
  /** 회차 자료로 못 가는 까닭 */
  materialIssue: MaterialIssue | null;
};

/** 여러 개를 어디로 — 공지사항(같은 범위) · 회차 자료(같은 회차) · 원래 자리로(글마다) */
export type BulkChoice = MoveTarget | { kind: "origin" };

/** 글 하나의 옮길 곳 — `target` 이 null 이면 건너뛰고 `skip` 이 까닭이다 */
export type BulkStep = { id: number; title: string; target: MoveTarget | null; skip: string | null };

/** 건너뛰는 까닭 — 목록 한 줄에 들어가게 짧게 */
/** 옮기기 서버 액션이 답 없이 끝났을 때(연결 끊김 · 시간 초과) — 서버에서는 끝났을 수 있어 확인부터 하게 한다 */
export const MOVE_THROWN = "옮기지 못했어요. 인터넷 연결을 확인해 주세요 — 화면을 새로 받았으니 이미 옮겨졌는지 본 뒤 다시 해 주세요.";

export const BULK_SKIP = {
  photo: "본문에 사진이 있어 회차 자료로는 못 가요 (공지사항으로는 돼요).",
  empty: "본문 · 파일 · 링크가 없어 회차 자료로는 못 가요.",
  noOrigin: "직원 게시판에서 쓴 글이라 원래 자리가 없어요.",
  noRound: "원래 자리가 과정 · 회차를 정하기 전의 자료라 돌아갈 회차가 없어요.",
  levelGone: "원래 자리의 레벨이 지금 레벨 목록에 없어요.",
  gone: "이미 옮겨졌거나 지워진 글이에요.",
} as const;

/**
 * 원래 자리 → 다시 옮길 곳. 돌아갈 수 없으면 까닭 (`BULK_SKIP` 의 열쇠).
 * 공지는 지금 레벨 목록에 있는 레벨만 남긴다 — 원래 레벨이 **모두** 없어졌으면 돌아가지 않는다 (범위가 비면 전체 공지가 되어 더 넓게 보인다).
 */
export function originTargetOf(from: MovedFrom, knownLevels: readonly number[]): { target: MoveTarget } | { skip: keyof typeof BULK_SKIP } {
  if (from.kind === "notice") {
    const levels = from.levels.filter((l) => knownLevels.includes(l));
    if (from.levels.length > 0 && levels.length === 0) return { skip: "levelGone" };
    return { target: { kind: "notice", levels, subjects: from.subjects } };
  }
  if (!from.set || !from.seq) return { skip: "noRound" };
  if (!knownLevels.includes(from.level)) return { skip: "levelGone" };
  return { target: { kind: "material", level: from.level, subject: from.subject, set: from.set, seq: from.seq } };
}

/** 고른 글마다 옮길 곳 · 건너뛸 까닭 (순서는 받은 그대로 — 서버가 오래된 글부터 준다) */
export function bulkSteps(posts: readonly BulkPost[], choice: BulkChoice, knownLevels: readonly number[]): BulkStep[] {
  return posts.map((p) => {
    const skip = (key: keyof typeof BULK_SKIP): BulkStep => ({ id: p.id, title: p.title, target: null, skip: BULK_SKIP[key] });
    let target: MoveTarget;
    if (choice.kind === "origin") {
      if (!p.movedFrom) return skip("noOrigin");
      const back = originTargetOf(p.movedFrom, knownLevels);
      if ("skip" in back) return skip(back.skip);
      target = back.target;
    } else {
      target = choice;
    }
    if (target.kind === "material" && p.materialIssue) return skip(p.materialIssue);
    return { id: p.id, title: p.title, target, skip: null };
  });
}

/** 여러 개 옮기기 대화창이 처음 고를 값 */
export type BulkDraft = Omit<MoveDraft, "kind"> & { kind: "notice" | "material" | "origin" };

const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, k) => x === b[k]);

/**
 * 처음 고를 값 — 모두 수업자료실에서 옮겨 온 글이고 다 돌아갈 수 있으면 `원래 자리로`, 아니면 공지사항.
 * 공지 범위는 고른 글의 레벨이 모두 같으면 그 레벨(모두 `모든 레벨` 이면 전체), 다르면 보던 탭의 레벨.
 * 과목도 같다 — 글의 과목이 모두 같으면 그것(모두 비웠으면 RC · LC 둘 다), 다르면 보던 칸의 과목 (2026-10-21 과목 · 과정).
 * 회차 자료는 원래 자리가 모두 같은 회차면 그 회차, 아니면 레벨 (글의 레벨이 모두 같은 하나면 그것, 아니면 보던 탭) · 과목 · 과정
 * (글의 것이 모두 같은 하나면 그것, 아니면 보던 칸의 것 — 회차 자료는 과목 · 과정을 꼭 골라야 해서 비운 글도 보던 칸으로).
 */
export function bulkDraftOf(posts: readonly BulkPost[], tabLevel: number | null, knownLevels: readonly number[], tabCell?: BoardCell | null): BulkDraft {
  const levelSets = posts.map((p) => normalizeLevels(p.levels).filter((l) => knownLevels.includes(l)));
  const tab = tabLevel !== null && knownLevels.includes(tabLevel) ? tabLevel : null;
  const sameLevels = levelSets.length > 0 && levelSets.every((l) => sameList(l, levelSets[0]));
  const single = sameLevels && levelSets[0].length === 1 ? levelSets[0][0] : null;
  /** 글의 값이 모두 같으면 그 값(비운 것도 하나의 값), 다르면 undefined */
  const shared = <T,>(values: readonly T[]): T | undefined => (values.length > 0 && values.every((v) => v === values[0]) ? values[0] : undefined);
  const subjects = shared(posts.map((p) => p.subject));
  const sets = shared(posts.map((p) => p.set));
  const noticeSubject = subjects !== undefined ? subjects : (tabCell?.subject ?? null);
  const draft: BulkDraft = {
    kind: "notice",
    notice: { levels: sameLevels ? levelSets[0] : tab !== null ? [tab] : [], subjects: noticeSubject ? [noticeSubject] : [] },
    material: { level: single ?? tab ?? knownLevels[0] ?? null, subject: subjects ?? tabCell?.subject ?? null, set: sets ?? tabCell?.set ?? null, seq: null },
  };
  const backs = posts.map((p) => (p.movedFrom ? originTargetOf(p.movedFrom, knownLevels) : null));
  const targets = backs.map((b) => (b && "target" in b ? b.target : null));
  const rounds = targets.filter((t): t is Extract<MoveTarget, { kind: "material" }> => t?.kind === "material");
  if (rounds.length === posts.length && rounds.length > 0 && rounds.every((r) => r.level === rounds[0].level && r.subject === rounds[0].subject && r.set === rounds[0].set && r.seq === rounds[0].seq)) {
    const r = rounds[0];
    draft.material = { level: r.level, subject: r.subject, set: r.set, seq: r.seq };
  }
  if (posts.length > 0 && bulkSteps(posts, { kind: "origin" }, knownLevels).every((s) => s.target)) draft.kind = "origin";
  return draft;
}

/** 끝난 뒤 한 줄 — `3개를 옮겼어요. 1개는 옮기지 못했어요. 2개는 건너뛰었어요.` */
export function bulkSummary(r: { moved: number; failed: number; skipped: number; notRun: number }): string {
  const parts = [
    r.moved > 0 ? `${r.moved}개를 옮겼어요.` : "옮긴 것이 없어요.",
    r.failed > 0 ? `${r.failed}개는 옮기지 못했어요.` : null,
    r.skipped > 0 ? `${r.skipped}개는 건너뛰었어요.` : null,
    r.notRun > 0 ? `멈춰서 ${r.notRun}개는 옮기지 않았어요.` : null,
  ];
  return parts.filter(Boolean).join(" ");
}
