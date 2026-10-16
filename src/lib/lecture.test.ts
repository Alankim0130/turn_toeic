import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASS_MATERIAL_LINK_URL_MAX } from "./class-materials";
import {
  restoreLectureIds,
  ddayLabel,
  isSnsFollow,
  isYbmReviewUrl,
  lectureCameo,
  lectureCondition,
  LECTURE_CONDITION_NOTICE,
  LECTURE_CONDITIONS,
  LECTURE_SUBJECT_ERROR,
  lectureListed,
  lectureState,
  lectureSubjectBlock,
  lectureSubjectNote,
  lectureTitle,
  parseReviewLink,
  reviewLinkError,
  reviewLinkKey,
  seatsLeft,
  sectionSubjects,
  SNS_FOLLOWS,
  snsFollowError,
  sortLectures,
  wayFull,
  YBM_REVIEW_LINK_RE,
  type LectureWayRow,
} from "./lecture";
import { LECTURE_KIND_VALUES, LECTURE_KINDS, LECTURE_WAY_VALUES, LECTURE_WAYS, lectureDayTags, lectureKindSubject, lectureWaysOf, sortByWay } from "./utils";

/** 마이그레이션을 파일 순서대로 — 그 이름의 마지막 정의 본문을 꺼낸다 */
const SQLS = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"));
const lastFn = (name: string) => {
  const file = SQLS.filter((t) => t.includes(`function ${name}(`)).at(-1) ?? "";
  const start = file.indexOf(`function ${name}(`);
  return start < 0 ? "" : file.slice(start, file.indexOf("$$;", start));
};
const lastCheck = (name: string) => {
  const file = SQLS.filter((t) => t.includes(`add constraint ${name}`)).at(-1) ?? "";
  const start = file.lastIndexOf(`add constraint ${name}`);
  return start < 0 ? "" : file.slice(start, file.indexOf(";", start));
};
/** 특강 개편 마이그레이션 (2026-10-16 — 무슨 특강 하나 + 신청 방식) */
const WAYS_MIGRATION = readFileSync("supabase/migrations/20261016120000_lecture_ways.sql", "utf8");

const way = (w: string, o: Partial<LectureWayRow> = {}): LectureWayRow => ({ way: w, enabled: true, capacity: null, signup_condition: "none", applied_count: 0, ...o });
const mock = { date: "2026-10-17", signup: true, ways: [way("onsite"), way("paper"), way("pdf")] };
const stateOf = (l: typeof mock, today: string) => lectureState(l, l.ways, today);

/**
 * 신청이 열리는 때 — **강사가 '신청 받기' 를 누른 특강만, 특강 당일까지** (2026-10-16 Alan — "지금은 7일전부터 오픈인데 이 기능을 없애고
 * 강사가 직접 '신청받기' 버튼을 누르면 바로 오픈되면서 신청을 받을 수 있도록"). 7일 전 자정 자동 열림(2026-10-02)은 없앴다.
 */
describe("lectureState — 강사가 신청 받기를 누른 특강만, 당일까지 (7일 전 자동 열림 없음)", () => {
  it("신청 받기를 누르면 바로 받는 중 · 안 눌렀으면 날짜와 상관없이 신청 받기 전 · 날이 지나면 마감", () => {
    expect(stateOf(mock, "2026-09-01")).toBe("open"); // 한 달 전이어도 누르면 열린다
    expect(stateOf(mock, "2026-10-17")).toBe("open");
    expect(stateOf({ ...mock, signup: false }, "2026-10-16")).toBe("none"); // 전날이어도 안 누르면 닫혀 있다
    expect(stateOf(mock, "2026-10-18")).toBe("closed");
    expect(stateOf({ ...mock, signup: false }, "2026-10-18")).toBe("closed");
  });
  it("받는 방식이 하나도 없으면 신청 받기 전 · 받는 방식이 모두 정원이 차면 정원 마감 · 하나라도 남으면 받는 중", () => {
    expect(stateOf({ ...mock, ways: mock.ways.map((w) => ({ ...w, enabled: false })) }, "2026-10-16")).toBe("none");
    const full = { ...mock, ways: [way("onsite", { capacity: 2, applied_count: 2 }), way("paper", { enabled: false }), way("pdf", { capacity: 1, applied_count: 1 })] };
    expect(stateOf(full, "2026-10-16")).toBe("full");
    const left = { ...mock, ways: [way("onsite", { capacity: 2, applied_count: 2 }), way("pdf")] };
    expect(stateOf(left, "2026-10-16")).toBe("open");
  });
  it("학생 특강 신청 화면에는 받는 중 · 정원 마감인 특강만 선다 (lectureListed)", () => {
    expect(lectureListed(mock, "2026-10-16")).toBe(true);
    expect(lectureListed({ ...mock, signup: false }, "2026-10-16")).toBe(false);
    expect(lectureListed(mock, "2026-10-18")).toBe(false);
    expect(lectureListed({ ...mock, ways: [way("onsite", { capacity: 1, applied_count: 1 })] }, "2026-10-16")).toBe(true); // 정원 마감도 선다
  });
  it("방식마다 정원 · 남은 자리", () => {
    expect(wayFull(way("onsite", { capacity: 3, applied_count: 3 }))).toBe(true);
    expect(wayFull(way("onsite", { capacity: 3, applied_count: 2 }))).toBe(false);
    expect(wayFull(way("onsite"))).toBe(false);
    expect(seatsLeft(way("onsite", { capacity: 40, applied_count: 12 }))).toBe(28);
    expect(seatsLeft(way("onsite", { capacity: 40, applied_count: 45 }))).toBe(0);
    expect(seatsLeft(way("onsite"))).toBeNull();
    expect(ddayLabel(0)).toBe("D-DAY");
    expect(ddayLabel(3)).toBe("D-3");
  });
  it("DB(private.lecture_signup_open — 마지막 정의)도 신청 받기 · 당일까지만 본다 — 신청 시작 시각 · 7일 전은 없다", () => {
    const fn = lastFn("private.lecture_signup_open");
    expect(fn).toContain("and l.signup");
    expect(fn).toContain("private.today_kst() <= l.date");
    expect(fn).toContain("private.is_term_enrollee(l.term_id)");
    expect(fn).not.toContain("signup_opens_at");
    expect(fn).not.toMatch(/interval|- 7|-7/);
    // 방식마다 — 그 방식을 받을 때만 (신청 정책이 이것으로 막는다)
    const wayOpen = lastFn("private.lecture_way_open");
    expect(wayOpen).toContain("private.lecture_signup_open(p_lecture_id)");
    expect(wayOpen).toContain("w.enabled");
    expect(WAYS_MIGRATION).toMatch(/create policy "lecture_signups: 수강생 신청"[\s\S]*?private\.lecture_way_open\(lecture_signups\.lecture_id, lecture_signups\.way\)/);
  });
});

