import { CLASS_MATERIAL_BUCKET, MATERIAL_SUBJECT_LABEL, isMaterialSubject, linkCountLabel, type MaterialLink, type MaterialSubject } from "./class-materials";
import { charCount } from "./class-materials";
import { noteImagePaths } from "./note-format";
import { MB, objectName } from "./upload";

/**
 * 수업자료실 공지사항 (2026-10-05 Alan — "수업자료실에서 1회차 앞에 공지사항을 올릴 수 있는 곳이 있으면 좋겠어. … 여러개" ·
 * "안내글에서 쓰는 글 편집기능이 다 들어가면 좋겠어. 추가적으로 이미지도 중간에 추가 … 블로그랑 같다고 생각하면" ·
 * 범위 "강사가 직접 지정할 수 있으면 좋겠어. 전체공지인지, 레벨별이라면 레벨을 선택, RC LC도 선택" · "해당 공지 페이지가 새로 열리면 좋겠어").
 *
 * - 범위 = levels(비우면 모든 레벨) × subjects(비우면 RC · LC 둘 다). 둘 다 비우면 **전체 공지**.
 * - 학생에게 보이는 규칙은 DB 정책(`class_notices: 범위 수강생·스태프 조회`, 마이그레이션 20261005170000)과 같다 — `noticeVisible`. **바꾸면 둘 다.**
 *   지금 수강 중(개강일~종강일)이어야 하고, 범위 공지는 내 과정 칸('650:rc:A') 중 하나가 레벨 · 과목에 맞아야 한다 — RC 단과에게 LC 공지는 없다.
 * - 본문은 수업자료실 안내와 같은 서식 글(`note-format.ts`)이고 그림은 버킷 `class-notices` 의 `images/…` 경로로 든다.
 * - **첨부 파일 0 ~ 20개 · 링크 0 ~ 20개** (2026-10-13 Alan — 공지 고치기 화면을 보여 주며 "공지사항에서도 파일올리기 등등 다 할 수 있도록", 마이그레이션 20261013110000).
 *   수업자료실 자료와 같은 꼴이다 — 파일은 `class_notice_files`, 링크는 `class_notices.links`(같은 check), 상한 · 링크 읽기도 수업자료실 것을 그대로 쓴다.
 *   파일 자체는 **버킷 `class-materials` 의 `notices/` 폴더**에 둔다 — 공지 사진 버킷은 10MB · 그림만이라 PDF · 한글 · 음원을 못 받는다.
 *   학생은 그 공지가 보일 때만 파일 행 · 저장소 파일이 열린다 (DB 정책 — 남의 범위 · 내린 공지의 파일은 404).
 */

export const CLASS_NOTICE_BUCKET = "class-notices";
export const CLASS_NOTICE_IMAGE_FOLDER = "images/";
export const CLASS_NOTICE_TITLE_MAX = 100;
export const CLASS_NOTICE_BODY_MAX = 50_000;
/** 버킷 한도 (마이그레이션 file_size_limit) */
export const CLASS_NOTICE_IMAGE_MAX_BYTES = 10 * MB;
export const CLASS_NOTICE_IMAGE_MAX_COUNT = 30;

/** 첨부 파일 — 버킷 `class-materials` 의 이 폴더 (DB check `class_notice_files_file_path_check` 와 같다. 서버 액션이 경로를 이것으로 다시 본다) */
export const CLASS_NOTICE_FILE_BUCKET = CLASS_MATERIAL_BUCKET;
export const CLASS_NOTICE_FILE_FOLDER = "notices/";
/** 올릴 첨부 파일의 저장소 경로 — 한글 원래 이름은 DB 에 따로 두고 경로에는 무작위 ASCII 만 */
export const noticeFilePath = (file: { name: string }) => `${CLASS_NOTICE_FILE_FOLDER}${objectName(file)}`;

/** 공지 목록 줄의 작은 회색 글 — `파일 2개 · 영상 1개` (붙은 것이 없으면 빈 글) */
export function noticeAttachLabel(fileCount: number, links: readonly MaterialLink[]): string {
  return [fileCount > 0 ? `파일 ${fileCount}개` : null, links.length > 0 ? linkCountLabel(links) : null].filter(Boolean).join(" · ");
}

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

/**
 * 올라가 있는 공지와 내린 공지 (2026-10-06 Alan — "공지를 등록했다가 내리기 … 내려간 게시글에 다시 공지사항올리기 토글").
 * 내린 공지(`published = false`)는 학생에게 안 보이고 관리자 수업자료실의 "내린 공지" 묶음에 남는다 — 글·사진은 그대로라 다음 달에 다시 올린다.
 */
export function partitionNotices<T extends { published: boolean }>(rows: readonly T[]): { live: T[]; down: T[] } {
  const live: T[] = [];
  const down: T[] = [];
  for (const r of rows) (r.published ? live : down).push(r);
  return { live, down };
}

/** 토글 글자 — 올라가 있으면 `공지 내리기`, 내려 있으면 `다시 올리기` */
export const publishToggleLabel = (published: boolean) => (published ? "공지 내리기" : "다시 올리기");

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
