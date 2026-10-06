import { fileExt, MB, objectName } from "./upload";
import { parseDoc, parseNote, runsText, sliceRuns, trimDoc, trimRuns, type NoteAlign, type NoteRun } from "./note-format";
import { isYoutubeUrl, linkKindLabel } from "./live-links";
import { youtubeVideo } from "./youtube-video";

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
 * - **링크 0 ~ 20개도 붙인다** (2026-10-06 Alan — "수업 자료실에 유튜브 링크를 한번씩 올릴 수도 있어. 그래서 링크를 올릴 수 있는 공간도 있으면 좋겠어.
 *   그리고 링크를 여러개 올릴 수 있도록", 마이그레이션 20261006143000 — `class_materials.links`). 그래서 자료의 조건은 **글 · 파일 · 링크 중 하나**다.
 *   유튜브 영상은 학생 화면이 그 자리에서 틀고(`youtube-video.ts` · `MaterialLinkList`), 다른 링크는 새 창으로 연다.
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

/**
 * 링크 상한 — DB check(`private.class_material_links_ok`, 마이그레이션 20261006143000)와 같다 (`class-materials.test.ts` 가 본다).
 * 20개는 파일 상한과 같고, 주소 2,000자는 공유 주소(`?si=…` · 긴 검색어)를 넉넉히 받는다
 */
export const CLASS_MATERIAL_LINKS_MAX = 20;
export const CLASS_MATERIAL_LINK_URL_MAX = 2000;
export const CLASS_MATERIAL_LINK_LABEL_MAX = 100;

/** 자료에 붙은 링크 한 개 — `class_materials.links` 의 한 칸. 이름(label)은 강사가 적은 것, 안 적었으면 null */
export type MaterialLink = { url: string; label: string | null };

/**
 * 입력칸의 주소를 저장할 주소로 — 앞뒤 공백을 떼고, `youtu.be/…` · `www.youtube.com/…` 처럼 `https://` 를 빼먹었으면 붙인다.
 * http · https 만 받는다 (`javascript:` · `data:` 를 학생 화면 href 에 세우지 않는다 — DB check 도 같다).
 * 사이트 이름에 점이 없거나(`localhost`) 아이디 · 비밀번호가 끼어 있으면(`https://youtube.com@다른곳`) 받지 않는다. 안 되면 null
 */
export function normalizeLinkUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : /^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(s) ? `https://${s}` : s;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname.includes(".") || u.username || u.password) return null;
  return u.href.length <= CLASS_MATERIAL_LINK_URL_MAX ? u.href : null;
}

/** 링크 입력 한 줄 (폼의 칸 그대로) — 서버 액션도 이 꼴로 받는다 */
export type LinkInput = { url?: unknown; label?: unknown };

/**
 * 입력한 링크 줄들을 저장할 목록으로 — **폼(올리기 전에)과 서버 액션이 같은 것을 쓴다** (noteTooLong 과 같은 규칙).
 *  - 주소 · 이름이 다 빈 줄은 건너뛴다 (새 줄을 더해 두고 안 채운 것)
 *  - 이름만 있고 주소가 없거나, 주소를 못 읽으면 그 줄 번호(`index`, 0부터)와 함께 막는다 — 조용히 버리면 강사는 올린 줄 안다
 *  - 같은 주소가 두 번이면 한 번만 (먼저 적은 이름)
 *  - 이름의 줄바꿈 · 겹친 공백은 한 칸으로
 */
export function parseMaterialLinks(rows: readonly LinkInput[] | null | undefined): { ok: true; links: MaterialLink[] } | { ok: false; error: string; index?: number } {
  const links: MaterialLink[] = [];
  const seen = new Set<string>();
  for (const [index, row] of (rows ?? []).entries()) {
    const rawUrl = typeof row?.url === "string" ? row.url.trim() : "";
    const label = typeof row?.label === "string" ? row.label.replace(/\s+/g, " ").trim() : "";
    if (!rawUrl) {
      if (label) return { ok: false, index, error: `${index + 1}번째 링크에 주소가 없어요. 주소를 넣거나 그 줄을 빼 주세요.` };
      continue;
    }
    const url = normalizeLinkUrl(rawUrl);
    if (!url) return { ok: false, index, error: `${index + 1}번째 링크 주소를 확인해 주세요 — https:// 로 시작하는 주소를 그대로 붙여 넣어 주세요.` };
    if (charCount(label) > CLASS_MATERIAL_LINK_LABEL_MAX) return { ok: false, index, error: `${index + 1}번째 링크 이름은 ${CLASS_MATERIAL_LINK_LABEL_MAX}자 이내로 적어 주세요.` };
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ url, label: label || null });
  }
  if (links.length > CLASS_MATERIAL_LINKS_MAX) return { ok: false, error: `링크는 한 자료에 ${CLASS_MATERIAL_LINKS_MAX}개까지 올릴 수 있어요.` };
  return { ok: true, links };
}

/**
 * 입력 중인 줄들 가운데 **지금 읽히는 링크만** — 폼의 제목 자리 표시(placeholder)가 쓴다. 못 읽는 줄은 막지 않고 건너뛴다
 * (막는 것은 올리기를 누를 때 `parseMaterialLinks` 가 한다)
 */
export function draftLinks(rows: readonly LinkInput[]): MaterialLink[] {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const r = parseMaterialLinks([row]);
    if (!r.ok) return [];
    return r.links.filter((l) => !seen.has(l.url) && seen.add(l.url));
  });
}

