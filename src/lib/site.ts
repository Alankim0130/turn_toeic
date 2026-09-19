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
    // YBM 홈 — 회원가입은 여기서 한다 (2026-09-17 Alan "Ybm홈페이지 회원가입 후 학원 데스크에 문의하기"). 등업신청의 "수강증이 없나요?" 카드가 연다
    ybmHomeUrl: "https://www.ybmedu.com/",
    // 네이버 예약 "역전토익 강사상담" 상품 (사업장 459658). 상단 메뉴의 "네이버 상담예약"이 새 창으로 연다
    naverBookingUrl:
      "https://m.booking.naver.com/booking/12/bizes/459658/items/4139011?area=bmp&lang=ko&service-target=map-pc&startDateTime=2026-09-16T00%3A00%3A00%2B09%3A00&theme=place",
    address: "부산광역시 부산진구 서면",
  },
  /**
   * 랜딩 초반의 소개 영상 (2026-09-17 Alan 제공). **바꿀 때 여기 id 만 고친다.**
   * 썸네일을 눌러야 유튜브를 불러오므로(`IntroVideo`) 안 보는 방문자에게는 전송량이 들지 않는다.
   */
  introVideo: { id: "YuRcsGJahTs", label: "역전토익 소개 영상" },
  /**
   * 수강후기 캡쳐 (2026-09-17 Alan 제공). `public/reviews/` 의 그림을 그대로 보여 준다.
   *
   * 두 갈래다 — `kakao` 는 **학생이 선생님에게 보낸 카톡**(Alan 이 게시 동의를 받았다고 확인했다),
   * `ybm` 은 YBM 공식 수강후기 게시판 화면이다.
   *
   * **본문을 옮겨 적지 않는다** — 캡쳐가 원문이고 여기에는 카드 겉면과 `alt` 에 쓸 세 가지만 둔다:
   * `badge`(점수·강좌) · `title`(한 줄 요약) · `meta`(작성자·날짜 또는 출처).
   * **캡쳐에 또렷이 보이는 것만 적는다 — 점수를 짐작해서 쓰지 말 것.**
   * 카톡 마지막 장처럼 점수가 안 보이면 기간만 적는다.
   * 후기를 더하려면 그림을 `public/reviews/` 에 넣고 이 배열에 한 줄 더한다 (자동 수집은 미확정 8).
   *
   * 카톡 캡쳐는 원본이 309~434px 뿐이라 **키우지 않았다** — 늘리면 글자가 뭉개진다.
   * 작은 글자 그림이라 **무손실 WebP** 가 손실 압축보다 더 작고 또렷하다 (188KB → 75KB).
   */
  reviews: [
    // 학생 카톡 — 점수가 바로 보여서 앞에 둔다
    { src: "/reviews/k1.webp", w: 412, h: 513, kind: "kakao", badge: "690 → 780", title: "2주 만에 90점 올랐어요", meta: "학생이 보낸 메시지" },
    { src: "/reviews/k2.webp", w: 434, h: 331, kind: "kakao", badge: "880 · LC 만점", title: "1·2월 수강 뒤 880점", meta: "학생이 보낸 메시지" },
    { src: "/reviews/k3.webp", w: 309, h: 507, kind: "kakao", badge: "865", title: "한 달 수업으로 865점", meta: "학생이 보낸 메시지" },
    { src: "/reviews/k5.webp", w: 332, h: 468, kind: "kakao", badge: "800점 돌파", title: "스파르타 듣고 LC가 들렸어요", meta: "학생이 보낸 메시지" },
    { src: "/reviews/k4.webp", w: 396, h: 510, kind: "kakao", badge: "4개월 수강", title: "학원 덕에 토익에 익숙해졌어요", meta: "학생이 보낸 메시지" },
    // YBM 공식 수강후기 게시판. 작성자 아이디는 YBM 이 가린 그대로 둔다
    { src: "/reviews/1.webp", w: 900, h: 1425, kind: "ybm", badge: "700+중급 한달 점수보장반", title: "역전토익 적극 추천 수강 후기", meta: "dlfud19**** · 2025-05-29" },
    { src: "/reviews/2.webp", w: 900, h: 1368, kind: "ybm", badge: "600+기초 한달 점수보장반", title: "역전토익은 새로운시작이다", meta: "miin2**** · 2025-05-29" },
    { src: "/reviews/3.webp", w: 898, h: 1612, kind: "ybm", badge: "600+기초 한달 점수보장반", title: "역전토익 강사님들은 토익 요령을 귀에 다이렉트로 꼽아주십니다", meta: "yebbi77**** · 2025-05-23" },
    { src: "/reviews/4.webp", w: 900, h: 1607, kind: "ybm", badge: "700+중급 두달완성", title: "역전토익은 빛이다", meta: "tnwl99**** · 2025-05-23" },
  ],
  // 강사 사진: 배경 투명 PNG. 두 장 모두 머리 크기(380px)·구도가 같고 얼굴이 가로 중앙이라 나란히 둬도 맞는다
  // casual: 원본 얼굴을 유지한 채 힉스필드(Nano Banana Pro)로 의상·자세만 바꾸고 배경을 지운 컷. 무릎 위까지라
  //         설명 구간 곳곳에 <InstructorCameo /> 로 등장시킨다. 손짓 방향은 모두 화면 왼쪽 → 콘텐츠 오른쪽에 둔다
  /**
   * 강사 소개 (2026-09-17 Alan 제공 — 소개 슬라이드 2장을 옮겨 적었다).
   * `tagline`·`education`·`years`·`highlights`·`awards` 가 랜딩 강사 소개의 설명 블록이 된다.
   * **문구는 Alan 이 준 그대로다.** 고친 것은 두 가지뿐 — 오타 `멤돈다` → `맴돈다`, 원본의 `**`(각주 표시, 각주 없음) 삭제.
   * `P어학원` 은 원본 표기 그대로 (이전 학원 이름을 가린 것).
   */
  instructors: [
    {
      name: "이혜영",
      part: "LC",
      /** 한 줄 캐치프레이즈. `taglineMark` 부분에 형광펜이 그어진다 (Instructors.tsx) */
      tagline: "귀에 때려 박는듯한 텐션과 압도적인 전달",
      taglineMark: "압도적인 전달",
      education: "미국 Brigham Young University 영어교육학 전공",
      years: 15,
      highlights: [
        {
          icon: "lc",
          title: "지인이 검증하고 추천하는 뇌에 박히는 강의",
          points: ["명쾌한 목소리로 영어가 귀에 착착 감긴다는 전설의 LC강사", "좌중을 유쾌한 매력으로 1시간이 순삭되는 마력의 수업"],
        },
        {
          icon: "target",
          title: "숨만 쉬고 있어도 오르는 점수",
          points: ["체계적인 반복으로 숨만 쉬고 있어도 점수가 오른다!", "토익 LC 만점 수강생이 인정한 압도적인 전달력과 몰입도 높은 강의"],
        },
      ],
      awards: ["P어학원 최우수 강사 선정", "P어학원 수강생이 직접 뽑은 토익부문 최우수 강사 선정", "지인추천 압도적인 강사추천도"],
      photo: { src: "/instructors/lee-hyeyoung.png", width: 827, height: 1500 },
      casual: [
        { pose: "point", src: "/instructors/casual/lee-hyeyoung-point.png", width: 655, height: 1400 },
        { pose: "notebook", src: "/instructors/casual/lee-hyeyoung-notebook.png", width: 623, height: 1400 },
      ],
    },
    {
      name: "이영수",
      part: "RC",
      tagline: "몰입도 높은 & 뇌에 박히는 강의 전문가",
      taglineMark: "뇌에 박히는 강의",
      education: "부산대학교 영어영문학과 졸업",
      years: 12,
      highlights: [
        {
          icon: "bolt",
          title: "몰입도 높은 고퀄리티 강의",
          points: ["10분 같은 1시간!", "미친 입담으로 연극을 보는 듯한 독해 수업"],
        },
        {
          icon: "target",
          title: "쉽게 이해할 수 있는 핵심만 다루는 족집게식 수업",
          points: ["시험장에서 쌤 목소리가 귓가에 맴돈다!", "무엇을 버려야 하는지도 알려준다!", "수강생들이 인정한 미친 적중률을 자랑하는 강의"],
        },
      ],
      awards: ["P어학원 최우수 강사 선정", "지인추천 압도적인 강사추천도"],
      photo: { src: "/instructors/lee-yeongsu.png", width: 1233, height: 1500 },
      casual: [
        { pose: "thumbsup", src: "/instructors/casual/lee-yeongsu-thumbsup.png", width: 681, height: 1400 },
        { pose: "tablet", src: "/instructors/casual/lee-yeongsu-tablet.png", width: 888, height: 1400 },
      ],
    },
  ],
  /**
   * 강사님들 인스타그램 (2026-09-17 Alan 제공). 랜딩 강사 소개와 푸터에서 읽는다.
   *
   * Alan 이 준 주소에는 개인 공유 토큰(`?stkn=…`)이 붙어 있었는데 **떼고 넣었다** —
   * 공유한 사람에게 딸린 값이라 사이트에 박아 두면 그대로 드러나고, 만료되면 링크가 이상해진다.
   * **빈 문자열이면 화면에 링크를 그리지 않는다** — 지웠을 때 빈 버튼이 남지 않게.
   */
  social: {
    instagram: "https://www.instagram.com/ybm_winnertoeic/",
    instagramHandle: "@ybm_winnertoeic",
    youtube: "",
  },
} as const;

