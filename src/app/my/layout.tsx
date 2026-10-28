import { getStudentAccess, isCrew, isStaff, requireUser } from "@/lib/auth";
import { StudentModeKeeper } from "@/components/layout/ModeMemory";
import { SurveyGate } from "@/components/my/SurveyGate";
import { getMySurvey } from "./_lib/queries";

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  // 등록 판정(getStudentAccess)은 루트 레이아웃이 이미 물었다 — 같은 요청이라 다시 묻지 않는다(cache). 설문 조회만 새로 하나, 셋이 함께 돈다
  const [{ profile }, access, survey] = await Promise.all([requireUser("/my"), getStudentAccess(), getMySurvey()]);

  /**
   * 수강생 설문 (2026-10-28 Alan — "등업직후 바로 진행. 다 작성해야지 진행할 수 있도록 해줘. 설문조사는 처음 한번만") — 지금 수강 중이거나
   * 개강 전 등록이 있는데(등업을 마쳤다) 설문이 없으면 다른 화면 대신 설문으로 보낸다. 강사 · 관리자 · 조교 계정은 진짜 등급으로 빼고(테스트 등급도),
   * 설문을 읽지 못했으면 막지 않는다 — 모르는 채로 막으면 사이트를 통째로 못 쓴다.
   */
  const surveyPending = !isCrew(profile?.role) && access.enrollee && !survey.error && !survey.row;

  // 마이페이지 위에 있던 메뉴 줄(대시보드 · 등업신청 · 내 시간표 …)은 2026-09-18 Alan 요청으로 없앴다 —
  // 햄버거 메뉴(`MobileMenu`, `NAV_DRAWER`)가 묶음으로 다 담는다. PC 는 헤더 메뉴. **다시 만들지 말 것**
  return (
    <div className="container-x py-6 sm:py-10">
      {/* 강사 · 관리자가 학생 화면을 보는 동안 "학생 모드 중" 쿠키를 둔다 — 새로고침 · 앱 켜기가 관리자 모드로 돌아가지 않게 (2026-10-11, src/lib/staff-landing.ts) */}
      {isStaff(profile?.role) && <StudentModeKeeper />}
      <SurveyGate pending={surveyPending}>{children}</SurveyGate>
    </div>
  );
}
