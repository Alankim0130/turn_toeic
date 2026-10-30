import { CLASS_MATERIAL_BUCKET, linkCountLabel, materialLinks, sortClassMaterials, sortMaterialFiles, type MaterialFile, type MaterialLink } from "./class-materials";
import { objectName } from "./upload";

/**
 * 특강 자료실 (2026-10-30 Alan — "특강신청한 사람들이 특강 신청한 곳에 들어가면 볼 수 있는 자료실이 하나 있으면 좋겠어!
 * 다른사람들 말고 신청한 사람들만 보이는 자료실이야").
 *
 * - 특강 하나에 자료 0 ~ N개. **자료 하나 = 제목 + 안내 + 파일 0 ~ 20개 + 링크 0 ~ 20개** — 수업자료실 자료와 같은 꼴이고
 *   상한 · 링크 읽기 · 파일 고르기도 수업자료실 것을 그대로 쓴다 (`class-materials.ts`).
 * - **그 특강을 신청한 학생만 본다 — 화면이 아니라 DB 가 막는다** (정책 `special_lecture_materials: 신청자·스태프 조회`, 마이그레이션 20261030110000).
 *   신청 방식은 가리지 않는다. 특강이 보이는 동안(그 달 반에 배정 — 종강 전)만이라 종강 뒤에는 특강과 함께 닫힌다.
 *   학생 화면(`/my/lecture`)은 내가 신청한 특강 id 로 한 번 더 좁힌다 (등급 체계 10 — 정책이 강사 · 관리자에게 전부 연다).
 * - 올리는 곳은 **특강 설정**(`/admin/lectures/settings`) — 강사 · 관리자만 (조교 화면이 아니다).
 * - 파일은 **버킷 `class-materials` 의 `lectures/` 폴더** — 공지 첨부 파일(`notices/`)과 같은 까닭으로 새 버킷을 만들지 않는다.
 *   학생은 그 자료가 보일 때만 파일 행 · 저장소 파일이 열린다 (`/files/lecture/{파일 id}` — 신청하지 않은 특강의 파일은 404).
 */

/** 파일 버킷 · 폴더 (DB check `special_lecture_material_files_file_path_check` 와 같다 — 서버 액션이 경로를 이것으로 다시 본다) */
export const LECTURE_MATERIAL_BUCKET = CLASS_MATERIAL_BUCKET;
export const LECTURE_MATERIAL_FOLDER = "lectures/";
/** 올릴 파일의 저장소 경로 — 한글 원래 이름은 DB 에 따로 두고 경로에는 무작위 ASCII 만 */
export const lectureFilePath = (file: { name: string }) => `${LECTURE_MATERIAL_FOLDER}${objectName(file)}`;

/** 자료 한 건 — DB 에서 읽은 그대로 (`links` 는 jsonb 라 `materialLinks` 로 고른다) */
export type LectureMaterialRow = {
  id: number;
  lecture_id: number;
  title: string;
  note: string | null;
  links: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
  files: MaterialFile[] | null;
};

/** 화면에 쓰는 꼴 — 파일 · 링크를 정렬해 둔 것 */
export type LectureMaterial = Omit<LectureMaterialRow, "links" | "files"> & { links: MaterialLink[]; files: MaterialFile[] };

/** 특강 id → 그 특강의 자료 (올린 순서) */
export function groupLectureMaterials(rows: readonly LectureMaterialRow[] | null | undefined): Map<number, LectureMaterial[]> {
  const out = new Map<number, LectureMaterial[]>();
  for (const r of sortClassMaterials(rows)) {
    const list = out.get(r.lecture_id) ?? [];
    list.push({ ...r, links: materialLinks(r.links), files: sortMaterialFiles(r.files) });
    out.set(r.lecture_id, list);
  }
  return out;
}

/** 학생 카드 · 관리자 줄의 작은 회색 글 — `파일 2개 · 영상 1개`, 글만이면 `안내` */
export function lectureMaterialMeta(m: Pick<LectureMaterial, "files" | "links" | "note">): string {
  const parts = [m.files.length > 0 ? `파일 ${m.files.length}개` : null, m.links.length > 0 ? linkCountLabel(m.links) : null].filter(Boolean);
  if (parts.length === 0) return m.note ? "안내" : "";
  return parts.join(" · ");
}

/** 학생 카드의 머리 — `특강 자료 N개` */
export const lectureMaterialsTitle = (count: number) => `특강 자료 ${count}개`;