// ─── 수강생전용 ─────────────────────────────────────────────────────────────
// 메뉴에는 누구에게나 보이고, 수강생이 아니면 잠금 표시와 함께 소개 페이지(/student)로 안내한다.

export type StudentFeatureKey = "live" | "replay" | "homework" | "study" | "lecture" | "textbook" | "lc-audio";

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
    summary: "레벨·RC/LC별 풀이 사진 제출",
    desc: "레벨과 RC·LC를 고르고 풀이 사진을 올려요. 궁금한 점도 함께 적을 수 있고, 강사가 확인하면 점검완료로 바뀝니다.",
    points: ["레벨 → RC/LC → 사진 3단계", "질문도 함께, 점검 상태 바로 확인"],
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
    key: "lecture",
    href: "/my/lecture",
    label: "특강신청",
    icon: "bolt",
    summary: "특강·모의고사 신청",
    desc: "그 달에 열리는 특강과 모의고사를 신청해요. 정원이 있는 특강은 먼저 신청한 순서대로 자리가 찹니다.",
    points: ["신청 시작 시각까지 남은 시간 표시", "신청 받는 중에는 언제든 취소"],
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
  /** 바깥 사이트로 나가는 링크. 새 창으로 열고 현재 페이지 표시를 하지 않는다 */
  external?: true;
  /** 관리자 메뉴에서 조교도 쓸 수 있는 항목 (2026-09-16 Alan) */
  crew?: true;
};

