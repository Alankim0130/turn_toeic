import type { IconName } from "@/components/ui/Icon";
import { fileExt, isAudioType, isImageType, MB } from "@/lib/upload";

/**
 * 숙제업로드 공통 규칙 — **정규 수업 숙제**다.
 *
 * **비대면 스터디 인증(`study-checkin.ts`)과 완전히 다른 것이다** (2026-09-19 Alan — "비대면스터디에서
 * 올리는 인증과 정규수업에서 올리는 숙제는 완전 다른거야. 철저하게 분리해서 판단해줘").
 * 표도 화면도 알림 종류도 따로다 — 한쪽 규칙을 다른 쪽에 가져다 쓰지 말 것.
 *
 * 학생은 **달력에서 수업 날짜를 고르고** 그 날 레벨의 RC·LC 를 낸다 (2026-09-19 Alan).
 * 레벨 목록은 DB(lc_levels)에서 읽고, 여기에는 과목·한도 같은 고정 규칙만 둔다.
 */

export const HOMEWORK_SUBJECTS = ["rc", "lc"] as const;
export type HomeworkSubject = (typeof HOMEWORK_SUBJECTS)[number];

export const SUBJECT_LABEL: Record<HomeworkSubject, string> = { rc: "RC", lc: "LC" };
export const SUBJECT_FULL: Record<HomeworkSubject, string> = { rc: "Reading · 독해", lc: "Listening · 듣기" };
export const SUBJECT_DESC: Record<HomeworkSubject, string> = {
  rc: "문법·독해 풀이를 올려요",
  lc: "받아쓰기·듣기 풀이를 올려요",
};
export const SUBJECT_ICON: Record<HomeworkSubject, IconName> = { rc: "rc", lc: "lc" };

export const isSubject = (v: string): v is HomeworkSubject => (HOMEWORK_SUBJECTS as readonly string[]).includes(v);

/** 제출 1건당 사진 수 */
export const MAX_PHOTOS = 10;
/**
 * 사진 한 장 크기. homework 버킷 한도는 음성 때문에 50MB 라(형식마다 따로 못 둔다) **사진 20MB 는 폼과 서버 액션이 본다**.
 */
export const MAX_PHOTO_MB = 20;
/**
 * 음성 파일 — 제출 1건당 개수 · 한 개 크기 (2026-10-07 Alan — "학생들이 숙제제출할때 음성파일도 올릴수 있도록 부탁해!").
 * 크기는 homework 버킷 한도(마이그레이션 20261007120000)와 같다 — LC 음원 버킷과 같은 50MB 다.
 * 사진과 따로 센다 — 사진만 내던 학생의 한도(10장)는 그대로다.
 */
export const MAX_AUDIOS = 5;
export const MAX_AUDIO_MB = 50;

/**
 * 녹음 앱이 만드는 확장자 → 저장할 형식. 브라우저가 형식을 비워 주거나(`""` · `application/octet-stream`)
 * 엉뚱하게 알려 줄 때 이것으로 정한다 — 그대로 올리면 형식을 제한한 버킷이 튕긴다.
 * **`.mp4` · `.3gp` · `.webm` 은 넣지 않는다** — 영상일 수도 있어 확장자로 음성이라고 못 박을 수 없다 (그런 녹음은 브라우저가 audio/… 로 알려 줄 때만 받는다).
 */
const AUDIO_EXT: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".weba": "audio/webm",
  ".flac": "audio/flac",
  ".amr": "audio/amr",
  ".3ga": "audio/3gpp",
};

/** 음성 고르기 칸의 accept — 형식으로 거르고, 형식을 모르는 휴대폰을 위해 확장자도 함께 준다 */
export const HOMEWORK_AUDIO_ACCEPT = ["audio/*", ...Object.keys(AUDIO_EXT)].join(",");

/** 고른 파일이 음성이면 저장할 형식(`audio/…`), 아니면 null */
export function homeworkAudioType(file: { name: string; type: string }): string | null {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("audio/")) return t;
  return AUDIO_EXT[fileExt(file.name)] ?? null;
}

/**
 * 저장된 숙제 파일을 화면에서 가르는 한곳 — 사진(썸네일 · 넘겨 보기) · 음성(플레이어) · 그 밖(옛 첨부, 링크로 연다).
 * 학생 제출 카드와 강사 숙제점검이 같은 것을 쓴다.
 */
export type HomeworkFileKind = "photo" | "audio" | "other";
export function homeworkFileKind(contentType?: string | null): HomeworkFileKind {
  if (isImageType(contentType)) return "photo";
  if (isAudioType(contentType)) return "audio";
  return "other";
}

/** `사진 3장 · 음성 1개` — 학생 카드의 접힌 줄과 강사 목록 줄이 같은 말을 쓴다. 파일이 없으면 빈 문자열 */
export function homeworkFilesLabel(files: { content_type?: string | null }[]): string {
  const n: Record<HomeworkFileKind, number> = { photo: 0, audio: 0, other: 0 };
  for (const f of files) n[homeworkFileKind(f.content_type)]++;
  return [n.photo ? `사진 ${n.photo}장` : null, n.audio ? `음성 ${n.audio}개` : null, n.other ? `첨부 ${n.other}개` : null].filter(Boolean).join(" · ");
}

