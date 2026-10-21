import { CLASS_MATERIAL_FILES_MAX, CLASS_MATERIAL_MAX_BYTES, charCount } from "./class-materials";
import { noticeAttachLabel } from "./class-notices";
import { noteImagePaths } from "./note-format";
import { MB, objectName } from "./upload";

/**
 * 직원 게시판 (2026-10-21 Alan — "관리자모드에서 직원들만 사용할 수 있는 게시판을 하나 만들어주면 좋겠어.
 * 게시물 올리는건 우리가 기존에 작업했던 워드처럼 쓸 수 있는 기능을 그대로 해줘." → 물음에 "조교도 읽고 쓰기" · "글만 올리기").
 *
 * - **강사 · 관리자 · 조교만** 읽고 쓴다 — 화면은 `requireCrew()`, 데이터는 DB 정책(`staff_posts: 직원 조회` …, 마이그레이션 20261021100000)이 막는다.
 *   학생 · 회원에게는 행이 하나도 안 보인다. 댓글은 없다 (Alan 이 "글만 올리기" 를 골랐다).
 * - **고치기 = 글쓴이만, 지우기 = 글쓴이와 강사 · 관리자** — `canEditStaffPost` · `canDeleteStaffPost` 는 DB 정책과 같은 규칙이다. **바꾸면 둘 다.**
 * - 글쓴이 id · 이름은 DB 트리거가 넣는다 (화면이 보낸 값을 믿지 않는다). 조교는 profiles 를 못 읽어 이름은 `author_name` 에 박아 둔다.
 * - 본문은 수업자료실 공지와 **같은 편집기 · 같은 서식 글**(`NoteEditor` — 굵게 · 색 · 표 · 사진 · 워드 붙여 넣기)이다.
 *   사진은 버킷 `staff-board` 의 `images/`, 첨부 파일은 같은 버킷의 `files/` (행은 `staff_post_files`). 링크는 수업자료실 링크와 같은 규칙.
 * - 상한도 공지와 같다 — 제목 100자 · 본문 5만 자 · 사진 30장(장당 10MB) · 파일 20개(하나에 50MB) · 링크 20개.
 * - **레벨**(2026-10-21 Alan "학습자료실처럼 650,750,850구분") — 글마다 `levels`(비우면 모든 레벨), 화면은 레벨 탭이고 모든 레벨 글은 탭마다 선다 (아래 `postInLevel`).
 * - **수업자료실과 오고 간다**(같은 날 — "이 게시물을 수업게시판으로 옮길 수 있으면 … 반대로 … 다시 직원게시판으로") — 규칙은 `src/lib/board-move.ts`,
 *   서버 액션은 `src/app/admin/board/move-actions.ts`(강사 · 관리자만). 수업자료실에서 온 글은 원래 자리를 `moved_from` 에 남긴다 (다시 옮길 때 미리 골라진다).
 */

export const STAFF_BOARD_BUCKET = "staff-board";
export const STAFF_POST_IMAGE_FOLDER = "images/";
/** 첨부 파일 폴더 — DB check `staff_post_files_file_path_check`(files/ 아래만)와 같다. 서버 액션이 경로를 이것으로 다시 본다 */
export const STAFF_POST_FILE_FOLDER = "files/";
export const STAFF_POST_TITLE_MAX = 100;
export const STAFF_POST_BODY_MAX = 50_000;
export const STAFF_POST_IMAGE_MAX_BYTES = 10 * MB;
export const STAFF_POST_IMAGE_MAX_COUNT = 30;
export const STAFF_POST_FILES_MAX = CLASS_MATERIAL_FILES_MAX;
/** 버킷 한도 (마이그레이션 file_size_limit) — 공지 첨부 파일과 같은 50MB */
export const STAFF_POST_FILE_MAX_BYTES = CLASS_MATERIAL_MAX_BYTES;
/** 목록 한 쪽에 몇 글 */
export const STAFF_BOARD_PAGE_SIZE = 20;

/** 올릴 첨부 파일의 저장소 경로 — 한글 원래 이름은 DB 에 따로 두고 경로에는 무작위 ASCII 만 */
export const staffPostFilePath = (file: { name: string }) => `${STAFF_POST_FILE_FOLDER}${objectName(file)}`;

/**
 * 저장 전 검사 — 서버 액션과 폼이 같은 말을 쓴다. 문제 없으면 null.
 * 레벨(2026-10-21)은 `knownLevels`(교재 레벨 목록 lc_levels)를 주면 그 안의 값인지 본다 — 공지(`noticeError`)와 같은 규칙
 */