/** 상단 네비게이션 */
export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "소개", icon: "home" },
  { href: "/my/verify", label: "등업신청", icon: "verify", auth: "member" },
  { href: STUDENT_HUB.href, label: STUDENT_HUB.label, icon: STUDENT_HUB.icon, group: "student" },
  { href: "/contact", label: "연락하기", icon: "contact" },
  { href: site.academy.naverBookingUrl, label: "네이버 상담예약", icon: "calendar", external: true },
];

/**
 * 모바일 하단 네비게이션 (5개).
 * **등업신청은 여기 두지 않는다** (2026-09-19 Alan "하단 네비게이션바에서 등업을 LC음원으로 바꿔줘") —
 * 등업은 한 번 하면 끝이고 LC음원은 매일 듣는다. 등업신청으로 가는 길은 그대로 있다:
 * `/my` 바로가기·등록 없는 학생에게 뜨는 큰 버튼 · 햄버거 서랍(마이페이지) · PC 상단 메뉴.
 */
export const NAV_BOTTOM: NavItem[] = [
  { href: "/", label: "홈", icon: "home" },
  // featureNav 는 아래에서 선언되어 여기서 못 쓴다 (TDZ) — 불라방 줄과 같은 꼴로 적는다
  { href: "/my/lc-audio", label: "LC음원", icon: "headphones", feature: "lc-audio" },
  { href: STUDENT_HUB.href, label: STUDENT_HUB.label, icon: STUDENT_HUB.icon },
  { href: "/my/live", label: "불라방", icon: "live", feature: "live" },
  { href: "/my", label: "마이", icon: "profile" },
];