describe("lectureCameo — 강사와 종류에 맞는 캐리커처", () => {
  it("이혜영 LC특강은 헤드폰 노트 컷, 모의고사면 윙크 가리키기", () => {
    expect(lectureCameo("이혜영", ["lc"])?.pose).toBe("notebook");
    expect(lectureCameo("이혜영", ["mock1"])?.pose).toBe("point");
    expect(lectureCameo("이혜영", ["mock2"])?.pose).toBe("point");
    expect(lectureCameo("이혜영", [])?.pose).toBe("point"); // 메모만 있는 특강
  });
  it("이영수 RC특강은 태블릿 컷, 모의고사면 엄지척", () => {
    expect(lectureCameo("이영수", ["rc"])?.pose).toBe("tablet");
    expect(lectureCameo("이영수", ["mock2"])?.pose).toBe("thumbsup");
    expect(lectureCameo("이영수", ["mock1"])?.pose).toBe("thumbsup");
  });
  it("강사가 없거나 두 분이 아니면 그리지 않는다", () => {
    expect(lectureCameo(null, ["rc"])).toBeNull();
    expect(lectureCameo("알런", ["rc"])).toBeNull();
  });
  it("말풍선은 응원만 — 학생이 따라 할 준비물 · 오라는 말 · 점수 약속은 없다 (2026-10-07 Alan)", () => {
    const lines = [
      lectureCameo("이혜영", ["lc"]),
      lectureCameo("이혜영", ["mock1"]),
      lectureCameo("이영수", ["rc"]),
      lectureCameo("이영수", ["mock2"]),
    ].map((c) => c?.line ?? "");
    for (const line of lines) {
      expect(line).not.toBe("");
      expect(line).not.toMatch(/챙기|가져오|준비물|오기만|올려 드릴/);
    }
  });
});

/**
 * 특강 = 무슨 특강 하나 + 신청 방식 (2026-10-16 Alan — "1. 모의고사 신청을 클릭하면, 신청방식을 고를 수 있게 해줘. 버튼형식으로 현장 / 시험지수령 / pdf수령 …
 * 2. RC특강과 LC특강도 클릭하면 신청방식을 고를 수 있도록 해줘. 현장 / 수업영상받기"). 2026-10-15 ~ 10-16 의 종류 열(rc_video · mock1_paper · mock1_pdf …)은 신청 방식이 됐다.
 */