/**
 * 제출할 파일 묶음 검사 — 서버 액션이 쓰고 폼도 내기 전에 같은 것으로 본다. 문제가 있으면 학생에게 보일 문장, 없으면 null.
 * 형식은 **올릴 때 붙인 형식**(`image/…` · `audio/…`)으로 가른다. 사진은 1장도 없어도 된다 — 음성만 내는 숙제가 있다.
 */
export function homeworkFilesError(files: { type?: string | null; size: number }[]): string | null {
  const photos = files.filter((f) => f.type?.startsWith("image/"));
  const audios = files.filter((f) => f.type?.startsWith("audio/"));
  if (files.length === 0) return "풀이 사진이나 음성 파일을 하나 이상 골라 주세요.";
  if (photos.length + audios.length < files.length) return "사진이나 음성 파일만 올릴 수 있어요.";
  if (photos.length > MAX_PHOTOS) return `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요.`;
  if (audios.length > MAX_AUDIOS) return `음성 파일은 ${MAX_AUDIOS}개까지 올릴 수 있어요.`;
  if (photos.some((f) => !(f.size > 0 && f.size <= MAX_PHOTO_MB * MB))) return `사진은 한 장에 ${MAX_PHOTO_MB}MB 이하만 올릴 수 있어요.`;
  if (audios.some((f) => !(f.size > 0 && f.size <= MAX_AUDIO_MB * MB))) return `음성 파일은 한 개에 ${MAX_AUDIO_MB}MB 이하만 올릴 수 있어요.`;
  return null;
}
/** 질문 글자 수 — DB check 제약과 같다 */
export const MAX_QUESTION = 500;
/** 강사 코멘트 글자 수 — DB check 제약과 같다 */
export const MAX_FEEDBACK = 1000;

/**
 * **학생 화면**의 제출 상태 한 줄 (2026-09-22 Alan — "길쭉한 카드모양에 제출함 이렇게 간단하게 나오고,
 * 강사가 확인했다면 **강사 점검 완료! 수고하셨습니다!** 이렇게 글자가 남아있으면 좋겠어").
 * 학생에게는 `점검 대기` 가 아니라 **`제출함`** 이다 — 낸 사람이 볼 말은 "내가 냈다" 이지 강사의 할 일이 아니다.
 * 관리자 숙제점검의 탭 이름(`점검 대기` · `점검 완료`)은 이것과 별개다 (보는 사람이 다르다).
 */
export const HOMEWORK_STATUS_LABEL: Record<string, string> = { submitted: "제출함", checked: "강사 점검 완료! 수고하셨습니다!" };

/**
 * 그 날 수업의 레벨들 — 달력에서 날짜를 누르면 나오는 제출 칸.
 *
 * **중급속성·실전속성(스파르타)은 두 레벨이 다 나온다** (2026-09-19 Alan) — 그 학생은 자기 레벨과
 * `includes_levels`(650+850 · 750+850) 를 함께 듣기 때문이다. 판정 근거는 강좌 행이고
 * **코드에 레벨을 적지 않는다** (작업 원칙 4).
 */
export function levelsOfDay(courses: ({ target_score?: number | null; includes_levels?: number[] | null } | null | undefined)[]): number[] {
  const out = new Set<number>();
  for (const c of courses) {
    if (!c) continue;
    if (typeof c.target_score === "number") out.add(c.target_score);
    for (const l of c.includes_levels ?? []) out.add(l);
  }
  return [...out].sort((a, b) => a - b);
}

/** "9월 17일" — 알림 문구와 달력 줄에 쓴다 */
export function classDayLabel(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return Number.isFinite(m) && Number.isFinite(d) ? `${m}월 ${d}일` : date;
}

/**
 * 점검완료 알림의 기본 문구 (2026-09-19 Alan — "학생들은 숙제점검 완료 알림을 받고 확인을 할 수 있다").
 * 강사 코멘트가 있으면 그대로 싣는다 — 학생은 알림함에서 이것만 보고 움직인다.
 */
export function homeworkCheckedMessage(input: { level: number; subject: string; classDate?: string | null; feedback?: string | null }) {
  const what = `${homeworkLabel(input.level, input.subject)} 숙제`;
  const day = input.classDate ? `${classDayLabel(input.classDate)} ` : "";
  const note = input.feedback?.trim();
  return {
    title: `${day}${what} 점검이 끝났어요`,
    body: note ? note : `${day}${what}를 확인했어요. 숙제업로드에서 확인해 주세요.`,
  };
}

/** storage 폴더: homework/{uid}/{레벨}-{과목}. 정책은 첫 폴더(uid)만 본다 — 사진과 음성이 같은 폴더에 든다 */
export const homeworkFolder = (userId: string, level: number, subject: HomeworkSubject) => `${userId}/${level}-${subject}`;

/** "750 · RC" */
export const homeworkLabel = (level: number, subject: string) => `${level} · ${isSubject(subject) ? SUBJECT_LABEL[subject] : subject.toUpperCase()}`;
