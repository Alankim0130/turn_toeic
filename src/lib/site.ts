/** 사이트 공통 설정. 운영 데이터(반·시간대·수강료)는 여기 두지 않는다 — DB 에서 읽는다. */
export const site = {
  name: "역전토익",
  fullName: "역전토익 | 부산 서면 YBM어학원",
  // 우선순위: 직접 지정한 주소 → Vercel 프로덕션 도메인(자동, 커스텀 도메인 연결 시 그 도메인) → 로컬
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
  description:
    "부산 서면 YBM어학원 역전토익. 이혜영(LC)·이영수(RC) 강사의 귀에 꽂히는 압도적인 전달력. 현장 강의와 불라방(실시간 라이브)으로 목표 점수까지 최단 거리.",
  keywords: ["역전토익", "서면 토익", "부산 토익학원", "YBM 서면", "토익 불라방", "이혜영", "이영수", "토익 학원"],
  academy: {
    name: "YBM어학원 부산서면센터",
    ybmUrl: "https://www.ybmedu.com/seomyon/winnertoeic",
    address: "부산광역시 부산진구 서면",
  },
  instructors: [
    { name: "이혜영", part: "LC", desc: "미국 Brigham Young University 영어교육학 전공. 역전토익 대표 강사." },
    { name: "이영수", part: "RC", desc: "부산대학교 영어영문학과 전공. 역전토익 대표 강사." },
  ],
  social: {
    instagram: "",
    youtube: "",
  },
} as const;

export type NavItem = { href: string; label: string; icon: string; auth?: "member" | "student" | "staff" };

/** 상단 네비게이션 */
export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "소개", icon: "home" },
  { href: "/my/verify", label: "등업신청", icon: "verify", auth: "member" },
  { href: "/my/live", label: "불라방", icon: "live", auth: "member" },
  { href: "/my/textbook", label: "교재신청", icon: "textbook", auth: "member" },
  { href: "/my/replay", label: "다시보기", icon: "replay", auth: "member" },
  { href: "/study", label: "스터디", icon: "study" },
  { href: "/my/homework", label: "숙제제출", icon: "homework", auth: "member" },
  { href: "/my/lc-audio", label: "LC음원", icon: "headphones", auth: "member" },
  { href: "/contact", label: "연락하기", icon: "contact" },
];

/** 모바일 하단 네비게이션 (5개) */
export const NAV_BOTTOM: NavItem[] = [
  { href: "/", label: "홈", icon: "home" },
  { href: "/my/verify", label: "등업", icon: "verify" },
  { href: "/my/live", label: "불라방", icon: "live" },
  { href: "/my/replay", label: "다시보기", icon: "replay" },
  { href: "/my", label: "마이", icon: "profile" },
];

/** 관리자 네비게이션 */
export const NAV_ADMIN: NavItem[] = [
  { href: "/admin", label: "대시보드", icon: "analytics" },
  { href: "/admin/students", label: "학생명단", icon: "students" },
  { href: "/admin/sections", label: "반 편성", icon: "calendar" },
  { href: "/admin/verifications", label: "등업 로그", icon: "verify" },
  { href: "/admin/textbook-orders", label: "교재주문", icon: "orders" },
  { href: "/admin/replays", label: "다시보기", icon: "replay" },
  { href: "/admin/analytics", label: "마케팅 분석", icon: "analytics" },
  { href: "/admin/study", label: "스터디 신청자", icon: "study" },
  { href: "/admin/study-materials", label: "비대면 자료", icon: "online" },
  { href: "/admin/homework", label: "숙제점검", icon: "homework" },
  { href: "/admin/lc-audio", label: "LC 음원", icon: "headphones" },
  { href: "/admin/contacts", label: "문의", icon: "contact" },
];
