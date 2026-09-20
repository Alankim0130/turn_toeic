import type { VercelConfig } from "@vercel/config/v1";

/**
 * Vercel 프로젝트 설정.
 * Supabase 프로젝트가 서울(ap-northeast-2)에 있으므로 서버 함수도 서울(icn1)에서 실행한다.
 * 모든 페이지가 로그인 쿠키를 읽는 동적 렌더링이라 함수↔DB 거리가 곧 체감 속도다.
 */
export const config: VercelConfig = {
  framework: "nextjs",
  regions: ["icn1"],
  // 매일 21:00 KST(12:00 UTC) 관리자 하루 요약 푸시. CRON_SECRET 으로 인증한다
  crons: [
    { path: "/api/cron/daily-digest", schedule: "0 12 * * *" },
    // 수강증 원본 삭제 — 매일 03:20 KST (18:20 UTC). 사람이 안 쓰는 시각에 돌린다
    { path: "/api/cron/purge-receipts", schedule: "20 18 * * *" },
  ],
};
