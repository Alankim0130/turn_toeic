import { MATERIAL_SUBJECT_LABEL, isMaterialSubject, type MaterialSubject } from "./class-materials";
import { charCount } from "./class-materials";
import { noteImagePaths } from "./note-format";
import { MB } from "./upload";

/**
 * 수업자료실 공지사항 (2026-10-05 Alan — "수업자료실에서 1회차 앞에 공지사항을 올릴 수 있는 곳이 있으면 좋겠어. … 여러개" ·
 * "안내글에서 쓰는 글 편집기능이 다 들어가면 좋겠어. 추가적으로 이미지도 중간에 추가 … 블로그랑 같다고 생각하면" ·
 * 범위 "강사가 직접 지정할 수 있으면 좋겠어. 전체공지인지, 레벨별이라면 레벨을 선택, RC LC도 선택" · "해당 공지 페이지가 새로 열리면 좋겠어").
 *
 * - 범위 = levels(비우면 모든 레벨) × subjects(비우면 RC · LC 둘 다). 둘 다 비우면 **전체 공지**.
 * - 학생에게 보이는 규칙은 DB 정책(`class_notices: 범위 수강생·스태프 조회`, 마이그레이션 20261005160000)과 같다 — `noticeVisible`. **바꾸면 둘 다.**
 *   지금 수강 중(개강일~종강일)이어야 하고, 범위 공지는 내 과정 칸('650:rc:A') 중 하나가 레벨 · 과목에 맞아야 한다 — RC 단과에게 LC 공지는 없다.
 * - 본문은 수업자료실 안내와 같은 서식 글(`note-format.ts`)이고 그림은 버킷 `class-notices` 의 `images/…` 경로로 든다.
 */

export const CLASS_NOTICE_BUCKET = "class-notices";
export const CLASS_NOTICE_IMAGE_FOLDER = "images/";
export const CLASS_NOTICE_TITLE_MAX = 100;
export const CLASS_NOTICE_BODY_MAX = 50_000;
/** 버킷 한도 (마이그레이션 file_size_limit) */
export const CLASS_NOTICE_IMAGE_MAX_BYTES = 10 * MB;
export const CLASS_NOTICE_IMAGE_MAX_COUNT = 30;

export type NoticeScope = { levels: number[]; subjects: MaterialSubject[] };

/** 이 공지가 그 학생에게 보이나 — DB 정책과 같은 규칙. cells = 내 과정 칸 'level:subject:set', enrolled = 지금 수강 중 */
export function noticeVisible(scope: NoticeScope, cells: string[], enrolled: boolean): boolean {
  if (!enrolled) return false;
  if (scope.levels.length === 0 && scope.subjects.length === 0) return true;
  return cells.some((cell) => {
    const [level, subject] = cell.split(":");
    return (scope.levels.length === 0 || scope.levels.includes(Number(level))) && (scope.subjects.length === 0 || scope.subjects.includes(subject as MaterialSubject));
  });
}

/** 관리자 화면 — 지금 보고 있는 레벨 · 과목 학생에게도 보이는 공지인가 */
export const noticeCovers = (scope: NoticeScope, level: number, subject: MaterialSubject) =>
  (scope.levels.length === 0 || scope.levels.includes(level)) && (scope.subjects.length === 0 || scope.subjects.includes(subject));

/** 범위 이름 — `전체` · `650` · `650 · 750 LC` · `RC 전체` */
export function scopeLabel(scope: NoticeScope): string {
  const lv = [...scope.levels].sort((a, b) => a - b).join(" · ");
  const sub = scope.subjects.length === 1 ? MATERIAL_SUBJECT_LABEL[scope.subjects[0]] : "";
  if (!lv && !sub) return "전체";
  if (!lv) return `${sub} 전체`;
  return sub ? `${lv} ${sub}` : lv;
}

/** DB 에서 읽은 행 → 범위 (모르는 값은 버린다) */
export const scopeOf = (row: { levels: number[] | null; subjects: string[] | null }): NoticeScope => ({
  levels: (row.levels ?? []).filter((l) => Number.isInteger(l)),
  subjects: (row.subjects ?? []).filter(isMaterialSubject),
});

/** 저장 전 검사 — 서버 액션과 폼이 같은 말을 쓴다. 문제 없으면 null */
export function noticeError(input: { title: string; body: string; levels: number[]; subjects: string[] }, knownLevels: number[]): string | null {
  const title = input.title.trim();
  if (!title) return "제목을 적어 주세요.";
  if (charCount(title) > CLASS_NOTICE_TITLE_MAX) return `제목은 ${CLASS_NOTICE_TITLE_MAX}자 이내로 적어 주세요.`;
  const n = charCount(input.body);
  if (n > CLASS_NOTICE_BODY_MAX) return `본문이 ${CLASS_NOTICE_BODY_MAX.toLocaleString("ko-KR")}자를 넘어요 (${n.toLocaleString("ko-KR")}자).`;
  if (input.levels.some((l) => !knownLevels.includes(l))) return "레벨을 다시 골라 주세요.";
  if (input.subjects.some((s) => !isMaterialSubject(s))) return "RC · LC 를 다시 골라 주세요.";
  if (noteImagePaths(input.body).some((p) => !p.startsWith(CLASS_NOTICE_IMAGE_FOLDER) || p.includes(".."))) return "사진 정보가 올바르지 않아요. 사진을 다시 넣어 주세요.";
  if (noteImagePaths(input.body).length > CLASS_NOTICE_IMAGE_MAX_COUNT) return `사진은 한 공지에 ${CLASS_NOTICE_IMAGE_MAX_COUNT}장까지 넣을 수 있어요.`;
  return null;
}
