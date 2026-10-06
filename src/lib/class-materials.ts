import { fileExt, MB, objectName } from "./upload";
import { parseDoc, parseNote, runsText, sliceRuns, trimDoc, trimRuns, type NoteAlign, type NoteRun } from "./note-format";

/**
 * 수업자료실 — 레벨 × RC/LC × 과정 A/B × 회차 (2026-10-05 Alan — "지금 수업자료실이 없어! … 레벨별 구분과 RC, LC가 구분되어야해." →
 * 같은 날 "수업자료실에 A/B 과정 전부다 나눠서 올릴 수 있도록 해야해! RC, LC전부다" · "자료게시판도 일정표 기반으로 오픈 … 해당 날짜가 안되면 잠금").
 *
 * - 강사·관리자가 `/admin/class-materials` 에서 레벨(lc_levels — 650 · 750 · 850) → 과목 × 과정 → 회차를 골라 파일을 올린다.
 * - 학생은 `/my/materials` 에서 **내 반의 과정 칸 자료를, 그 회차 수업일부터** 본다 — 화면이 아니라 DB 가 막는다
 *   (`class_materials` 조회 정책 = `private.my_open_rounds()`, 마이그레이션 20261005130000 — 규칙은 `class-rounds.ts`).
 *   **RC 단과 학생에게는 RC 자료만, LC 단과에게는 LC 자료만** 열린다 (2026-10-05 Alan — "RC단과 학생들은 음원파일과 LC수업자료실에 접근 안되는거 맞지?").
 *   주5일 60분 · 120분 · 속성반은 둘 다. 과정 · 회차가 없는 옛 자료는 학생에게 보이지 않는다.
 * - 여기 값은 DB 와 같아야 한다 — 과목 check(`subject in ('rc','lc')`) · 제목 1~100자 · 안내 5만 자 · 버킷 50MB (`class-materials.test.ts` 가 본다).
 * - **안내 칸에 스크립트를 올린다** (2026-10-05 Alan — "여기 안내에 스크립트를 올려줄예정이야. 그래서 글을 쫌 길게 적을 수 있어야해" — 500자 → 5만 자,
 *   마이그레이션 20261005150000). 짧은 안내는 예전처럼 펼쳐 두고, 길면 앞 몇 줄만 보이고 `전체 보기` 로 편다 (`notePreview` · `MaterialNote`).
 * - **자료 하나 = 제목 + 안내 + 파일 0 ~ 20개 — 게시판 글 하나** (2026-10-06 Alan — "게시판이 파일업로드를 안하면 글 올리기 버튼을 눌러도 계속 오류가 나 …
 *   파일업로드를 안하고 글만 적어서 올릴수도 있도록 … 파일을 한번에 여러개 올릴 수 있도록", 마이그레이션 20261006100000). 파일은 `class_material_files` 에 두고,
 *   파일이 없으면 안내에 글이 있어야 한다(`noteHasText`). 제목을 비우면 `defaultMaterialTitle` 이 짓는다.
 */

export const CLASS_MATERIAL_BUCKET = "class-materials";
/** 버킷 한도 (마이그레이션의 file_size_limit) — 비대면 자료와 같다 */
export const CLASS_MATERIAL_MAX_BYTES = 50 * MB;
export const CLASS_MATERIAL_TITLE_MAX = 100;
/**
 * 안내 · 스크립트 상한 — LC 한 회차 스크립트에 해석을 붙여도 넉넉하다. 서버 액션 본문 한도(1MB)에도 한참 못 미친다 (한글 5만 자 ≈ 150KB).
 * 화면은 넘치면 잘라 넣지 않고(maxLength 를 두지 않는다 — 붙여 넣은 스크립트 뒤가 소리 없이 잘린다) 빨갛게 알리고 저장을 막는다
 */
export const CLASS_MATERIAL_NOTE_MAX = 50_000;

const SURROGATE_PAIR = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
/**
 * 글자 수 — DB 의 `char_length` 와 같은 셈(코드 포인트). JS 의 `.length` 는 이모지를 두 자로 센다.
 * 입력칸 글자 수 · 폼 · 서버 액션 · 접힌 안내의 글자 수가 모두 이것으로 세어 DB check 와 한 자도 어긋나지 않는다.
 * 글자를 칠 때마다 부르므로 배열을 만들지 않고 셈만 한다
 */
