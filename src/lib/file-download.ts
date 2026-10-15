/**
 * 화면에서 만든 파일(PDF · Word) 받기 — 기기마다 가는 길 (2026-10-14 Alan — 반별 명단 `PDF 받기` 를 아이폰에서 누르고
 * "모바일에서 보는거는되는데 실제로 다운을 안 받아져" → 2026-10-15 "학생명단 워드로도 다운받을 수 있게" 로 Word 도 같은 길).
 *
 * 서버는 처음부터 내려받기(`Content-Disposition: attachment`)로 준다 — PC · 안드로이드는 그것으로 받아진다.
 * **아이폰 · 아이패드는 그 신호를 무시하고 PDF 를 화면에 띄우기만 한다.** 홈 화면 앱은 주소창 · 공유 버튼이 없어
 * 띄운 PDF 에서 저장할 길도 돌아갈 길도 없다. 그래서 아이폰 · 아이패드에서는 파일을 받아 **공유 시트**(파일에 저장 · 프린트 · 카카오톡 · Word 앱)를 연다.
 * Word 파일도 같은 길이다 — 아이폰이 파일 종류마다 미리보기 · 받기 묻기로 다르게 다루는 것을 저장 창 한 가지로 맞춘다.
 * 버튼은 `src/components/admin/FileDownloadButton.tsx`, 규칙은 이 파일 (`file-download.test.ts`).
 */

/** 받는 파일 종류 — 응답 형식 · 버튼 글에 쓰는 이름 · 확장자 */
export const FILE_KINDS = {
  pdf: { mime: "application/pdf", label: "PDF", ext: "pdf", pick: "'파일에 저장' 이나 '프린트' 를 골라 주세요." },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word",
    ext: "docx",
    pick: "'파일에 저장' 이나 Word 앱을 골라 주세요.",
  },
} as const;
export type FileKind = keyof typeof FILE_KINDS;

/** 버튼 · 안내 글 — 한곳 (PDF 와 Word 가 이름만 다르다) */
export function downloadText(kind: FileKind) {
  const { label, pick } = FILE_KINDS[kind];
  return {
    loading: `${label} 만드는 중…`,
    again: "저장 · 인쇄 창 열기",
    ready: `${label} 를 만들었어요. 버튼을 한 번 더 누르면 저장 창이 열려요 — ${pick}`,
    offline: "인터넷 연결을 확인하고 다시 받아 주세요.",
    failed: `${label} 를 받지 못했어요. 잠시 뒤 다시 받아 주세요.`,
  } as const;
}

/** PDF 버튼 글 (예전 이름 그대로) */
export const DOWNLOAD_TEXT = downloadText("pdf");

export type DeviceInfo = { userAgent: string; platform?: string; maxTouchPoints?: number };

/**
 * 공유 시트로 받는 기기 — 아이폰 · 아이팟 · 아이패드. 아이패드OS 사파리는 맥(`MacIntel`)인 척하므로 터치로 가른다
 * (`push-client.ts` 의 `isIOS` 와 같은 규칙). 아이폰의 크롬 · 네이버 앱 · 카카오톡도 엔진이 사파리라 같은 길이다.
 * 맥 · 안드로이드 · 윈도는 아니다 — 거기서는 링크가 그대로 받는다.
 */
export function prefersShareSheet(d: DeviceInfo): boolean {
  return /iPad|iPhone|iPod/.test(d.userAgent) || (d.platform === "MacIntel" && (d.maxTouchPoints ?? 0) > 1);
}

/** 파일 이름에 못 쓰는 글자 · 제어 문자를 지운다. 남는 것이 없으면 빈 글자 */
const cleanName = (name: string): string =>
  name
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * 응답 머리 `Content-Disposition` 에서 파일 이름 — 한글 이름(`filename*=UTF-8''…`)이 먼저, 없으면 `filename="…"`,
 * 그것도 없거나 읽지 못하면 `fallback`(그것도 비면 `download.확장자`). 저장 창이 이 이름으로 저장한다.
 */
export function fileNameFromDisposition(header: string | null | undefined, fallback: string, ext = "pdf"): string {
  const h = header ?? "";
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(h);
  if (star) {
    try {
      const name = cleanName(decodeURIComponent(star[2].trim().replace(/^"|"$/g, "")));
      if (name) return name;
    } catch {
      // %가 깨진 이름 — 아래 filename 으로
    }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]*))/i.exec(h);
  if (plain) {
    const name = cleanName((plain[1] ?? plain[2] ?? "").replace(/\\(.)/g, "$1"));
    if (name) return name;
  }
  return cleanName(fallback) || `download.${ext}`;
}

/**
 * 받은 응답을 어떻게 다루나.
 * - `file` — 바라던 파일(PDF · Word)이다. 저장 창을 연다
 * - `message` — 우리 라우트의 글 오류(400 · 404 · 503, `text/plain`)라 그 글을 버튼 아래에 보여 준다
 * - `reload` — 로그인 화면 · 권한 없음으로 **튕겼다**(redirect). 지금 화면을 다시 열면 그쪽(로그인 → 다시 이 화면)으로 간다.
 *   파일 주소로 바로 가면 로그인 뒤 PDF 가 화면에 떠서 같은 문제로 돌아온다
 * - `error` — 그 밖 (서버 오류 화면 · 다른 형식 등). 일반 안내
 */
export type FetchedKind = "file" | "message" | "reload" | "error";

export function responseKind(r: { ok: boolean; contentType: string | null; redirected?: boolean }, kind: FileKind = "pdf"): FetchedKind {
  const type = (r.contentType ?? "").toLowerCase();
  if (r.ok && type.includes(FILE_KINDS[kind].mime)) return "file";
  if (type.startsWith("text/plain")) return "message";
  if (r.redirected) return "reload";
  return "error";
}

/** 우리 라우트의 글 오류를 그대로 보여 줄 때의 길이 끝 — 서버 오류 원문이 길게 쏟아지지 않게 */
export const MESSAGE_MAX = 200;

/** 글 오류 정리 — 비었으면 일반 안내 */
export function messageText(body: string): string {
  const t = body.replace(/\s+/g, " ").trim();
  return t ? (t.length > MESSAGE_MAX ? `${t.slice(0, MESSAGE_MAX)}…` : t) : DOWNLOAD_TEXT.failed;
}

/**
 * `navigator.share` 가 던진 것.
 * - `cancelled` — 저장 창을 닫았다 (AbortError). 아무 말도 하지 않는다
 * - `needs-tap` — 누른 지 오래돼 브라우저가 막았다 (NotAllowedError — 파일을 만드는 동안 '누른 순간' 이 지나갔다).
 *   만든 파일을 들고 있다가 **한 번 더 누르면** 그 자리에서 연다
 * - `busy` — 저장 창이 이미 열려 있다 (InvalidStateError — 두 번 눌렀다). 그대로 둔다
 * - `failed` — 그 밖. 예전처럼 파일 주소로 간다 (PDF 는 화면에 뜬다 — 보는 것은 됐다)
 */
export type ShareFailure = "cancelled" | "needs-tap" | "busy" | "failed";

export function shareFailure(error: unknown): ShareFailure {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "AbortError") return "cancelled";
  if (name === "NotAllowedError") return "needs-tap";
  if (name === "InvalidStateError") return "busy";
  return "failed";
}
