import type { IconName } from "@/components/ui/Icon";

/**
 * 숙제업로드 공통 규칙 (2026-09-16 Alan 요청: 레벨 → RC/LC → 사진).
 * 레벨 목록은 DB(lc_levels)에서 읽고, 여기에는 과목·한도 같은 고정 규칙만 둔다.
 */

export const HOMEWORK_SUBJECTS = ["rc", "lc"] as const;
export type HomeworkSubject = (typeof HOMEWORK_SUBJECTS)[number];

export const SUBJECT_LABEL: Record<HomeworkSubject, string> = { rc: "RC", lc: "LC" };
export const SUBJECT_FULL: Record<HomeworkSubject, string> = { rc: "Reading · 독해", lc: "Listening · 듣기" };
export const SUBJECT_DESC: Record<HomeworkSubject, string> = {
  rc: "문법·독해 풀이 사진을 올려요",
  lc: "받아쓰기·듣기 풀이 사진을 올려요",
};
export const SUBJECT_ICON: Record<HomeworkSubject, IconName> = { rc: "rc", lc: "lc" };

export const isSubject = (v: string): v is HomeworkSubject => (HOMEWORK_SUBJECTS as readonly string[]).includes(v);

/** 제출 1건당 사진 수 */
export const MAX_PHOTOS = 10;
/** 사진 한 장 크기 — homework 버킷 한도와 같다 */
export const MAX_PHOTO_MB = 20;
/** 질문 글자 수 — DB check 제약과 같다 */
export const MAX_QUESTION = 500;

export const HOMEWORK_STATUS_LABEL: Record<string, string> = { submitted: "점검 대기", checked: "점검완료" };

/** storage 폴더: homework/{uid}/{레벨}-{과목}. 정책은 첫 폴더(uid)만 본다 */
export const homeworkFolder = (userId: string, level: number, subject: HomeworkSubject) => `${userId}/${level}-${subject}`;

/** "750 · RC" */
export const homeworkLabel = (level: number, subject: string) => `${level} · ${isSubject(subject) ? SUBJECT_LABEL[subject] : subject.toUpperCase()}`;