/** 관리자 네비게이션 */
/**
 * 관리자 메뉴. `crew: true` 인 항목은 **조교도** 쓸 수 있다 (2026-09-16 Alan:
 * 조교는 불라방 교재주문 · 스터디 신청자만). 나머지는 강사·관리자 전용이고
 * 화면마다 requireStaff() 가 한 번 더 막는다.
 */
export const NAV_ADMIN: NavItem[] = [
  { href: "/admin", label: "대시보드", icon: "analytics" },
  { href: "/admin/students", label: "학생명단", icon: "students" },
  { href: "/admin/sections", label: "반 편성", icon: "calendar" },
  { href: "/admin/lectures", label: "특강 신청", icon: "bolt" },
  { href: "/admin/verifications", label: "등업 로그", icon: "verify" },
  { href: "/admin/textbook-orders", label: "교재주문", icon: "orders", crew: true },
  { href: "/admin/replays", label: "다시보기", icon: "replay" },
  { href: "/admin/analytics", label: "마케팅 분석", icon: "analytics" },
  { href: "/admin/study", label: "스터디 신청자", icon: "study", crew: true },
  { href: "/admin/study-materials", label: "비대면 자료", icon: "online" },
  { href: "/admin/homework", label: "숙제점검", icon: "homework" },
  { href: "/admin/lc-audio", label: "LC 음원", icon: "headphones" },
  { href: "/admin/contacts", label: "문의", icon: "contact" },
  { href: "/admin/notifications", label: "알림 설정", icon: "bell" },
];

/** 그 등급이 쓸 수 있는 관리자 메뉴. 조교는 crew 항목만 */
export function navAdminFor(role?: string | null): NavItem[] {
  return role === "assistant" ? NAV_ADMIN.filter((n) => n.crew) : NAV_ADMIN;
}

// ─── 햄버거 메뉴 (모바일·태블릿) ────────────────────────────────────────────
// 2026-09-18 Alan: 마이페이지 위에 있던 메뉴 줄(대시보드 · 등업신청 · 내 시간표 …)을 없애고
// 햄버거 메뉴에 **묶음으로** 담는다 (첫토익 앱의 수업 · 학습 묶음을 본떴다 — 구조만이고 디자인은 우리 것).
// 목록은 여기 한곳 — 서랍(`MobileMenu`)이 그대로 그린다. 잠금 판정은 `feature` 로 한다.

/** 수강생전용 기능 한 줄. 이름·주소·아이콘은 STUDENT_FEATURES 를 그대로 쓴다 (두 곳에 적지 않는다) */
const featureNav = (key: StudentFeatureKey, label?: string): NavItem => {
  const f = STUDENT_FEATURES.find((x) => x.key === key);
  if (!f) throw new Error(`알 수 없는 수강생전용 기능: ${key}`);
  return { href: f.href, label: label ?? f.label, icon: f.icon, feature: key };
};

export type NavSection = { label: string; items: NavItem[] };

/** 햄버거 메뉴의 묶음 (학생 모드). 관리자 모드는 navAdminFor(role) 한 묶음이다 */
export const NAV_DRAWER: NavSection[] = [
  {
    label: "마이페이지",
    items: [
      { href: "/my", label: "대시보드", icon: "profile" },
      { href: "/my/notifications", label: "알림", icon: "bell" },
      { href: "/my/verify", label: "등업신청", icon: "verify" },
    ],
  },
  {
    label: "수업",
    items: [
      { href: "/my/class", label: "내 시간표", icon: "calendar" },
      featureNav("live"),
      featureNav("replay"),
      featureNav("lecture"),
    ],
  },
  {
    label: "학습",
    items: [
      featureNav("study", "스터디 신청"),
      { href: "/my/study", label: "내 스터디", icon: "online" },
      featureNav("lc-audio"),
      featureNav("homework"),
      featureNav("textbook"),
    ],
  },
  {
    label: "안내",
    items: [
      { href: "/", label: "소개", icon: "home" },
      { href: STUDENT_HUB.href, label: "수강생전용 안내", icon: STUDENT_HUB.icon },
      { href: "/contact", label: "연락하기", icon: "contact" },
      { href: site.academy.naverBookingUrl, label: "네이버 상담예약", icon: "calendar", external: true },
    ],
  },
];
