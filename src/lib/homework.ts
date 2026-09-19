import type { IconName } from "@/components/ui/Icon";

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
/** 강사 코멘트 글자 수 — DB check 제약과 같다 */
export const MAX_FEEDBACK = 1000;

export const HOMEWORK_STATUS_LABEL: Record<string, string> = { submitted: "점검 대기", checked: "점검완료" };

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

/** storage 폴더: homework/{uid}/{레벨}-{과목}. 정책은 첫 폴더(uid)만 본다 */
export const homeworkFolder = (userId: string, level: number, subject: HomeworkSubject) => `${userId}/${level}-${subject}`;

/** "750 · RC" */
export const homeworkLabel = (level: number, subject: string) => `${level} · ${isSubject(subject) ? SUBJECT_LABEL[subject] : subject.toUpperCase()}`;