export function staffPostError(input: { title: string; body: string; levels?: readonly number[] }, knownLevels?: readonly number[]): string | null {
  const title = input.title.trim();
  if (!title) return "제목을 적어 주세요.";
  if (charCount(title) > STAFF_POST_TITLE_MAX) return `제목은 ${STAFF_POST_TITLE_MAX}자 이내로 적어 주세요.`;
  const n = charCount(input.body);
  if (n > STAFF_POST_BODY_MAX) return `본문이 ${STAFF_POST_BODY_MAX.toLocaleString("ko-KR")}자를 넘어요 (${n.toLocaleString("ko-KR")}자).`;
  const images = noteImagePaths(input.body);
  if (images.some((p) => !p.startsWith(STAFF_POST_IMAGE_FOLDER) || p.includes(".."))) return "사진 정보가 올바르지 않아요. 사진을 다시 넣어 주세요.";
  if (images.length > STAFF_POST_IMAGE_MAX_COUNT) return `사진은 한 글에 ${STAFF_POST_IMAGE_MAX_COUNT}장까지 넣을 수 있어요.`;
  if (knownLevels && (input.levels ?? []).some((l) => !knownLevels.includes(l))) return "레벨을 다시 골라 주세요.";
  return null;
}

/**
 * 직원 게시판 레벨 (2026-10-21 Alan — "직원게시판도 학습자료실처럼 650,750,850구분이 다 되어있으면 좋겠어", 마이그레이션 20261021110000).
 * 글마다 `levels`(수업자료실 공지와 같은 꼴 — **비우면 모든 레벨**). 화면은 650 · 750 · 850 탭(레벨은 lc_levels 에서 읽는다 — 코드에 적지 않는다)이고,
 * 탭 하나에는 **그 레벨 글과 모든 레벨 글**이 선다 (DB 조회 `levels.eq.{},levels.cs.{L}` 와 같다 — `postInLevel`).
 */
export const postInLevel = (levels: readonly number[], level: number) => levels.length === 0 || levels.includes(level);

/** DB 조회의 레벨 거르기 — 그 레벨 글 · 모든 레벨 글 (`postInLevel` 과 같은 뜻) */
export const levelFilter = (level: number) => `levels.eq.{},levels.cs.{${Math.trunc(level)}}`;

/** 레벨 이름 — 비우면 `모든 레벨`, 아니면 작은 것부터 `650 · 750` */
export const levelsLabel = (levels: readonly number[]) => (levels.length === 0 ? "모든 레벨" : [...levels].sort((a, b) => a - b).join(" · "));

/** 고른 레벨 → 저장할 레벨 — 양의 정수만(빈 값 · null 이 0 이 되지 않게) · 한 번씩 · 작은 것부터 (모르는 값은 `staffPostError` 가 막는다) */
export const normalizeLevels = (raw: readonly unknown[] | null | undefined): number[] =>
  [...new Set((raw ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);

/** 주소의 `?level=` — 레벨 목록에 있으면 그것, 아니면 첫 레벨 (수업자료실과 같다). 목록이 비면 null */
export function boardLevel(raw: string | string[] | undefined, levels: readonly number[]): number | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return levels.includes(n) ? n : (levels[0] ?? null);
}

/** 고칠 수 있나 — 글쓴이만 (DB 정책 `staff_posts: 글쓴이 고치기`). 글쓴이 계정이 지워진 글(author_id null)은 아무도 못 고친다 */
export const canEditStaffPost = (post: { author_id: string | null }, userId: string) => !!post.author_id && post.author_id === userId;

/** 지울 수 있나 — 글쓴이와 강사 · 관리자 (DB 정책 `staff_posts: 글쓴이·강사·관리자 지우기`). `staff` = 강사 · 관리자(진짜 등급)인가 */
export const canDeleteStaffPost = (post: { author_id: string | null }, userId: string, staff: boolean) => staff || canEditStaffPost(post, userId);

/** 목록 줄의 작은 회색 글 — `파일 2개 · 링크 1개` (붙은 것이 없으면 빈 글). 수업자료실 공지 목록과 같은 꼴이라 그 함수를 쓴다 */
export const staffPostAttachLabel = noticeAttachLabel;

/** 주소의 `?page=` — 1 이상의 정수만, 아니면 1 */
export function boardPage(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** 쪽 수 — 글이 없어도 1쪽 */
export const boardPageCount = (total: number) => Math.max(1, Math.ceil(Math.max(0, total) / STAFF_BOARD_PAGE_SIZE));

const KST_DAY = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** 목록의 날짜 — 오늘 올린 글은 시각(`14:05`), 그 밖은 `25.10.21` (한국 시간) */
export function boardDateLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (KST_DAY(d) === KST_DAY(now)) return d.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
  const [y, m, day] = KST_DAY(d).split("-");
  return `${y.slice(2)}.${m}.${day}`;
}

/**
 * 고친 글인가 — 올릴 때 트리거가 두 시각을 같은 값으로 적고, 제목 · 본문 · 링크 · 레벨이 바뀔 때만 고친 시각을 올린다.
 * 파일만 더하거나 빼면 글은 그대로라 `고침` 이 붙지 않는다
 */
export const isEditedPost = (post: { created_at: string; updated_at: string }) => new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 1000;

/** 테스트 등급을 켠 동안 — DB 가 학생으로 보아 글이 0건으로 읽히므로 화면은 읽지 않고 이것만 말한다 (인수인계 체크와 같은 규칙) */
export const STAFF_BOARD_TESTING_NOTE = "테스트 등급을 켠 동안에는 직원 게시판이 보이지 않아요. 위 띠에서 테스트를 끝내면 다시 보여요.";