/** 자료 줄 · 학생 카드의 작은 회색 줄 — 다 유튜브 영상이면 `영상 2개`, 아니면 `링크 2개` */
export function linkCountLabel(links: readonly MaterialLink[]): string {
  return `${links.length > 0 && links.every((l) => youtubeVideo(l.url)) ? "영상" : "링크"} ${links.length}개`;
}

/**
 * DB 의 `links`(jsonb) → 링크 목록. 꼴이 틀린 칸은 버린다 — DB check 가 이미 막지만 화면은 한 번 더 본다
 * (href 에는 http · https 주소만 선다). 관리자 · 학생 화면이 읽은 값을 그대로 넘기면 여기서 고른다
 */
export function materialLinks(json: unknown): MaterialLink[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const { url, label } = v as { url?: unknown; label?: unknown };
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || /\s/.test(url)) return [];
    return [{ url, label: typeof label === "string" && label.trim() ? label.trim() : null }];
  });
}

/** 주소를 짧게 — `https://` · `www.` · 끝의 `/` 를 뗀다 (`youtu.be/dQw4w9WgXcQ`). 이름 아래 작은 회색 줄 */
export function shortLinkUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/**
 * 링크 줄의 이름 — 강사가 적은 이름, 없으면 `유튜브 영상` · 사이트 이름(`blog.naver.com`).
 * 링크가 여럿이고 이름이 없으면 몇 번째인지 붙인다 (`유튜브 영상 2`) — 같은 말이 줄줄이 서지 않게
 */
export function linkTitle(link: MaterialLink, index: number, total: number): string {
  if (link.label) return link.label;
  let name = "링크";
  if (youtubeVideo(link.url)) name = "유튜브 영상";
  else if (isYoutubeUrl(link.url)) name = "유튜브";
  else {
    try {
      name = new URL(link.url).hostname.replace(/^www\./i, "");
    } catch {
      // materialLinks 를 거친 주소라 여기 오지 않는다
    }
  }
  return total > 1 ? `${name} ${index + 1}` : name;
}

/** 안내에 보이는 글자가 있나 — 서식 태그만 남은 빈 글은 없는 것으로 본다. **파일 없이 글만 올리는 자료의 조건**이다 (폼 · 서버 액션) */
export function noteHasText(note: string | null | undefined): boolean {
  return !!note && runsText(parseNote(note)).trim().length > 0;
}

/** 안내 첫 줄로 제목을 지을 때 이보다 길면 줄인다 — 스크립트 첫 줄이 통째로 제목이 되지 않게 */
export const NOTE_TITLE_CHARS = 40;

/** `이름 외 N개` — 100자(DB check)를 넘지 않게 이름을 줄인다 */
function withMore(name: string, more: number): string {
  const tail = more > 0 ? ` 외 ${more}개` : "";
  return Array.from(name).slice(0, CLASS_MATERIAL_TITLE_MAX - tail.length).join("").trimEnd() + tail;
}

/**
 * 제목을 비워 두면 (2026-10-06) — 파일이 있으면 첫 파일 이름(여럿이면 `… 외 N개`), 글만 있으면 안내의 첫 줄(길면 줄임), 그것도 없으면 `수업 자료`.
 * **링크**(2026-10-06): 파일이 없으면 이름을 붙인 첫 링크가 안내 첫 줄보다 앞선다 (`1강 해설 영상 외 1개`) — 그 링크가 무엇인지 더 잘 말해 준다.
 * 이름 없는 링크뿐이면 안내 첫 줄, 그것도 없으면 `유튜브 영상` 같은 링크 이름.
 * 폼의 자리 표시(placeholder)와 서버 액션이 같은 것을 쓴다 — 화면에 비친 제목이 그대로 저장된다. 늘 1~100자다 (DB check)
 */
export function defaultMaterialTitle(fileNames: readonly string[], note: string | null | undefined, links: readonly MaterialLink[] = []): string {
  if (fileNames.length > 0) return withMore(titleFromFileName(fileNames[0]), fileNames.length - 1);
  const named = links.find((l) => l.label);
  if (named?.label) return withMore(named.label, links.length - 1);
  const line = note
    ? runsText(parseNote(note))
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean)
    : undefined;
  if (line) {
    const chars = Array.from(line);
    return chars.length > NOTE_TITLE_CHARS ? `${chars.slice(0, NOTE_TITLE_CHARS).join("").trimEnd()}…` : line;
  }
  if (links.length > 0) return withMore(linkTitle(links[0], 0, 1), links.length - 1);
  return "수업 자료";
}

/**
 * 자료 줄 왼쪽 네모에 적는 말 — 글만이면 `글`, 파일 하나면 그 종류(`PDF`), 여럿이면 `파일 3`.
 * 링크(2026-10-06): 링크만이면 유튜브 영상은 `영상`(여럿이면 `영상 2`), 그 밖은 `유튜브` · `링크`(여럿이면 `링크 2`), 파일과 링크가 함께면 `자료 3`
 */
export function materialBadge(files: readonly { file_name: string; content_type: string | null }[], links: readonly MaterialLink[] = []): string {
  if (links.length === 0) {
    if (files.length === 0) return "글";
    if (files.length === 1) return fileKindLabel(files[0].file_name, files[0].content_type);
    return `파일 ${files.length}`;
  }
  if (files.length > 0) return `자료 ${files.length + links.length}`;
  const videos = links.every((l) => youtubeVideo(l.url));
  if (links.length === 1) return videos ? "영상" : linkKindLabel(links[0].url);
  return `${videos ? "영상" : "링크"} ${links.length}`;
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
