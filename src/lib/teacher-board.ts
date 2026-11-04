import { CLASS_MATERIAL_BUCKET, linkCountLabel, materialLinks, sortClassMaterials, sortMaterialFiles, type MaterialFile, type MaterialLink } from "./class-materials";
import { cellsOfSection, roundKey, type RoundSet, type RoundSubject } from "./class-rounds";
import { objectName } from "./upload";

/**
 * **강사 자료 게시판** (2026-11-03 Alan — "강사 전용 자료 게시판을 하나 만들고 싶어. 취지는 850반 자료는 매달 바뀌기 때문에 한번에 정리를 쫙 해놓고
 * 원하는 과정의 자료를 오픈하는 형태로 … 폴더를 여러개 만들고 한 폴더를 클릭해서 수업자료를 여러개 만들어 놓고, 그걸 몇월 수업자료로 사용하고 싶다고 하면
 * 그 자료들이 학생들에게 오픈되면 좋겠어. 기존에 날짜별 오픈시스템도 그대로 적용 … RC 강사게시판과 LC강사 게시판을 분류").
 *
 * - **폴더**(`teacher_folders`)는 과목(rc | lc)으로 RC 강사게시판 · LC 강사게시판에 나뉜다. 더하기 · 이름 바꾸기 · 위치 바꾸기 · 지우기.
 * - **자료**(`teacher_folder_items`) = 회차 + 제목 + 안내 + 파일 0 ~ 20개 + 링크 0 ~ 20개 — 수업자료실 자료와 같은 꼴이고 상한도 같다.
 *   레벨 · 과정은 자료가 아니라 **쓰는 달**이 정한다 — 같은 폴더를 다음에 그 과정이 돌아올 때 다시 쓴다.
 * - **몇월 수업자료로 쓰기**(`teacher_folder_uses`) = 폴더 × 기수 × 레벨 × 과정(A/B). 과목은 폴더의 것. 한 달 · 레벨 · 과목 · 과정에는 폴더 하나.
 * - 학생에게는 **그 칸을 쓰는 내 반의 그 회차 수업일부터** 열린다 (수업자료실 날짜별 오픈과 같은 규칙) — **그 달 그 칸은 폴더 자료만**이고
 *   기존 수업자료실 자료는 닫힌다 (Alan "그 달은 폴더 자료만"). 막는 것은 DB 다 — `private.my_open_term_rounds` · `my_open_class_rounds`
 *   (마이그레이션 20261103100000). 앱의 `splitRoundDates` 가 같은 규칙이다 — **바꾸면 둘 다**.
 * - 강사 · 관리자만 쓴다 (조교 화면이 아니다 — 등급 체계 9-1). 파일은 버킷 `class-materials` 의 `teacher/` 폴더, 주소 `/files/teacher/{파일 id}`.
 */

/** 파일 버킷 · 폴더 (DB check `teacher_folder_files_file_path_check` 와 같다 — 서버 액션이 경로를 이것으로 다시 본다) */
export const TEACHER_BOARD_BUCKET = CLASS_MATERIAL_BUCKET;
export const TEACHER_BOARD_FOLDER = "teacher/";
/** 올릴 파일의 저장소 경로 — 한글 원래 이름은 DB 에 따로 두고 경로에는 무작위 ASCII 만 */
export const teacherFilePath = (file: { name: string }) => `${TEACHER_BOARD_FOLDER}${objectName(file)}`;

/** 폴더 이름 끝 (DB check `char_length(btrim(name)) between 1 and 60`) */
export const FOLDER_NAME_MAX = 60;

/** 게시판 이름 — RC 강사게시판 · LC 강사게시판 */
export const BOARD_LABEL: Record<RoundSubject, string> = { rc: "RC 강사게시판", lc: "LC 강사게시판" };

/** 폴더 이름 검사 — 화면과 서버 액션이 같은 것을 쓴다. 문제가 없으면 null */
export function folderNameError(name: string): string | null {
  const v = name.trim();
  if (!v) return "폴더 이름을 적어 주세요.";
  if (v.length > FOLDER_NAME_MAX) return `폴더 이름은 ${FOLDER_NAME_MAX}자 이내로 적어 주세요.`;
  return null;
}

/** 기수 · 과정 칸 키 `term:level:subject:set` (DB private.my_term_cells 와 같은 꼴) */
export const termCellKey = (term: number, level: number, subject: string, set: string) => `${term}:${level}:${subject}:${set}`;
/** 기수 · 회차 키 `term:level:subject:set:seq` (DB private.my_open_term_rounds 와 같은 꼴) */
export const termRoundKey = (term: number, level: number, subject: string, set: string, seq: number) => `${term}:${level}:${subject}:${set}:${seq}`;

type TermRoundSession = {
  seq: number;
  date: string;
  section: { term_id?: number | null; subject?: string | null; book_set?: string | null; course?: { target_score?: number | null } | null } | null;
};

/**
 * 내 수업일을 **폴더를 쓰는 칸 / 아닌 칸**으로 가른다 — DB 의 `my_open_class_rounds` · `my_open_term_rounds` 와 같은 규칙.
 * - `classDates`: 폴더를 쓰지 않는 (기수 · 칸)의 회차 → 날짜 (`roundKey`). 수업자료실(class_materials)은 이것으로 연다
 * - `folderDates`: 폴더를 쓰는 (기수 · 칸)의 회차 → 날짜 (`termRoundKey`). 폴더 자료는 이것으로 연다
 * 같은 회차가 두 반에서 오면(오전 · 저녁 같은 과정) 이른 날짜다 — `roundDates` 와 같다.
 */
