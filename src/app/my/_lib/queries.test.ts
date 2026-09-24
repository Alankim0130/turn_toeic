import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 학생 화면(`/my`)의 조회는 **RLS 에만 맡기지 않는다** (CLAUDE.md 등급 체계 10).
 *
 * 학생 화면 정책은 대부분 `… or private.is_staff()` 라 **강사·관리자에게는 모든 반·모든 학생이 열린다** —
 * 관리자 화면에는 맞지만 `/my` 에서 그대로 쓰면 남의 반 수업일·녹화본·불라방과 **남의 숙제**가 내 화면에 선다.
 * 학생에게는 멀쩡해 보여서 늦게 발견되고, 2026-09-23~24 에 같은 실수를 **열세 곳**에서 고쳤다.
 * 처음 열한 곳은 `queries.ts` 한 파일만 보고 "다 잡혔다" 고 했다가, 화면·서버 액션까지 전수조사해서
 * 두 곳(계정 통합 신청 · 특강)을 더 찾았다 — **그래서 이 검사는 학생이 닿는 파일 전부를 본다.**
 *
 * 그래서 **소스를 직접 읽어** 못박는다 — 스태프에게 열린 표를 읽는 함수는 반드시 한 번 더 좁혀야 한다.
 * 여기 걸리면 `npm test` 가 깨지므로 다음 세션이 지나칠 수 없다.
 */

/**
 * 학생이 닿는 곳 — `/my` 전부 · 공개 페이지(스터디 신청 · 문의) · QR 출석 · 로그인·가입 · 화면 조각 · 학생 판정.
 * `/files/{kind}/{id}` 는 뺐다 — 목록이 아니라 행 id 하나를 RLS 로 확인해 서명 URL 을 주는 길이고,
 * 관리자 화면(숙제점검 · 자료 관리)이 같은 링크를 쓰므로 스태프에게 열려 있는 것이 맞다.
 * DB 함수(`.rpc`)는 이 검사가 못 본다 — 학생이 부르는 함수는 전부 `auth.uid()` 로 거르는지 2026-09-24 에 확인했다.
 */
const ROOTS = ["src/app/my", "src/app/(public)", "src/app/attend", "src/app/(auth)", "src/app/auth", "src/components"];
const EXTRA_FILES = ["src/lib/auth.ts"];
/** 관리자 화면 조각은 스태프에게 전부 보이는 것이 맞다 */
const SKIP_DIRS = ["src/components/admin"];

