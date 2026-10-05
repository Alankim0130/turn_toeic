import { fileExt, MB, objectName } from "./upload";

/**
 * 수업자료실 — 레벨 × RC/LC (2026-10-05 Alan — "지금 수업자료실이 없어! 수업자료실을 하나 만들어야하는데, 레벨별 구분과 RC, LC가 구분되어야해.").
 *
 * - 강사·관리자가 `/admin/class-materials` 에서 레벨(lc_levels — 650 · 750 · 850) × 과목(RC · LC)을 골라 파일을 올린다.
 * - 학생은 `/my/materials` 에서 **내 레벨만** 본다 — 화면이 아니라 DB 가 막는다 (`class_materials` 조회 정책 = `private.my_lc_levels()`,
 *   LC 음원과 같은 "내 레벨" 규칙. 마이그레이션 20261005100000). 내 레벨 안에서는 RC · LC 둘 다 열린다.
 * - 여기 값은 DB 와 같아야 한다 — 과목 check(`subject in ('rc','lc')`) · 제목 1~100자 · 안내 500자 · 버킷 50MB (`class-materials.test.ts` 가 본다).
 */

export const CLASS_MATERIAL_BUCKET = "class-materials";
/** 버킷 한도 (마이그레이션의 file_size_limit) — 비대면 자료와 같다 */
export const CLASS_MATERIAL_MAX_BYTES = 50 * MB;
export const CLASS_MATERIAL_TITLE_MAX = 100;
export const CLASS_MATERIAL_NOTE_MAX = 500;

/** 순서가 곧 화면 순서다 — RC 가 먼저 (숙제점검 · 숙제제출과 같은 순서) */
export const MATERIAL_SUBJECTS = ["rc", "lc"] as const;
export type MaterialSubject = (typeof MATERIAL_SUBJECTS)[number];
export const MATERIAL_SUBJECT_LABEL: Record<MaterialSubject, string> = { rc: "RC", lc: "LC" };
export const isMaterialSubject = (v: unknown): v is MaterialSubject => typeof v === "string" && (MATERIAL_SUBJECTS as readonly string[]).includes(v);

/** 저장소 폴더 — `650-rc/…`. 서버는 업로드 경로가 고른 레벨·과목 폴더인지 이것으로 다시 본다 */
export const materialFolder = (level: number, subject: MaterialSubject) => `${level}-${subject}/`;

/** 올릴 파일의 저장소 경로 — 한글 원래 이름은 DB 에 따로 두고 경로에는 무작위 ASCII 만 */
export const materialObjectPath = (level: number, subject: MaterialSubject, file: { name: string }) => `${materialFolder(level, subject)}${objectName(file)}`;

/** 제목을 비워 두면 파일 이름(확장자 뺀 것)을 제목으로 — `9월 Part5 해설.pdf` → `9월 Part5 해설` */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^./\\]{1,8}$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return (base || name.trim() || "수업 자료").slice(0, CLASS_MATERIAL_TITLE_MAX);
}

/** 학생 · 강사 화면의 파일 종류 이름 — 무엇이 열리는지 미리 보이게 */
export function fileKindLabel(name: string, type?: string | null): string {
  const ext = fileExt(name);
  if (ext === ".pdf" || type === "application/pdf") return "PDF";
  if (ext === ".hwp" || ext === ".hwpx") return "한글";
  if (ext === ".doc" || ext === ".docx") return "워드";
  if (ext === ".ppt" || ext === ".pptx") return "PPT";
  if (ext === ".xls" || ext === ".xlsx" || ext === ".csv") return "엑셀";
  if (ext === ".zip") return "압축";
  if (type?.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"].includes(ext)) return "그림";
  if (type?.startsWith("audio/") || [".mp3", ".m4a", ".wav"].includes(ext)) return "음원";
  if (type?.startsWith("video/") || [".mp4", ".mov"].includes(ext)) return "영상";
  return "파일";
}

/**
 * 학생 화면에서 처음 펼칠 과목 — 주소에 있으면 그것, 없으면 **자료가 있는 첫 과목**(RC → LC), 둘 다 비면 RC.
 * RC 가 비어 있는데 RC 부터 보여 주면 "자료가 없다" 로 읽힌다 (LC 칸에 자료가 있는데도).
 */
export function initialSubject(param: string | undefined, counts: Partial<Record<MaterialSubject, number>>): MaterialSubject {
  if (isMaterialSubject(param)) return param;
  return MATERIAL_SUBJECTS.find((s) => (counts[s] ?? 0) > 0) ?? MATERIAL_SUBJECTS[0];
}
