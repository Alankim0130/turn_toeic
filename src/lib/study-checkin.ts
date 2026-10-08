/**
 * 비대면 스터디 인증 (2026-09-18 Alan — "비대면 스터디를 신청한 학생은 자료를 받아 풀고 인증을 항상 한다").
 *
 * 자료(날짜) 하나에 인증 1건, 사진 1~10장 (한 장에 20MB).
 * **숙제업로드(정규 수업 숙제)와 완전히 다른 일이다** — 표·버킷·화면·알림 종류가 전부 따로이고, 한도도 여기서 따로 정한다
 * (값이 같아도 숙제 쪽 상수를 가져다 쓰지 않는다 — 한쪽을 바꿀 때 다른 쪽이 따라 바뀌지 않게, 2026-09-23 Alan).
 * 저장 경로 `study-checkins/{uid}/{materialId}/{uuid}.ext` — 버킷 정책이 첫 폴더 = 본인 id 를 확인한다.
 */
export const CHECKIN_BUCKET = "study-checkins";
export const CHECKIN_MAX_PHOTOS = 10;
export const CHECKIN_MAX_PHOTO_MB = 20;
export const CHECKIN_MAX_NOTE = 300;

export const checkinFolder = (userId: string, materialId: number) => `${userId}/${materialId}`;

/** "2026-09-18" → "9월 18일" */
const dayLabel = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일`;
};

/**
 * **비대면스터디 인증 게시판** (2026-10-08 Alan — "비대면 스터디도 숙제 점검 처럼 게시판이 필요합니당~ "비대면스터디 인증" 카테고리 하나 만들어줘.
 * 별도의 페이지가 있으면 좋겠어"). 강사 · 조교가 인증 한 건을 열어 사진을 보고 **확인 완료**(+ 코멘트)한다 — 마이그레이션 20261008140000.
 * 상태는 `submitted`(확인 전) · `checked`(확인 완료) 둘이다. 숙제 점검과 모양만 같고 표 · 화면 · 알림 종류는 따로다.
 */
export const CHECKIN_MAX_FEEDBACK = 1000; // DB check study_checkins_feedback_check 와 같다
export const isCheckinChecked = (status: string | null | undefined) => status === "checked";

/**
 * 확인 완료 알림 (학생 알림함, kind `study_checked`). 코멘트가 있으면 그것이 본문이다.
 * **조교가 확인해도 학생에게 조교 이름이 가지 않는다** — DB 트리거(`private.student_messages_study_sender`)가 보낸 이름을 비운다
 * (2026-10-08 Alan 숙제 알림 — "조교가 했다고 알림가는거 빨리 없애줘". 비대면 스터디는 과목이 없어 선생님 이름을 정할 수 없다).
 */
export function studyCheckedMessage(input: { date?: string | null; seq?: number | null; feedback?: string | null }): { title: string; body: string } {
  const day = input.date ? `${dayLabel(input.date)} ` : "";
  const round = input.seq ? `(${input.seq}회차) ` : "";
  const note = input.feedback?.trim();
  return {
    title: `${day}비대면 스터디 인증을 확인했어요`,
    body: note ? note : `${day}${round}비대면 스터디 인증을 확인했어요. 수고하셨어요!`,
  };
}

/**
 * 강사가 미인증 학생에게 보내는 기본 문구. 강사가 보내기 전에 고칠 수 있다.
 * 짧고 할 일이 분명해야 한다 — 학생은 알림함에서 이것만 보고 움직인다.
 */
export function missingCheckinMessage(date: string): { title: string; body: string } {
  const day = dayLabel(date);
  return {
    title: `${day} 비대면 스터디 인증이 아직 없어요`,
    body: `${day} 비대면 스터디 자료를 풀고 인증을 아직 안 하셨어요. 내 스터디 → 해당 날짜의 [인증하기]에서 풀이 사진을 올려 주세요. 어려운 부분이 있으면 연락하기로 알려 주세요.`,
  };
}