export const charCount = (s: string): number => s.length - (s.match(SURROGATE_PAIR)?.length ?? 0);

/** 안내가 상한을 넘었을 때의 말 — 폼(파일을 올리기 전에)과 서버 액션이 같은 말을 쓴다. 넘지 않으면 null */
export function noteTooLong(note: string): string | null {
  const n = charCount(note);
  if (n <= CLASS_MATERIAL_NOTE_MAX) return null;
  const fmt = (v: number) => v.toLocaleString("ko-KR");
  return `안내가 ${fmt(CLASS_MATERIAL_NOTE_MAX)}자를 넘어요 (${fmt(n)}자). 줄이거나, 긴 스크립트는 파일로 올려 주세요.`;
}

/** 이보다 길면(줄 · 글자 어느 쪽이든) 접어 둔다 — 짧은 안내("수업 전에 출력해 오세요")는 예전처럼 늘 펼쳐 둔다 */
export const NOTE_FOLD_LINES = 6;
export const NOTE_FOLD_CHARS = 300;
/** 접었을 때 보이는 앞부분 */
export const NOTE_PREVIEW_LINES = 4;
export const NOTE_PREVIEW_CHARS = 200;

/**
 * 안내를 접을지와 접었을 때 보일 앞부분. 글자는 코드 포인트로 센다(이모지를 반으로 자르지 않는다).
 * 줄 수 · 글자 수 둘 다 기준 안이면 접지 않는다 — 다섯 줄짜리 짧은 안내를 "전체 보기" 뒤에 숨기지 않게
 */
export function notePreview(note: string): { folded: boolean; preview: string; chars: number } {
  return foldPlain(runsText(trimRuns(parseNote(note))));
}

/**
 * 서식(`note-format.ts`)을 살린 채 접기 — 접을지 · 몇 자인지 · 앞부분은 **학생에게 보이는 글자**로 정하고(태그는 세지 않는다),
 * 앞부분을 그만큼 서식째 자른다. `MaterialNote` 가 그린다
 */
export function noteView(note: string): { folded: boolean; preview: NoteRun[]; full: NoteRun[]; aligns: NoteAlign[]; chars: number } {
  const { runs: full, aligns } = trimDoc(parseDoc(note));
  const { folded, preview, chars } = foldPlain(runsText(full));
  return { folded, preview: folded ? sliceRuns(full, Array.from(preview).length) : full, full, aligns, chars };
}

function foldPlain(text: string): { folded: boolean; preview: string; chars: number } {
  const chars = charCount(text);
  const lines = text.split("\n");
  if (lines.length <= NOTE_FOLD_LINES && chars <= NOTE_FOLD_CHARS) return { folded: false, preview: text, chars };
  const head = Array.from(lines.slice(0, NOTE_PREVIEW_LINES).join("\n")).slice(0, NOTE_PREVIEW_CHARS).join("").trimEnd();
  return { folded: true, preview: head, chars };
}

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

/**
 * 자료 하나에 붙이는 파일 수 상한 (2026-10-06 — "파일을 한번에 여러개"). DB 에는 상한이 없다 — 폼과 서버 액션이 본다.
 * 한 회차 자료(교재 PDF · 스크립트 · 해설 · 음원 몇 개)에는 넉넉하고, 한 글에 50MB × 수십 개를 쌓지는 않게
 */
export const CLASS_MATERIAL_FILES_MAX = 20;

/** 자료에 붙은 파일 한 개 — 관리자 · 학생 화면이 쓰는 칸 (`/files/class/{id}` 의 id 가 이 파일 id 다) */
export type MaterialFile = { id: number; file_name: string; file_size: number | null; content_type: string | null; sort_order: number };

