/**
 * 비대면 스터디 인증 (2026-09-18 Alan — "비대면 스터디를 신청한 학생은 자료를 받아 풀고 인증을 항상 한다").
 *
 * 자료(날짜) 하나에 인증 1건, 사진 1~10장. 숙제업로드와 같은 한도를 쓴다 (한 장에 20MB).
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
