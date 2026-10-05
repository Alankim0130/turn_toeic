import { charCount } from "./class-materials";
import { noteImagePaths } from "./note-format";
import { MATERIAL_NOTE_MAX } from "./study-rounds";
import { MB } from "./upload";

/**
 * 비대면 자료 회차 안내 — 수업자료실 공지와 같은 편집기 (2026-10-05 Alan — "관리자모드에서 비대면자료 설정하는곳에 안내 부분도 같은설정으로 넣어줘.
 * 전체공개, 레벨별 이부분 빼고"). 서식 · 줄 정렬 · 사진 · 사진 크기는 공지와 같고, 범위(전체 · 레벨 · RC/LC)만 없다 — 비대면 자료는 그 달 비대면스터디 신청자의 것이다.
 *
 * - 글은 꺾쇠 태그 글(`note-format.ts`)이고 자료실(`study_material_items.note`)에 한 번 적으면 그 달 적용분(`study_materials.note`)으로 복사된다.
 * - 사진은 버킷 `study-materials` 의 `notes/` 폴더. 학생은 **그 사진을 품은 안내가 보일 때만** 서명 주소를 만든다 (저장소 조회 정책, 마이그레이션 20261005180000).
 * - 고치면서 뺀 사진 · 지운 회차의 사진은 **아무 안내도 가리키지 않을 때만** 지운다 — 끝난 달 적용분은 그때 안내 그대로 남기 때문이다 (`removeIfUnused` 와 같은 규칙).
 */
export const STUDY_MATERIAL_BUCKET = "study-materials";
export const MATERIAL_NOTE_IMAGE_FOLDER = "notes/";
export const MATERIAL_NOTE_IMAGE_MAX_BYTES = 10 * MB;
export const MATERIAL_NOTE_IMAGE_MAX_COUNT = 30;

/** 우리가 올린 사진 경로만 — `notes/` + 무작위 이름(objectName) + 확장자. 찾을 때 LIKE 에 그대로 넣으므로 와일드카드가 들어갈 수 없는 꼴만 받는다 */
const NOTE_IMAGE_PATH = /^notes\/[a-z0-9-]{1,64}(\.[a-z0-9]{1,8})?$/;
export const isMaterialNoteImage = (path: string) => NOTE_IMAGE_PATH.test(path);

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 저장 전 검사 — 폼(파일을 올리기 전에)과 서버 액션이 같은 말을 쓴다. 문제 없으면 null */
export function materialNoteError(note: string): string | null {
  const n = charCount(note);
  if (n > MATERIAL_NOTE_MAX) return `안내가 ${fmt(MATERIAL_NOTE_MAX)}자를 넘어요 (${fmt(n)}자). 줄이거나 나눠 주세요.`;
  const images = noteImagePaths(note);
  if (images.some((p) => !isMaterialNoteImage(p))) return "사진 정보가 올바르지 않아요. 사진을 다시 넣어 주세요.";
  if (images.length > MATERIAL_NOTE_IMAGE_MAX_COUNT) return `사진은 한 회차 안내에 ${MATERIAL_NOTE_IMAGE_MAX_COUNT}장까지 넣을 수 있어요.`;
  return null;
}

/** 고치면서 빠진 사진 — 저장소에서 지울 후보 (다른 안내가 아직 가리키면 지우지 않는다 — 서버 액션이 다시 본다) */
export function droppedNoteImages(before: string | null | undefined, after: string | null | undefined): string[] {
  const kept = new Set(noteImagePaths(after ?? ""));
  return noteImagePaths(before ?? "").filter((p) => !kept.has(p) && isMaterialNoteImage(p));
}