function walk(dir: string): string[] {
  if (SKIP_DIRS.includes(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const FILES = [...ROOTS.flatMap(walk), ...EXTRA_FILES];

/**
 * 정책이 **스태프(조교)에게 본인 것 밖까지** 여는 표 — 마이그레이션을 재생해 뽑았다 (2026-09-24).
 * 학생 화면에서 읽으면 반드시 좁혀야 한다. 공용 목록(교재 · 음원 · 스터디 공지 · 반 목록)은 모두에게 같으므로 뺐다.
 */
const WIDE_OPEN_TABLES = [
  // 반·기수로 열리는 것
  "session_dates",
  "replays",
  "session_live_links",
  "section_live_links",
  "study_materials",
  "special_lectures",
  // 사람으로 열리는 것 — 정책이 `본인 or 스태프(조교)` 라 스태프에게는 **모든 학생의 행**이 내려온다
  "homework_submissions",
  "enrollment_orders",
  "enrollment_verifications",
  "enrollments",
  "lecture_signups",
  "textbook_orders",
  "study_signups",
  "study_checkins",
  "student_messages",
  "account_merge_requests",
  "attendance_stamps",
  "attendance_events",
  "profiles",
];

/** 좁히는 방법 */
const NARROWERS: [RegExp, string][] = [
  [/my_section_ids/, "내 반 (public.my_section_ids)"],
  [/\.eq\("(?:user_id|student_id)"/, "내 행"],
  [/\b(?:user_id|student_id): user\.id\b/, "내 id 로 넣는 행 (신청 · 인증 — 넣고 실패하면 그 행만 지운다)"],
  [/\.eq\("id", (?:data\.)?user(?:\.id|Id)\)/, "내 프로필"],
  [/from_user\.eq\./, "내 계정이 걸린 통합 신청 (from_user · to_user)"],
  [/\.in\("(?:section_id|study_id)"/, "부른 쪽이 준 내 반 · 내 스터디 목록"],
  [/signupTerms/, "내 등록에서 뽑은 기수 (getMyStudyEligibility)"],
];

/** 좁히지 않아도 되는 곳 — **까닭을 적어야** 들어올 수 있다 */
const ALLOWED: Record<string, string> = {
  "src/app/my/textbook/actions.ts#submitTextbookOrder":
    "방금 create_textbook_order 가 만든 내 주문을 그 id 로 읽어 스태프 알림에만 쓴다 (화면에 나가지 않는다)",
};

type Block = { file: string; name: string; body: string };

/** 최상위 선언마다 한 덩어리로 자른다 (함수 본문을 파싱하지 않고 경계만 본다) */
function blocksOf(file: string): Block[] {
  const source = readFileSync(file, "utf8");
  const marks = [...source.matchAll(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=/gm)];
  return marks.map((m, i) => ({
    file,
    name: m[1] ?? m[2],
    body: source.slice(m.index!, i + 1 < marks.length ? marks[i + 1].index! : source.length),
  }));
}

const BLOCKS = FILES.flatMap(blocksOf);
const readersOf = (table: string) => BLOCKS.filter((b) => b.body.includes(`from("${table}")`));

describe("/my 조회는 내 것으로 한 번 더 좁힌다", () => {
  it("학생이 닿는 파일을 다 훑는다 (경로나 정규식이 헛돌면 아래 검사가 통째로 무력해진다)", () => {
    expect(FILES).toContain("src/app/my/_lib/queries.ts");
    expect(FILES).toContain("src/app/my/account/page.tsx");
    expect(FILES.some((f) => f.startsWith("src/components/admin"))).toBe(false);
    expect(FILES.length).toBeGreaterThan(40);
    // 알려진 읽는 곳을 찾아야 한다 — 못 찾으면 자르기가 고장난 것이다
    const found = (table: string, name: string) => readersOf(table).some((b) => b.name === name);
    expect(found("replays", "getMyReplays")).toBe(true);
    expect(found("account_merge_requests", "getMyMergeRequests")).toBe(true);
    expect(found("special_lectures", "getMyLectures")).toBe(true);
    expect(found("attendance_stamps", "MyAttendancePage")).toBe(true);
    expect(found("enrollment_orders", "getStudentAccess")).toBe(true);
  });

  it.each(WIDE_OPEN_TABLES)("%s 를 읽는 곳은 전부 좁힌다", (table) => {
    // 한 곳에서 멈추지 않고 **걸린 곳을 전부** 적는다 — 첫 실패가 같은 표의 다른 구멍을 가리면 안 된다
    const offenders = readersOf(table)
      .map((r) => ({ key: `${r.file}#${r.name}`, body: r.body }))
      .filter(({ key, body }) => !ALLOWED[key] && !NARROWERS.some(([re]) => re.test(body)))
      .map(({ key }) => key);
    expect(offenders, `${table} 를 좁히지 않고 읽는 곳 — RLS 는 스태프에게 전부 열어 준다`).toEqual([]);
  });

  it("예외 목록은 실제로 있는 곳만 가리킨다 (지운 함수의 예외가 남아 다른 것을 덮지 않게)", () => {
    for (const key of Object.keys(ALLOWED)) {
      const [file, name] = key.split("#");
      expect(BLOCKS.some((b) => b.file === file && b.name === name), `${key} 가 없다`).toBe(true);
    }
  });

  // 레벨이 걸린 세 화면 (2026-09-24 Alan "다시보기, 숙제, 불라방 모두 내 레벨에 맞는것만").
  // 레벨을 코드로 거르지 않는다 — `my_section_ids()` 가 내 반만 주고, 그 안에 레벨이 이미 들어 있다
  // (스파르타는 `private.section_includes` 가 포함 레벨까지 열어 준다 — 중급속성 650+850 · 실전속성 750+850).
  it.each([
    ["getMyReplays", "다시보기"],
    ["getMySessions", "숙제 달력 · 내 시간표"],
    ["getMyLiveCards", "불라방"],
  ])("%s — %s 는 my_section_ids() 로 내 반만 본다", (fn) => {
    const block = BLOCKS.find((b) => b.file === "src/app/my/_lib/queries.ts" && b.name === fn);
    expect(block, `${fn}() 이 사라졌다 — 이름을 바꿨으면 이 테스트도 같이 고칠 것`).toBeTruthy();
    expect(block!.body).toContain("my_section_ids");
  });
});
