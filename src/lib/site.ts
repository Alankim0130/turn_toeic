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

// ─── 수강생전용 ─────────────────────────────────────────────────────────────
// 메뉴에는 누구에게나 보이고, 수강생이 아니면 잠금 표시와 함께 소개 페이지(/student)로 안내한다.

export type StudentFeatureKey = "live" | "replay" | "homework" | "study" | "textbook" | "lc-audio";

export type StudentFeature = {
  key: StudentFeatureKey;
  href: string;
  label: string;
  icon: string;
  /** 메뉴에 붙는 한 줄 설명 */
  summary: string;
  /** 소개 페이지·잠금 화면 설명 */
  desc: string;
  points: string[];
  /** active: 수강 중인 수강생(student 이상) / enrollee: 예비등록생도 가능 */
  access: "active" | "enrollee";
};

export const STUDENT_HUB = { href: "/student", label: "수강생전용", icon: "exclusive" } as const;

export const STUDENT_FEATURES: StudentFeature[] = [
  {
    key: "live",
    href: "/my/live",
    label: "불라방",
    icon: "live",
    summary: "현장 강의 실시간 입장",
    desc: "현장 강의를 실시간 라이브로 들어요. 집에서도 같은 시간에 같은 수업을 받습니다.",
    points: ["수업 시작 10분 전부터 바로 입장", "입장 링크를 매번 찾을 필요 없이 한곳에서"],
    access: "active",
  },
  {
    key: "replay",
    href: "/my/replay",
    label: "다시보기",
    icon: "replay",
    summary: "놓친 수업 녹화본",
    desc: "놓친 수업이나 다시 듣고 싶은 부분을 녹화본으로 봐요.",
    points: ["회차별로 정리된 녹화본", "강사가 정한 종강일까지 시청"],
    access: "active",
  },
  {
    key: "homework",
    href: "/my/homework",
    label: "숙제업로드",
    icon: "homework",
    summary: "풀이 사진·PDF 제출",
    desc: "비대면스터디 자료를 풀고 풀이 사진이나 PDF를 올려요. 강사가 확인하면 점검완료로 바뀝니다.",
    points: ["날짜별 자료마다 여러 장 제출", "점검 상태를 바로 확인"],
    access: "active",
  },
  {
    key: "study",
    href: "/study",
    label: "스터디",
    icon: "study",
    summary: "대면·비대면·단어 스터디",
    desc: "매달 열리는 대면·비대면·단어 스터디 중 나에게 맞는 스터디를 골라 신청해요.",
    points: ["강사가 정한 시간대 중 선택", "예비등록생도 개강 전에 미리 신청"],
    access: "enrollee",
  },
  {
    key: "textbook",
    href: "/my/textbook",
    label: "불라방교재주문",
    icon: "textbook",
    summary: "교재 집으로 받기",
    desc: "불라방으로 듣는 수강생은 교재를 집으로 받아볼 수 있어요.",
    points: ["배송지만 남기면 신청 끝", "처리 상태와 송장번호 확인"],
    access: "active",
  },
  {
    key: "lc-audio",
    href: "/my/lc-audio",
    label: "LC음원듣기",
    icon: "headphones",
    summary: "레벨별 LC 음원",
    desc: "내 교재 레벨의 LC 음원을 교재 사진을 보고 골라 들어요.",
    points: ["레벨별로 정리된 음원", "휴대폰에서 바로 재생"],
    access: "active",
  },
];

export function canUseFeature(feature: Pick<StudentFeature, "access">, access: { active: boolean; enrollee: boolean }) {
  return feature.access === "enrollee" ? access.enrollee : access.active;
}

/**
 * 메뉴 링크: 이용할 수 있으면 기능 페이지로, 아니면 소개 페이지의 해당 카드로.
 * ?feature= 는 소개 페이지가 그 카드를 강조하는 데 쓴다 (클라이언트 이동에서는 :target 이 안 잡힌다)
 */
export function featureHref(feature: StudentFeature, access: { active: boolean; enrollee: boolean }) {
  return canUseFeature(feature, access) ? feature.href : `${STUDENT_HUB.href}?feature=${feature.key}#${feature.key}`;
}

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  auth?: "member" | "student" | "staff";
  /** 수강생전용 하위 메뉴를 펼치는 항목 */
  group?: "student";
  /** 수강생전용 기능이면 잠금 판정에 쓴다 */
  feature?: StudentFeatureKey;
};

/** 상단 네비게이션 */
export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "소개", icon: "home" },
  { href: "/my/verify", label: "등업신청", icon: "verify", auth: "member" },
  { href: STUDENT_HUB.href, label: STUDENT_HUB.label, icon: STUDENT_HUB.icon, group: "student" },
  { href: "/contact", label: "연락하기", icon: "contact" },
];

/** 모바일 하단 네비게이션 (5개) */
export const NAV_BOTTOM: NavItem[] = [
  { href: "/", label: "홈", icon: "home" },
  { href: "/my/verify", label: "등업", icon: "verify" },
  { href: STUDENT_HUB.href, label: STUDENT_HUB.label, icon: STUDENT_HUB.icon },
  { href: "/my/live", label: "불라방", icon: "live", feature: "live" },
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
  { href: "/admin/notifications", label: "알림 설정", icon: "bell" },
];