export function splitRoundDates(sessions: readonly TermRoundSession[], foldered: ReadonlySet<string>) {
  const classDates = new Map<string, string>();
  const folderDates = new Map<string, string>();
  const keep = (map: Map<string, string>, key: string, date: string) => {
    const prev = map.get(key);
    if (!prev || date < prev) map.set(key, date);
  };
  for (const s of sessions) {
    const term = s.section?.term_id;
    for (const c of cellsOfSection(s.section)) {
      if (typeof term === "number" && foldered.has(termCellKey(term, c.level, c.subject, c.set))) {
        keep(folderDates, termRoundKey(term, c.level, c.subject, c.set, s.seq), s.date);
      } else {
        keep(classDates, roundKey(c.level, c.subject, c.set, s.seq), s.date);
      }
    }
  }
  return { classDates, folderDates };
}

/** 폴더를 쓰는 칸 한 줄 (teacher_folder_uses) */
export type FolderUse = { id: number; folder_id: number; term_id: number; level: number; subject: RoundSubject; book_set: RoundSet };

/** 자료 한 건 — DB 에서 읽은 그대로 (`links` 는 jsonb 라 `materialLinks` 로 고른다) */
export type TeacherItemRow = {
  id: number;
  folder_id: number;
  seq: number;
  title: string;
  note: string | null;
  links: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
  files: MaterialFile[] | null;
};

/** 화면에 쓰는 꼴 — 파일 · 링크를 정렬해 둔 것 */
export type TeacherItem = Omit<TeacherItemRow, "links" | "files"> & { links: MaterialLink[]; files: MaterialFile[] };

/** 회차 → 그 회차 자료 (회차 순, 회차 안은 강사가 정한 순서 → 올린 순서) */
export function groupItemsBySeq(rows: readonly TeacherItemRow[] | null | undefined): [number, TeacherItem[]][] {
  const out = new Map<number, TeacherItem[]>();
  for (const r of sortClassMaterials(rows)) {
    const list = out.get(r.seq) ?? [];
    list.push({ ...r, links: materialLinks(r.links), files: sortMaterialFiles(r.files) });
    out.set(r.seq, list);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

/** 관리자 줄의 작은 회색 글 — `파일 2개 · 영상 1개`, 글만이면 `안내` */
export function itemMeta(m: Pick<TeacherItem, "files" | "links" | "note">): string {
  const parts = [m.files.length > 0 ? `파일 ${m.files.length}개` : null, m.links.length > 0 ? linkCountLabel(m.links) : null].filter(Boolean);
  if (parts.length === 0) return m.note ? "안내" : "";
  return parts.join(" · ");
}

/** 쓰는 달 한 줄의 이름 — `2026년 11월 · 850 RC · A과정` */
export function folderUseLabel(u: { level: number; subject: string; book_set: string }, term: { year: number; month: number } | null | undefined): string {
  return [term ? `${term.year}년 ${term.month}월` : "기수 미지정", `${u.level} ${u.subject.toUpperCase()}`, `${u.book_set}과정`].join(" · ");
}

/** 새 자료의 회차 — 마지막 회차 다음 (끝 30). 아직 없으면 1회차 */
export const nextSeq = (seqs: readonly number[]) => Math.min(30, Math.max(0, ...seqs) + 1);

/** 옮길 자료 한 건 — 지금 자리 */
export type MovingItem = { id: number; folder_id: number; seq: number; sort_order: number };

/**
 * **다른 폴더 · 회차로 옮기기** (2026-11-04 Alan — "R 자료를 A 폴더에 잘못 넣어버렸는데 R 로 옮기려는데 옮길수가 없네용").
 * `seq` 가 null 이면 회차 그대로, 숫자면 모두 그 회차로. 옮길 폴더의 그 회차 **끝에** 지금 순서(회차 → 순서 → id)대로 선다 —
 * `lastOrder` 는 옮길 폴더의 회차 → 가장 큰 순서 번호. 이미 그 자리(같은 폴더 · 같은 회차)인 자료는 빼고 돌려준다 (움직이지 않는다).
 * 파일은 자료에 붙어 있어(`teacher_folder_files.item_id`) 저장소에서 옮길 것이 없다.
 */
export function planItemMove(
  items: readonly MovingItem[],
  folderId: number,
  lastOrder: ReadonlyMap<number, number>,
  seq: number | null,
): { id: number; seq: number; sort_order: number }[] {
  const next = new Map(lastOrder);
  const sorted = [...items].sort((a, b) => a.seq - b.seq || a.sort_order - b.sort_order || a.id - b.id);
  const out: { id: number; seq: number; sort_order: number }[] = [];
  for (const it of sorted) {
    const to = seq ?? it.seq;
    if (it.folder_id === folderId && it.seq === to) continue;
    const order = (next.get(to) ?? -1) + 1;
    next.set(to, order);
    out.push({ id: it.id, seq: to, sort_order: order });
  }
  return out;
}