/** 파일 순서 — 올린 순서(sort_order) 그대로, 같으면 먼저 넣은 것 */
export function sortMaterialFiles<T extends { id: number; sort_order: number }>(files: readonly T[] | null | undefined): T[] {
  return [...(files ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

/** 안내에 보이는 글자가 있나 — 서식 태그만 남은 빈 글은 없는 것으로 본다. **파일 없이 글만 올리는 자료의 조건**이다 (폼 · 서버 액션) */
export function noteHasText(note: string | null | undefined): boolean {
  return !!note && runsText(parseNote(note)).trim().length > 0;
}

/** 안내 첫 줄로 제목을 지을 때 이보다 길면 줄인다 — 스크립트 첫 줄이 통째로 제목이 되지 않게 */
export const NOTE_TITLE_CHARS = 40;

/**
 * 제목을 비워 두면 (2026-10-06) — 파일이 있으면 첫 파일 이름(여럿이면 `… 외 N개`), 글만 있으면 안내의 첫 줄(길면 줄임), 그것도 없으면 `수업 자료`.
 * 폼의 자리 표시(placeholder)와 서버 액션이 같은 것을 쓴다 — 화면에 비친 제목이 그대로 저장된다. 늘 1~100자다 (DB check)
 */
export function defaultMaterialTitle(fileNames: readonly string[], note: string | null | undefined): string {
  if (fileNames.length > 0) {
    const first = titleFromFileName(fileNames[0]);
    if (fileNames.length === 1) return first;
    const tail = ` 외 ${fileNames.length - 1}개`;
    return Array.from(first).slice(0, CLASS_MATERIAL_TITLE_MAX - tail.length).join("").trimEnd() + tail;
  }
  const line = note
    ? runsText(parseNote(note))
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean)
    : undefined;
  if (!line) return "수업 자료";
  const chars = Array.from(line);
  return chars.length > NOTE_TITLE_CHARS ? `${chars.slice(0, NOTE_TITLE_CHARS).join("").trimEnd()}…` : line;
}

/** 자료 줄 왼쪽 네모에 적는 말 — 글만이면 `글`, 파일 하나면 그 종류(`PDF`), 여럿이면 `파일 3` */
export function materialBadge(files: readonly { file_name: string; content_type: string | null }[]): string {
  if (files.length === 0) return "글";
  if (files.length === 1) return fileKindLabel(files[0].file_name, files[0].content_type);
  return `파일 ${files.length}`;
}

/** 브라우저가 그 자리에서 보여 주는 형식 — 나머지(한글 · 워드 · 압축 …)는 어차피 내려받아지므로 `받기` 하나만 둔다 */
export const isViewableKind = (kind: string) => kind === "PDF" || kind === "그림";

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
 * 학생 화면에서 처음 펼칠 과목 — 주소에 있으면 그것, 없으면 **자료가 있는 첫 과목**(RC → LC), 둘 다 비면 첫 과목.
 * RC 가 비어 있는데 RC 부터 보여 주면 "자료가 없다" 로 읽힌다 (LC 칸에 자료가 있는데도).
 * `allowed` 는 그 레벨에서 내가 듣는 과목이다 — RC 단과 학생이 주소에 `subject=lc` 를 쳐도 RC 를 펼친다 (LC 는 DB 가 닫아 둔다).
 */
export function initialSubject(
  param: string | undefined,
  counts: Partial<Record<MaterialSubject, number>>,
  allowed: readonly MaterialSubject[] = MATERIAL_SUBJECTS,
): MaterialSubject {
  const subjects = allowed.length ? allowed : MATERIAL_SUBJECTS;
  if (isMaterialSubject(param) && subjects.includes(param)) return param;
  return subjects.find((s) => (counts[s] ?? 0) > 0) ?? subjects[0];
}

/** 한 레벨에서 내가 받을 수 있는 과목 — RC 단과면 `["rc"]` */
export type MaterialAccess = { level: number; subjects: MaterialSubject[] };

/**
 * 학생 수업자료실의 레벨 × 과목 — 과목마다 **내 과정 칸이 있는 레벨**(`cellLevels`, src/lib/class-rounds.ts — DB `private.my_round_cells` 와 같은 규칙)을
 * 받아 레벨마다 과목을 모은다. 레벨 순서는 `order`(교재 레벨 목록 lc_levels) 그대로이고, 그 목록에 하나도 없으면 숫자 순서.
 * 레벨마다 과목이 하나 이상이다 (과목이 없는 레벨은 애초에 들지 않는다).
 */
export function materialAccess(bySubject: Record<MaterialSubject, readonly number[]>, order: readonly number[]): MaterialAccess[] {
  const mine = [...new Set(MATERIAL_SUBJECTS.flatMap((s) => bySubject[s]))].sort((a, b) => a - b);
  const listed = order.filter((l) => mine.includes(l));
  return (listed.length ? listed : mine).map((level) => ({ level, subjects: MATERIAL_SUBJECTS.filter((s) => bySubject[s].includes(level)) }));
}