describe("무슨 특강 넷 · 신청 방식 — 이름 · DB check · 순서 · 과목", () => {
  it("무슨 특강은 넷, 신청 방식은 Alan 이 적은 이름 그대로", () => {
    expect(LECTURE_KINDS.map((k) => k.label)).toEqual(["RC특강", "LC특강", "1차 모의고사", "2차 모의고사"]);
    expect(LECTURE_KIND_VALUES).toEqual(["rc", "lc", "mock1", "mock2"]);
    expect(LECTURE_WAYS.map((w) => w.label)).toEqual(["현장", "수업영상 받기", "시험지 수령", "PDF 수령"]);
    expect(lectureWaysOf("rc")).toEqual(["onsite", "video"]);
    expect(lectureWaysOf("lc")).toEqual(["onsite", "video"]);
    expect(lectureWaysOf("mock1")).toEqual(["onsite", "paper", "pdf"]);
    expect(lectureWaysOf("mock2")).toEqual(["onsite", "paper", "pdf"]);
    expect(lectureWaysOf(null)).toEqual(["onsite"]); // 메모만 있는 특강
    expect(sortByWay([{ way: "pdf" }, { way: "onsite" }, { way: "paper" }]).map((w) => w.way)).toEqual(["onsite", "paper", "pdf"]);
  });
  it("DB 와 같은 값 — 무슨 특강 check · 방식 check · private.lecture_kinds 순서 · private.lecture_ways_of · 반 편성 저장", () => {
    const check = lastCheck("special_lectures_kinds_check");
    expect(check).toContain("cardinality(kinds) <= 1");
    const values = check.match(/array\[([^\]]+)\]::text\[\]/)?.[1].split(",").map((k) => k.trim().replace(/'/g, ""));
    expect(values).toEqual(LECTURE_KIND_VALUES);
    const order = lastFn("private.lecture_kinds").match(/array_position\(array\[([^\]]+)\]/)?.[1].split(",").map((k) => k.trim().replace(/'/g, ""));
    expect(order).toEqual(LECTURE_KIND_VALUES);
    const ways = WAYS_MIGRATION.match(/special_lecture_ways_way_check check \(way in \(([^)]+)\)\)/)?.[1].split(",").map((k) => k.trim().replace(/'/g, ""));
    expect(ways).toEqual(LECTURE_WAY_VALUES);
    const waysOf = lastFn("private.lecture_ways_of");
    expect(waysOf).toContain("when p_kind in ('rc', 'lc') then array['onsite', 'video']");
    expect(waysOf).toContain("when p_kind in ('mock1', 'mock2') then array['onsite', 'paper', 'pdf']");
    expect(waysOf).toContain("else array['onsite']");
    // 방식 트리거의 순서도 같다 (옛 앱이 방식 없이 넣으면 첫 받는 방식)
    expect(lastFn("private.lecture_signups_check_way")).toContain(`array_position(array[${LECTURE_WAY_VALUES.map((w) => `'${w}'`).join(", ")}], w.way)`);
    // 반 편성 달력 저장도 같은 값 · 하나만 · 신청 설정(받기 · 정원 · 조건)은 손대지 않는다
    const save = lastFn("public.save_term_schedule");
    expect(save).toContain("coalesce(jsonb_array_length(e -> 'kinds'), 0) > 1");
    expect(save).toContain(`k not in (${LECTURE_KIND_VALUES.map((k) => `'${k}'`).join(", ")})`);
    expect(save).not.toMatch(/signup_opens_at|signup_condition|capacity\s*=/);
  });
  it("과목 — RC특강 = rc · LC특강 = lc · 모의고사 = 없음 (DB private.lecture_kind_subject 와 같다)", () => {
    expect(LECTURE_KIND_VALUES.map(lectureKindSubject)).toEqual(["rc", "lc", null, null]);
    const fn = lastFn("private.lecture_kind_subject");
    expect(fn).toContain("when p_kind = 'rc' then 'rc'");
    expect(fn).toContain("when p_kind = 'lc' then 'lc'");
    // 단과 검사 트리거가 그 함수로 과목을 읽는다
    expect(lastFn("private.lecture_signups_eligible_subject")).toContain("private.lecture_kind_subject(k)");
  });
  it("제목은 무슨 특강 이름 — 메모가 있으면 덧붙인다", () => {
    expect(lectureTitle({ kinds: ["rc"], content: null })).toBe("RC특강");
    expect(lectureTitle({ kinds: ["mock2"], content: "16:00" })).toBe("2차 모의고사 — 16:00");
    expect(lectureTitle({ kinds: [], content: "설명회" })).toBe("설명회");
    expect(lectureTitle({ kinds: [], content: null })).toBe("특강");
  });
  it("같은 날 특강은 RC · LC · 1차 · 2차 순, 메모만 있는 특강은 맨 뒤", () => {
    const list = [
      { id: 5, date: "2026-10-24", kinds: ["mock2"] },
      { id: 9, date: "2026-10-24", kinds: [] },
      { id: 3, date: "2026-10-24", kinds: ["lc"] },
      { id: 4, date: "2026-10-17", kinds: ["mock1"] },
      { id: 7, date: "2026-10-24", kinds: ["rc"] },
    ];
    expect(sortLectures(list).map((l) => l.id)).toEqual([4, 7, 3, 5, 9]);
  });
  it("달력 칸 — 특강마다 이름 (`RC특강` · 좁으면 `RC`), 메모만이면 `특강`, 같은 것은 한 번", () => {
    const tags = lectureDayTags([["mock2"], ["rc"], [], ["rc"]]);
    expect(tags.map((t) => t.short)).toEqual(["RC특강", "2차 모의고사", "특강"]);
    expect(tags.map((t) => t.tiny)).toEqual(["RC", "2차", "특강"]);
    expect(lectureDayTags([])).toEqual([]);
  });
});

describe("특강 개편 마이그레이션 — 같은 날 같은 특강을 하나로 합치고 신청을 방식으로 옮긴다", () => {
  it("같은 기수 · 같은 날 · 같은 무슨 특강이면 하나 (메모만이면 메모까지) — 남는 줄은 현장 줄", () => {
    expect(WAYS_MIGRATION).toContain("partition by r.term_id, r.date, r.base, r.memo_key order by r.way_rank, r.id");
    expect(WAYS_MIGRATION).toContain("when l.kinds[1] in ('mock1', 'mock1_paper', 'mock1_pdf') then 'mock1'");
    expect(WAYS_MIGRATION).toContain("when l.kinds[1] in ('rc_video', 'lc_video') then 'video'");
    expect(WAYS_MIGRATION).toContain("특강 합치기:");
    expect(WAYS_MIGRATION).toContain("drop function private.tmp_lecture_merge_map();");
  });
  it("열려 있던 특강은 열린 그대로 · 열려 있던 방식만 켠다 — 아직 안 열린 특강은 닫고 모든 방식을 켠다", () => {
    expect(WAYS_MIGRATION).toContain("coalesce(l.signup_opens_at, (l.date - 7)::timestamp at time zone 'Asia/Seoul') <= now()");
    expect(WAYS_MIGRATION).toMatch(/when e\.date < v_today then coalesce\(r\.any_signup, false\)[\s\S]*?when e\.open_now then coalesce\(r\.any_open, false\)/);
    expect(WAYS_MIGRATION).toContain("set signup           = x.open_now");
  });
  it("같은 방식이 겹친 신청은 먼저 한 것만 · 방식 둘을 따로 신청한 것은 남긴다 (unique = 특강 · 학생 · 방식)", () => {
    expect(WAYS_MIGRATION).toContain("row_number() over (partition by m.event_id, m.way, s2.user_id order by s2.created_at, s2.id)");
    expect(WAYS_MIGRATION).toContain("drop constraint if exists lecture_signups_lecture_id_user_id_key");
    expect(WAYS_MIGRATION).toContain("unique (lecture_id, user_id, way)");
    expect(WAYS_MIGRATION).toContain("foreign key (lecture_id, way) references public.special_lecture_ways (lecture_id, way)");
  });
  it("옮기는 동안 신청 수 트리거를 끄고 다시 켠다 · 정원은 신청 수보다 적을 수 없다", () => {
    const off = WAYS_MIGRATION.indexOf("disable trigger lecture_signups_sync;");
    const on = WAYS_MIGRATION.indexOf("enable trigger lecture_signups_sync;");
    expect(off).toBeGreaterThan(0);
    expect(on).toBeGreaterThan(off);
    expect(WAYS_MIGRATION).toContain("check (capacity is null or (capacity between 1 and 1000 and capacity >= applied_count))");
  });
});

describe("신청 — 한 특강에 한 방식 · 방식마다 정원 · 닫힌 방식은 조건을 묻기 전에 막는다", () => {
  it("BEFORE 트리거는 이름 순 — 방식(c) → 과목(e) → 조건(r)", () => {
    const names = ["lecture_signups_review_check", "lecture_signups_check_way", "lecture_signups_eligible_subject"];
    expect([...names].sort()).toEqual(["lecture_signups_check_way", "lecture_signups_eligible_subject", "lecture_signups_review_check"]);
    expect(WAYS_MIGRATION).toMatch(/create trigger lecture_signups_check_way\s+before insert on public\.lecture_signups/);
  });
  it("방식 트리거 — 비었으면(옛 앱) 첫 받는 방식 · 본인 신청만 닫힘 · 이미 신청을 막는다", () => {
    const fn = lastFn("private.lecture_signups_check_way");
    expect(fn).toContain("if new.way is null then");
    expect(fn).toContain("if new.user_id = (select auth.uid()) then");
    expect(fn).toContain("'lecture_signup_closed'");
    expect(fn).toContain("'lecture_already_signed'");
    expect(fn).toContain("pg_advisory_xact_lock(");
    expect(fn).toContain("s.user_id = new.user_id");
    // 닫힘을 먼저 본다 — 받지 않는 방식에 "후기 링크를 올려라" 가 먼저 뜨지 않게
    expect(fn.indexOf("'lecture_signup_closed'")).toBeLessThan(fn.indexOf("'lecture_already_signed'"));
  });
  it("정원은 방식마다 — 조건부로 올려 동시에 눌러도 넘지 않는다", () => {
    const fn = lastFn("private.lecture_signups_sync");
    expect(fn).toContain("update public.special_lecture_ways");
    expect(fn).toContain("(capacity is null or applied_count < capacity)");
    expect(fn).toContain("'lecture_full'");
  });
  it("무슨 특강이 바뀌면 방식 줄을 맞추고, 신청자가 있으면 바꾸지 못한다", () => {
    const fn = lastFn("private.sync_lecture_ways");
    expect(fn).toContain("'lecture_kind_signup_block'");
    expect(fn).toContain("private.lecture_ways_of(new.kinds[1])");
    expect(WAYS_MIGRATION).toMatch(/after insert or update of kinds on public\.special_lectures/);
    expect(readFileSync("src/app/admin/sections/actions.ts", "utf8")).toContain('"lecture_kind_signup_block"');
  });
  it("방식 표 — RLS · 조회는 스태프 확인이 먼저(화면 전환 속도 4) · 강사 · 관리자는 받기 · 조건 · 정원만 고친다", () => {
    expect(WAYS_MIGRATION).toContain("alter table public.special_lecture_ways enable row level security");
    expect(WAYS_MIGRATION).toMatch(/using \(\s*\(select private\.is_staff\(\)\)\s*or exists \(select 1 from public\.special_lectures l where l\.id = special_lecture_ways\.lecture_id\)/);
    expect(WAYS_MIGRATION).toContain("grant update (enabled, capacity, signup_condition) on public.special_lecture_ways to authenticated");
    expect(WAYS_MIGRATION).toContain("grant insert (way) on public.lecture_signups to authenticated");
    expect(WAYS_MIGRATION).not.toMatch(/grant (insert|delete|all)[^;]*special_lecture_ways to authenticated/);
  });
  it("서버 액션 — 방식을 받고 그 방식의 조건을 본다 · 새 오류를 학생 말로 바꾼다 · 취소는 방식 하나", () => {
    const action = readFileSync("src/app/my/class/actions.ts", "utf8");
    expect(action).toContain('.from("special_lecture_ways")');
    expect(action).toContain('.select("signup_condition, enabled")');
    expect(action).toContain('"lecture_already_signed"');
    expect(action).toContain('"lecture_signup_closed"');
    expect(action).toMatch(/\.delete\(\)[\s\S]{0,80}\.eq\("lecture_id", lectureId\)[\s\S]{0,40}\.eq\("way", way\)[\s\S]{0,40}\.eq\("user_id", user\.id\)/);
  });
  it("학생 화면 — 신청하기 → 방식 → 조건 → 신청하기, 조건이 있으면 다 마친 뒤 누르라는 안내 (2026-10-16 Alan)", () => {
    expect(LECTURE_CONDITION_NOTICE).toContain("신청 조건을 다 마친 뒤에 신청하기를 눌러 주세요");
    const flow = readFileSync("src/components/my/LectureSignup.tsx", "utf8");
    expect(flow).toContain("신청 방식을 골라 주세요");
    expect(flow).toContain("LECTURE_CONDITION_NOTICE");
    expect(flow).toContain('name="way"');
    const page = readFileSync("src/app/my/lecture/page.tsx", "utf8");
    expect(page).toContain("lectureListed(l, today)");
    expect(page).not.toMatch(/signupDday|SignupOpensIn|lectureOpensAt/);
  });
  it("관리자 — 특강 신청은 종류 버튼 → 방식 버튼 → 명단 · 신청 받기 버튼 · 특강 설정은 종류별", () => {
    const page = readFileSync("src/app/admin/lectures/page.tsx", "utf8");
    expect(page).toContain('paramKey="type"');
    expect(page).toContain('paramKey="way"');
    expect(page).toContain("LectureOpenButton");
    expect(page).toContain("/admin/lectures/settings");
    const settings = readFileSync("src/app/admin/lectures/settings/page.tsx", "utf8");
    expect(settings).toContain("await requireStaff()");
    expect(settings).toContain('paramKey="type"');
    expect(settings).toContain("LectureSettingsForm");
    const actions = readFileSync("src/app/admin/lectures/actions.ts", "utf8");
    expect(actions.match(/await requireStaff\(\);/g)?.length).toBe(3);
  });
});

describe("반 편성 달력 — 특강 버튼 + 날짜 → 팝업에서 무슨 특강 · 강사 · 메모만 (2026-10-16 Alan)", () => {
  const calendar = readFileSync("src/components/admin/sections/TermCalendar.tsx", "utf8");
  it("날짜를 누르면 그 날 특강 팝업이 뜬다 — 붓은 없다 · 신청 방식은 고르지 않는다", () => {
    expect(calendar).toContain("function LectureDayDialog(");
    expect(calendar).toContain("setLectureDay(");
    expect(calendar).not.toMatch(/brushLectures|KindPicker/);
  });
});

describe("특강 id 되살리기 — 같은 특강을 지우고 새로 만들어 신청 설정이 사라지지 않게 (restoreLectureIds, 2026-10-16 점검)", () => {
  const saved = [
    { id: 101, date: "2026-10-17", lecturerId: 1, content: "", kinds: ["mock1"] },
    { id: 102, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["mock2"] },
    { id: 103, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["rc"] },
  ];

  it("달력에서 뺐다가 다시 누른 특강(id 없음)은 원래 id 를 되찾는다 — 예전에는 저장하면 원래 특강을 지우고 새로 만들었다", () => {
    const list = [
      { key: "a", ...saved[0] },
      { key: "new", id: null, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["mock2"] },
      { key: "c", ...saved[2] },
    ];
    expect(restoreLectureIds(list, saved).map((l) => [l.key, l.id])).toEqual([
      ["a", 101],
      ["new", 102],
      ["c", 103],
    ]);
  });

  it("날 · 강사 · 종류 · 내용이 하나라도 다르면 새 특강이다 · 목록이 이미 쓰는 id 는 다시 주지 않는다 · 하나는 한 번만", () => {
    const list = [
      { id: null, date: "2026-10-24", lecturerId: 1, content: "", kinds: ["mock2"] }, // 강사가 다르다
      { id: null, date: "2026-10-24", lecturerId: 2, content: "보충", kinds: ["mock2"] }, // 내용이 다르다
      { id: null, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["lc"] }, // 종류가 다르다
      { id: 103, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["rc"] },
      { id: null, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["rc"] }, // 103 은 목록이 이미 쓴다
      { id: null, date: "2026-10-17", lecturerId: 1, content: " ", kinds: ["mock1"] }, // 앞뒤 빈칸은 같은 내용
      { id: null, date: "2026-10-17", lecturerId: 1, content: "", kinds: ["mock1"] }, // 101 은 바로 앞이 가져갔다
    ];
    expect(restoreLectureIds(list, saved).map((l) => l.id)).toEqual([null, null, null, 103, null, 101, null]);
  });

  it("바꿀 것이 없으면 받은 목록을 그대로 돌려준다 (화면이 다시 그리지 않게)", () => {
    const list = saved.map((l) => ({ ...l }));
    expect(restoreLectureIds(list, saved)).toBe(list);
    const fresh = [{ id: null, date: "2026-10-30", lecturerId: 1, content: "", kinds: ["lc"] }];
    expect(restoreLectureIds(fresh, saved)).toBe(fresh);
  });

  it("서버 액션이 DB 로 보내기 전에, 달력 화면이 다시 누를 때와 저장한 뒤 새 목록을 받을 때 쓴다", () => {
    const action = readFileSync("src/app/admin/sections/actions.ts", "utf8");
    expect(action).toMatch(/toSave = restoreLectureIds\(/);
    expect(action).toMatch(/p_lectures: toSave,/);
    const calendar = readFileSync("src/components/admin/sections/TermCalendar.tsx", "utf8");
    expect(calendar).toMatch(/setLectures\(withSavedInfo\(restoreLectureIds\(/);
    expect(calendar).toMatch(/if \(idsFrom !== saved\.lectures\) \{\s*setIdsFrom\(saved\.lectures\);\s*setLectures\(withSavedInfo\(restoreLectureIds\(lectures, saved\.lectures\), saved\.lectures\)\);/);
  });
});

/**
 * 신청 조건 — 강사가 고른다 (2026-10-15 Alan — "1. 수업후기작성 2. 이미지참고 3. 조건없음" → 2026-10-16 신청 방식마다).
 * 이미지참고 = Alan 이 보낸 그림의 유튜브 구독 · 인스타그램 팔로우(새로 · 기존).
 */
describe("신청 조건 — review · sns · none (DB check · 신청 트리거 · 서버 액션)", () => {
  it("값 셋 · 모르는 값은 조건 없음 · 팔로우는 새로 · 기존", () => {
    expect(LECTURE_CONDITIONS.map((c) => c.value)).toEqual(["review", "sns", "none"]);
    expect(LECTURE_CONDITIONS.map((c) => c.label)).toEqual(["YBM 수강후기 작성", "유튜브 구독 · 인스타그램 팔로우", "조건 없음"]);
    expect(lectureCondition("sns")).toBe("sns");
    expect(lectureCondition("x")).toBe("none");
    expect(lectureCondition(null)).toBe("none");
    expect(SNS_FOLLOWS.map((f) => f.value)).toEqual(["new", "existing"]);
    expect(isSnsFollow("existing")).toBe(true);
    expect(isSnsFollow("old")).toBe(false);
  });
  it("DB check 와 같은 값 — 조건(special_lecture_ways_condition_check) · 팔로우(lecture_signups_sns_follow_check) · 안내 5만 자", () => {
    const vals = (sql: string) => [...(sql.match(/in \(([^)]+)\)/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(vals(WAYS_MIGRATION.match(/special_lecture_ways_condition_check check \([^)]*\)\)/)?.[0] ?? "")).toEqual(LECTURE_CONDITIONS.map((c) => c.value).sort());
    expect(vals(lastCheck("lecture_signups_sns_follow_check"))).toEqual(SNS_FOLLOWS.map((f) => f.value).sort());
    expect(lastCheck("special_lectures_notice_check")).toContain("char_length(notice) <= 50000");
    // 후기 링크 칸 길이는 수업자료실 링크와 같다 (2026-10-08 그대로)
    expect(lastCheck("lecture_signups_review_url_check")).toMatch(new RegExp(`char_length\\(review_url\\) <= ${CLASS_MATERIAL_LINK_URL_MAX}\\b`));
  });
  it("신청을 넣을 때 트리거가 그 방식의 조건으로 본다 — 후기 링크 · 팔로우가 없으면 막고, 조건이 아닌 칸은 비운다", () => {
    const fn = lastFn("private.lecture_signups_review_check");
    expect(fn).toContain("select w.signup_condition into v_condition");
    expect(fn).toContain("where w.lecture_id = new.lecture_id and w.way = new.way");
    expect(fn).toContain("'sns_follow_required'");
    expect(fn).toContain("'review_link_required'");
    expect(fn).toContain("new.review_url := null");
    expect(fn).toContain("new.sns_follow := null");
    // 날짜로 정하던 3주차 규칙(2026-10-08)은 지웠다 — 이제 조건 칸이 정한다
    expect(fn).not.toContain("lecture_needs_review");
    expect(SQLS.join("\n")).toContain("drop function if exists private.lecture_needs_review(bigint)");
    expect(SQLS.join("\n")).toMatch(/before insert on public\.lecture_signups[\s\S]*?lecture_signups_review_check/);
    // 학생이 조건 칸을 넣는다 (칸 단위 grant)
    expect(SQLS.join("\n")).toContain("grant insert (sns_follow) on public.lecture_signups to authenticated");
    expect(WAYS_MIGRATION).toContain("grant update (enabled, capacity, signup_condition) on public.special_lecture_ways to authenticated");
  });
  it("서버 액션이 조건을 보고 칸을 보내고, DB 오류를 학생 말로 바꾼다", () => {
    const action = readFileSync("src/app/my/class/actions.ts", "utf8");
    expect(action).toContain('select("signup_condition, enabled")');
    expect(action).toContain("reviewLinkError(error.message) ?? snsFollowError(error.message)");
    expect(action).toContain('formData.get("youtube") !== "on"');
    expect(reviewLinkError("review_link_required")).toContain("링크를 올려야");
    expect(snsFollowError("sns_follow_required")).toContain("인스타그램");
    expect(snsFollowError("lecture_full")).toBeNull();
  });
  it("있던 특강 — 여러 종류는 종류마다 나누고(신청자도 옮겨 적는다), 조건은 2026-10-08 규칙(모의고사 현강 · 3주차 = 후기)대로", () => {
    const mig = SQLS.find((t) => t.includes("특강 나누기:")) ?? "";
    expect(mig).not.toBe("");
    // 옮겨 적는 동안만 검사 트리거를 끄고 다시 켠다 — 켜는 줄이 끄는 줄 뒤에 있어야 한다
    for (const t of ["lecture_signups_eligible_subject", "lecture_signups_review_check"]) {
      const off = mig.indexOf(`disable trigger ${t};`);
      const on = mig.indexOf(`enable trigger ${t};`);
      expect(off, t).toBeGreaterThan(0);
      expect(on, t).toBeGreaterThan(off);
    }
    expect(mig).toContain("insert into public.lecture_signups (lecture_id, user_id, created_at, review_url)");
    expect(mig).toMatch(/set signup_condition = 'review'[\s\S]*?l\.kinds && array\['mock1', 'mock2'\]::text\[\][\s\S]*?\/ 7 \+ 1 = 3/);
  });
});

describe("parseReviewLink — YBM 수강후기 링크만 받는다 (2026-10-08 Alan 이 보내 준 7월 학생들의 링크 화면)", () => {
  // 7월 링크는 전부 https://www.ybmedu.com/mypage/lessonView/<22자 토큰> 이었다. 실제 학생 링크 · 이름은 저장소에 넣지 않는다 — 토큰 · 이름은 지어낸 것
  const TOKEN = "Ab3dEf-hIjKlMn_pQrStUv";
  const LINK = `https://www.ybmedu.com/mypage/lessonView/${TOKEN}`;

  it("후기 링크를 그대로 받고, https:// 를 빼먹었으면 붙인다", () => {
    expect(parseReviewLink(LINK)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`  www.ybmedu.com/mypage/lessonView/${TOKEN} `)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`https://m.ybmedu.com/mypage/lessonView/${TOKEN}`).ok).toBe(true);
    expect(parseReviewLink(`${LINK}?utm_source=share`).ok).toBe(true);
    expect(parseReviewLink(`${LINK}/`).ok).toBe(true);
  });
  it("7월처럼 `번호/이름/반/주소` 로 붙여 넣거나 공유 글이 붙어 와도 주소만 꺼낸다", () => {
    expect(parseReviewLink(`3/홍길동/750주5일/${LINK}`)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`5/홍길동/650주5일/ ${LINK}`)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`[YBM] 수강후기 ${LINK} 확인해 보세요.`)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`후기: ${LINK}.`)).toEqual({ ok: true, url: LINK });
  });
  it("YBM 후기 링크가 아니면 돌려보낸다 — 첫 화면 · 역전토익 후기 목록 · 토큰 없음 · 다른 사이트", () => {
    for (const u of [
      "",
      "   ",
      "후기 다 썼어요",
      "javascript:alert(1)",
      "https://www.ybmedu.com/",
      "ybmedu.com",
      "https://www.ybmedu.com/seomyon/winnertoeic",
      "https://www.ybmedu.com/seomyon/winnertoeic#tab_area06",
      "https://www.ybmedu.com/mypage/lessonView/",
      "https://www.ybmedu.com/mypage/lessonView/short",
      "https://www.ybmedu.com/mypage/lessonList",
      `https://blog.naver.com/mypage/lessonView/${TOKEN}`,
      `https://ybmedu.com.evil.example/mypage/lessonView/${TOKEN}`,
      `https://evilybmedu.com/mypage/lessonView/${TOKEN}`,
      `https://www.ybmedu.com/mypage/lessonView/${"a".repeat(CLASS_MATERIAL_LINK_URL_MAX)}`,
    ]) {
      expect(parseReviewLink(u).ok, u).toBe(false);
    }
    const bad = parseReviewLink("https://www.ybmedu.com/seomyon/winnertoeic#tab_area06");
    expect(bad.ok === false && bad.error).toContain("https://www.ybmedu.com/mypage/lessonView/");
  });
  it("DB check(lecture_signups_review_url_check — 마지막 정의)와 같은 정규식 — 같은 주소에 같은 답", () => {
    const dir = "supabase/migrations";
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const last = sqls.filter((t) => t.includes("add constraint lecture_signups_review_url_check")).at(-1) ?? "";
    const pattern = last.match(/review_url ~\* '([^']+)'/)?.[1];
    expect(pattern, "DB check 의 정규식을 못 찾음").toBeTruthy();
    expect(last).toMatch(new RegExp(`char_length\\(review_url\\) <= ${CLASS_MATERIAL_LINK_URL_MAX}\\b`));
    // POSIX 문자 묶음 → JS, ~* 는 대소문자를 가리지 않는다
    const sqlRe = new RegExp(pattern!.replace(/\[:space:\]/g, "\\s"), "i");
    const samples = [
      LINK,
      `https://m.ybmedu.com/mypage/lessonView/${TOKEN}`,
      `https://ybmedu.com/m/mypage/lessonview/${TOKEN}`,
      `http://www.ybmedu.com/mypage/lessonView/${TOKEN}#x`,
      `${LINK}?a=1&b=2`,
      `${LINK}/`,
      `${LINK}=`,
      "https://www.ybmedu.com/",
      "https://www.ybmedu.com/seomyon/winnertoeic#tab_area06",
      "https://www.ybmedu.com/mypage/lessonView/",
      "https://www.ybmedu.com/mypage/lessonView/short",
      `https://www.ybmedu.com/mypage/lessonView/${TOKEN}%20x`,
      `https://blog.naver.com/mypage/lessonView/${TOKEN}`,
      `https://ybmedu.com.evil.example/mypage/lessonView/${TOKEN}`,
      `https://evilybmedu.com/mypage/lessonView/${TOKEN}`,
      `https://ybmedu.com@evil.example/mypage/lessonView/${TOKEN}`,
    ];
    for (const u of samples) expect(isYbmReviewUrl(u), u).toBe(sqlRe.test(u));
    expect(samples.filter((u) => isYbmReviewUrl(u)).length).toBe(7);
    // 앱이 저장하는 주소는 늘 DB 를 통과한다
    for (const raw of [LINK, `www.ybmedu.com/mypage/lessonView/${TOKEN}`, `3/홍길동/750주5일/${LINK}`]) {
      const r = parseReviewLink(raw);
      expect(r.ok && sqlRe.test(r.url), raw).toBe(true);
    }
    expect(YBM_REVIEW_LINK_RE.flags).toContain("i");
  });
});

describe("reviewLinkKey — 후기 링크는 한 번만 (2026-10-08 Alan \"후기막기 진행해주고\")", () => {
  // 지어낸 토큰이다 — 실제 학생 링크는 저장소에 넣지 않는다
  const TOKEN = "Ab3dEf-hIjKlMn_pQrStUv";
  const LINK = `https://www.ybmedu.com/mypage/lessonView/${TOKEN}`;

  it("같은 후기면 주소 앞자리 · 꼬리 · 대소문자 · 끝의 = 가 달라도 같은 키", () => {
    const key = reviewLinkKey(LINK);
    expect(key).toBe(TOKEN.toLowerCase());
    for (const u of [
      `https://m.ybmedu.com/mypage/lessonView/${TOKEN}`,
      `http://ybmedu.com/m/mypage/lessonview/${TOKEN.toUpperCase()}`,
      `${LINK}?utm_source=share`,
      `${LINK}#top`,
      `${LINK}/`,
      `${LINK}==`,
    ]) {
      expect(reviewLinkKey(u), u).toBe(key);
    }
  });
  it("다른 후기는 다른 키, 토큰이 없으면 null", () => {
    expect(reviewLinkKey(`https://www.ybmedu.com/mypage/lessonView/${TOKEN}x`)).not.toBe(reviewLinkKey(LINK));
    expect(reviewLinkKey("https://www.ybmedu.com/mypage/lessonView/Zz9yXw-vUtSrQp_oNmLkJi")).not.toBe(reviewLinkKey(LINK));
    for (const u of [null, undefined, "", "https://www.ybmedu.com/", "https://www.ybmedu.com/mypage/lessonView/short", "https://www.ybmedu.com/mypage/lessonView/=========="]) {
      expect(reviewLinkKey(u), String(u)).toBeNull();
    }
  });
  it("DB(private.review_link_key — 마지막 정의)와 같은 규칙 — SQL 의 정규식으로 같은 답", () => {
    const dir = "supabase/migrations";
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const last = sqls.filter((t) => t.includes("function private.review_link_key(")).at(-1) ?? "";
    const start = last.indexOf("function private.review_link_key(");
    const fn = last.slice(start, last.indexOf("$$;", start));
    const m = fn.match(/regexp_match\(p_url, '([^']+)', 'i'\)/);
    expect(m, "SQL 의 정규식을 못 찾음").toBeTruthy();
    expect(fn).toContain("rtrim(");
    expect(fn).toContain("'='))");
    expect(fn).toContain("lower(");
    expect(fn).toContain("nullif(");
    // SQL 을 JS 로 옮긴 것: lower(rtrim(첫 토큰, '=')), 빈 문자열이면 null
    const sqlKey = (u: string) => {
      const t = u.match(new RegExp(m![1], "i"))?.[1];
      return t === undefined ? null : t.replace(/=+$/, "").toLowerCase() || null;
    };
    for (const u of [
      LINK,
      `${LINK}==`,
      `https://M.YBMEDU.COM/MYPAGE/LESSONVIEW/${TOKEN}?x=1`,
      `https://www.ybmedu.com/a/lessonView/${TOKEN}/lessonView/Zz9yXw-vUtSrQp_oNmLkJi`,
      "https://www.ybmedu.com/mypage/lessonView/short",
      "https://www.ybmedu.com/mypage/lessonView/==========",
      "https://www.ybmedu.com/",
    ]) {
      expect(reviewLinkKey(u), u).toBe(sqlKey(u));
    }
  });
  it("신청을 넣을 때 트리거가 키로 막는다 — 다른 학생의 링크 · 다른 달에 쓴 내 링크 · 같은 링크 동시 신청", () => {
    const dir = "supabase/migrations";
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const last = sqls.filter((t) => t.includes("function private.lecture_signups_review_check(")).at(-1) ?? "";
    const start = last.indexOf("function private.lecture_signups_review_check(");
    const fn = last.slice(start, last.indexOf("$$;", start));
    expect(fn).toContain("'review_link_required'");
    expect(fn).toContain("'review_link_taken'");
    expect(fn).toContain("'review_link_reused'");
    expect(fn).toContain("pg_advisory_xact_lock(");
    expect(fn).toContain("s.user_id <> new.user_id");
    expect(fn).toContain("l.term_id <> n.term_id");
    expect(fn.match(/private\.review_link_key\(s\.review_url\) = v_key/g)?.length).toBe(2);
    // 서버 액션이 셋 다 학생 말로 바꾼다
    for (const code of ["review_link_required", "review_link_taken", "review_link_reused"]) expect(reviewLinkError(code), code).toBeTruthy();
    expect(reviewLinkError("lecture_full")).toBeNull();
  });
});

/**
 * 단과 학생은 제 과목 특강만 (2026-10-12 Alan — "특강신청에서 RC 단과반은 LC특강신청이 안되고, LC단과는 RC특강신청이 안되도록").
 * 반이 주는 과목은 학생명단 이름표(singleSubjectOf)와 같은 읽기이고, DB private.lecture_subjects_of · 트리거 lecture_signups_eligible_subject 와 같은 규칙이다.
 */
describe("단과 학생은 제 과목 특강만 — sectionSubjects · lectureSubjectBlock", () => {
  const score = { course_type: "full", program: "score" };
  const rcUnit = { subject: "rc", course: score };
  const lcUnit = { subject: "lc", course: score };
  const bundle = { subject: null, course: score }; // 120 · 140분 묶음 · 방학달 통짜 — 두 과목을 이어 듣는다
  const sparta = { subject: null, course: { course_type: "full", program: "sparta" } };
  const twoweek = { subject: null, course: { course_type: "full", program: "twoweek" } };
  const mine = (...sections: Parameters<typeof sectionSubjects>[0][]) => new Set(sections.flatMap(sectionSubjects));

  it("반이 주는 과목 — 시간 단위 반은 과목 칸, 단과 상품은 그 과목, 그릇 반 · 과목 칸이 빈 반은 두 과목", () => {
    expect(sectionSubjects(rcUnit)).toEqual(["rc"]);
    expect(sectionSubjects(lcUnit)).toEqual(["lc"]);
    expect(sectionSubjects({ subject: "lc", course: { course_type: "rc", program: "score" } })).toEqual(["rc"]);
    expect(sectionSubjects(bundle).sort()).toEqual(["lc", "rc"]);
    expect(sectionSubjects(sparta).sort()).toEqual(["lc", "rc"]);
    expect(sectionSubjects(twoweek).sort()).toEqual(["lc", "rc"]);
    expect(sectionSubjects({ subject: "x", course: score }).sort()).toEqual(["lc", "rc"]); // 모르는 값은 짐작해 막지 않는다
  });

  it("RC 단과는 LC특강 · LC 단과는 RC특강을 못 한다 — 과목이 든 특강은 그 과목을 들어야 한다", () => {
    expect(lectureSubjectBlock(["lc"], mine(rcUnit))).toEqual(["lc"]);
    expect(lectureSubjectBlock(["rc"], mine(rcUnit))).toEqual([]);
    expect(lectureSubjectBlock(["rc"], mine(lcUnit))).toEqual(["rc"]);
  });

  it("모의고사만인 특강은 누구나 · 종합(두 과목) · 속성반 · 2주완성 · 묶음 · 단과 둘을 함께 듣는 학생은 막히지 않는다", () => {
    expect(lectureSubjectBlock(["mock1"], mine(rcUnit))).toEqual([]);
    expect(lectureSubjectBlock(["mock2"], mine(lcUnit))).toEqual([]);
    expect(lectureSubjectBlock([], mine(lcUnit))).toEqual([]);
    expect(lectureSubjectBlock(null, mine(lcUnit))).toEqual([]);
    for (const s of [bundle, sparta, twoweek]) {
      expect(lectureSubjectBlock(["lc"], mine(s))).toEqual([]);
      expect(lectureSubjectBlock(["rc"], mine(s))).toEqual([]);
    }
    expect(lectureSubjectBlock(["lc"], mine(rcUnit, lcUnit))).toEqual([]); // 주5일 60분 · 650 RC 단과 + 750 LC 단과
  });

  it("내 과목을 모르면(빈 집합) 막지 않는다 — 그때는 DB 정책(lecture_signup_open)이 막는다", () => {
    expect(lectureSubjectBlock(["lc"], new Set())).toEqual([]);
  });

  it("문구 — 'RC 단과 수강생은 LC특강을 신청할 수 없어요'", () => {
    expect(lectureSubjectNote(["lc"], mine(rcUnit))).toBe("RC 단과 수강생은 LC특강을 신청할 수 없어요.");
    expect(lectureSubjectNote(["rc"], mine(lcUnit))).toBe("LC 단과 수강생은 RC특강을 신청할 수 없어요.");
    expect(LECTURE_SUBJECT_ERROR).toContain("RC 단과는 RC 특강");
  });

  it("DB(private.lecture_subjects_of — 마지막 정의)와 같은 규칙 · 트리거가 review 검사보다 먼저 · 서버 액션이 오류를 말로 바꾼다", () => {
    const dir = "supabase/migrations";
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const last = sqls.filter((t) => t.includes("function private.lecture_subjects_of(")).at(-1) ?? "";
    const start = last.indexOf("function private.lecture_subjects_of(");
    const fn = last.slice(start, last.indexOf("$$;", start));
    expect(fn).toContain("when c.course_type in ('lc', 'rc') then array[c.course_type]"); // 단과 상품 = 그 과목
    expect(fn).toContain("when c.program <> 'score' or s.subject is null then array['lc', 'rc']"); // 그릇 반 · 과목 칸 없음 = 두 과목
    expect(fn).toContain("when s.subject in ('lc', 'rc') then array[s.subject]"); // 시간 단위 반 = 과목 칸
    expect(fn).toContain("else array['lc', 'rc']"); // 모르는 값은 막지 않는다
    // 그 달 수강 중인 직접 배정만 — is_term_enrollee 와 같은 조건
    expect(fn).toContain("e.status = 'active'");
    expect(fn).toContain("o.status = 'active'");
    expect(fn).toContain("private.today_kst() between s.enrollment_opens_at and s.closes_at");
    const all = sqls.join("\n");
    expect(all).toMatch(/before insert on public\.lecture_signups[\s\S]*?lecture_signups_eligible_subject/);
    expect(all).toContain("raise exception 'lecture_subject_mismatch'");
    // BEFORE INSERT 트리거는 이름순으로 돈다 — 과목 검사가 후기 링크 검사보다 먼저여야 "링크를 올려라" 가 먼저 뜨지 않는다
    expect("lecture_signups_eligible_subject" < "lecture_signups_review_check").toBe(true);
    expect(readFileSync("src/app/my/class/actions.ts", "utf8")).toContain('error.message === "lecture_subject_mismatch"');
  });
});
