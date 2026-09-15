/**
 * 파일 업로드 공통 유틸 (브라우저·서버 모두 사용 가능).
 * 서버 액션 본문 한도가 1MB 라 파일은 브라우저에서 Supabase Storage 로 바로 올리고,
 * 서버 액션에는 경로·이름 같은 메타데이터만 넘긴다.
 */

const EXT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".hwp": "application/x-hwp",
  ".hwpx": "application/vnd.hancom.hwpx",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

export const MB = 1024 * 1024;

/** ".pdf" 처럼 소문자 확장자 (없으면 "") */
export function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase().replace(/[^a-z0-9.]/g, "") : "";
}

/** 브라우저가 형식을 못 알려 주는 파일(hwp 등)은 확장자로 채운다 */
export function contentTypeOf(file: { name: string; type: string }) {
  return file.type || EXT_TYPES[fileExt(file.name)] || "application/octet-stream";
}

/** 저장소 객체 이름. 한글 원본 이름은 DB 에 따로 두고, 경로에는 무작위 ASCII 만 쓴다 */
export function objectName(file: { name: string }) {
  return `${crypto.randomUUID()}${fileExt(file.name)}`;
}

/** 서버로 넘기는 업로드 결과 */
export type UploadedFile = { path: string; name: string; size: number; type: string };

/** 경로 조작 방지: 정해진 접두어로 시작하고 상위 폴더 이동이 없어야 한다 */
export function isSafeObjectPath(path: string, prefix: string) {
  return path.startsWith(prefix) && !path.includes("..") && !path.includes("//") && path.length < 300;
}

export const isImageType = (type?: string | null) => !!type && /^image\/(jpeg|png|webp|gif)$/.test(type);
export const isAudioType = (type?: string | null) => !!type && type.startsWith("audio/");
