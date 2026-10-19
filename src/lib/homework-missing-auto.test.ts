import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMissingBoard, homeworkMissingMessage, type MissingEnrollment, type MissingGroup, type MissingSection, type MissingSubmission } from "./homework-missing";
import {
  AUTO_HOURS,
  AUTO_MINUTES,
  autoNoticeRelated,
  autoNotices,
  autoTime,
  autoTimeLabel,
  autoTimeParts,
  DEFAULT_AUTO_TIME,
  freshTracks,
  kstDay,
  lastSentByLevel,
  nextAutoRun,
  noticeLevels,
  noticeTerm,
  sentKey,
  tracksLabel,
} from "./homework-missing-auto";

/*
 * 2026년 10월 기수를 줄인 달력 (개강 10/6 화 · 종강 10/31):
 *   월수금 10/7(수) · 10/9(금) · 10/12(월) · 10/14(수)
 *   화목금 10/6(화) · 10/8(목) · 10/13(화) · 10/15(목)
 * 숙제 기한 = 같은 트랙 다음 수업일 오후 5시.
 */
const MWF = ["2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14"];
const TTF = ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15"];
const nextOf = (dates: readonly string[]): [string, string | null][] => dates.map((d, i) => [d, dates[i + 1] ?? null]);
const DUE = new Map([...nextOf(MWF), ...nextOf(TTF)]);
const at = (kst: string) => Date.parse(`${kst}:00+09:00`);

const sec = (id: number, track: "mwf" | "ttf", level: number, subject: string | null, closes = "2026-10-31"): MissingSection => ({
  id,
  track,
  level,
  subject,
  opens: "2026-10-06",
  closes,
  dates: track === "mwf" ? MWF : TTF,
});
const SECTIONS = new Map(
  [
    sec(1, "mwf", 650, "rc"), // 650 월수금 10:00 RC
    sec(3, "ttf", 650, "lc"), // 650 화목금 10:00 LC
    sec(5, "mwf", 850, "lc"), // 850 월수금 12:30 LC
    sec(11, "mwf", 650, null), // 중급속성 월수금 — 650 RC(1) + 850 LC(5) 를 품는다
    sec(13, "mwf", 650, "rc", "2026-10-12"), // 일찍 끝나는 반 (2주완성처럼 앞 절반)
  ].map((s) => [s.id, s]),
);
const INCLUDES = new Map<number, number[]>([[11, [1, 5]]]);

const S = {
  a: "00000000-0000-0000-0000-0000000000a1", // 650 월수금 주3일
  b: "00000000-0000-0000-0000-0000000000b1", // 중급속성 (650 + 850)
  c: "00000000-0000-0000-0000-0000000000c1", // 650 화목금 주3일
  d: "00000000-0000-0000-0000-0000000000d1", // 650 월수금 — '알림 안 받기'
  e: "00000000-0000-0000-0000-0000000000e1", // 조교 계정 (650 월수금)
  f: "00000000-0000-0000-0000-0000000000f1", // 강사 계정 (650 월수금 — 테스트 배정)
  g: "00000000-0000-0000-0000-0000000000a2", // 650 월수금 — 그날 숙제는 냈다
  h: "00000000-0000-0000-0000-0000000000a3", // 일찍 끝난 반 (10/12 종강)
};
const ENROLL: MissingEnrollment[] = [
  { studentId: S.a, sectionId: 1, from: "2026-10-01" },
  { studentId: S.b, sectionId: 11, from: "2026-10-01" },
  { studentId: S.c, sectionId: 3, from: "2026-10-01" },
  { studentId: S.d, sectionId: 1, from: "2026-10-01" },
  { studentId: S.e, sectionId: 1, from: "2026-10-01" },
  { studentId: S.f, sectionId: 1, from: "2026-10-01" },
  { studentId: S.g, sectionId: 1, from: "2026-10-01" },
  { studentId: S.h, sectionId: 13, from: "2026-10-01" },
];
const PEOPLE = new Map([
  [S.a, { name: "가학생", staff: false }],
  [S.b, { name: "나학생", staff: false }],
  [S.c, { name: "다학생", staff: false }],
  [S.d, { name: "라학생", staff: false }],
  [S.e, { name: "마조교", staff: false, assistant: true }],
  [S.f, { name: "바강사", staff: true }],
  [S.g, { name: "사학생", staff: false }],
  [S.h, { name: "아학생", staff: false }],
]);
/** 10/7 · 10/9 · 10/12 숙제는 다들 냈고, 10/12 숙제(기한 10/14 5시)만 사학생이 냈다 */
const done = (who: string, dates: string[], level: number, subject: string): MissingSubmission[] => dates.map((date) => ({ userId: who, date, level, subject }));
const SUBS: MissingSubmission[] = [
  ...[S.a, S.d, S.e, S.f, S.g, S.h].flatMap((w) => done(w, ["2026-10-07", "2026-10-09"], 650, "rc")),
  ...done(S.b, ["2026-10-07", "2026-10-09"], 650, "rc"),
  ...done(S.b, ["2026-10-07", "2026-10-09"], 850, "lc"),
  ...done(S.c, ["2026-10-06", "2026-10-08"], 650, "lc"),
  ...done(S.g, ["2026-10-12"], 650, "rc"),
];

/** 10/14(수) 밤 9시 — 오늘 5시에 월수금 10/12(월) 숙제의 기한이 지났다. 화목금 10/13 숙제는 내일(10/15) 5시까지 */
const NOW = at("2026-10-14T21:00");
/** 어제 밤 9시 자동 알림이 돌았다 */
const WINDOW = at("2026-10-13T21:00");

function boards(opts: { optedOut?: string[]; subs?: MissingSubmission[]; now?: number } = {}): Map<number, MissingGroup[]> {
  const input = {
    due: DUE,
    sections: SECTIONS,
    includes: INCLUDES,
    enrollments: ENROLL,
    submissions: opts.subs ?? SUBS,
    people: PEOPLE,
    optedOut: new Set(opts.optedOut ?? [S.d]),
    now: opts.now ?? NOW,
  };
  return new Map([650, 850].map((level) => [level, buildMissingBoard({ level, ...input })]));
}
const openUntil = new Map(ENROLL.map((e) => [e.studentId, SECTIONS.get(e.sectionId)!.closes]));

describe("보내는 시각 — 숙제 기한(오후 5시) 뒤 저녁, 5분 단위", () => {
  it("17시 ~ 23시 · 00 ~ 55분 (5분 단위) — 기본 21:00", () => {
    expect(AUTO_HOURS).toEqual(["17", "18", "19", "20", "21", "22", "23"]);
    expect(AUTO_MINUTES).toHaveLength(12);
    expect(AUTO_MINUTES[0]).toBe("00");
    expect(AUTO_MINUTES.at(-1)).toBe("55");
    expect(DEFAULT_AUTO_TIME).toBe("21:00");
  });

  it("고를 수 있는 값만 받는다", () => {
    expect(autoTime("21", "00")).toBe("21:00");
    expect(autoTime("17", "05")).toBe("17:05");
    expect(autoTime("23", "55")).toBe("23:55");
    expect(autoTime("16", "55")).toBeNull();
    expect(autoTime("24", "00")).toBeNull();
    expect(autoTime("21", "03")).toBeNull();
    expect(autoTime("21", "5")).toBeNull();
    expect(autoTime(" 21 ", "00")).toBe("21:00");
    expect(autoTime(undefined, null)).toBeNull();
  });

  it("DB 시각(초까지) → 시 · 분, 이름", () => {
    expect(autoTimeParts("21:00:00")).toEqual({ hour: "21", minute: "00" });
    expect(autoTimeParts("17:35")).toEqual({ hour: "17", minute: "35" });
    expect(autoTimeParts(null)).toEqual({ hour: "21", minute: "00" });
    expect(autoTimeLabel("21:00:00")).toBe("밤 9시");
    expect(autoTimeLabel("17:30")).toBe("오후 5시 30분");
  });

  it("DB check 와 같은 범위 (17:00 ~ 23:55 · 5분 단위)", () => {
    const sql = readMigration();
    expect(sql).toContain("check (send_time between '17:00' and '23:55' and (extract(minute from send_time))::int % 5 = 0 and extract(second from send_time) = 0)");
    expect(sql).toContain("send_time           time not null default '21:00'");
  });
});

describe("다음 자동 알림 — DB 의 보낼 때 판정과 같은 규칙", () => {
  const setting = (sendTime: string, changed: string) => ({ enabled: true, sendTime, scheduleChangedAt: at(changed) });

  it("꺼져 있으면 없다", () => {
    expect(nextAutoRun({ enabled: false, sendTime: "21:00", scheduleChangedAt: 0 }, null, NOW)).toBeNull();
  });

  it("오늘 시각이 아직이면 오늘", () => {
    expect(nextAutoRun(setting("21:00", "2026-10-10T09:00"), null, at("2026-10-14T20:00"))).toEqual({ day: "2026-10-14", time: "21:00", soon: false });
  });

  it("오늘 시각이 지났는데 아직 안 돌았으면 오늘 · 곧", () => {
    expect(nextAutoRun(setting("21:00", "2026-10-10T09:00"), null, at("2026-10-14T21:02"))).toEqual({ day: "2026-10-14", time: "21:00", soon: true });
    // 돌다가 멈춘 것(끝나지 않음)도 곧 다시
    expect(nextAutoRun(setting("21:00", "2026-10-10T09:00"), { finished: false }, at("2026-10-14T21:20"))?.soon).toBe(true);
  });

  it("오늘 끝났으면 내일", () => {
    expect(nextAutoRun(setting("21:00", "2026-10-10T09:00"), { finished: true }, at("2026-10-14T21:05"))).toEqual({ day: "2026-10-15", time: "21:00", soon: false });
  });

  it("지난 시각으로 켜거나 바꿨으면 그 자리에서 보내지 않고 내일부터", () => {
    expect(nextAutoRun(setting("21:00", "2026-10-14T21:30"), null, at("2026-10-14T21:31"))).toEqual({ day: "2026-10-15", time: "21:00", soon: false });
    // 바꾼 시각보다 뒤의 오늘 시각이면 오늘
    expect(nextAutoRun(setting("22:00", "2026-10-14T21:30"), null, at("2026-10-14T21:31"))).toEqual({ day: "2026-10-14", time: "22:00", soon: false });
  });

  it("날짜는 한국 날짜다 (UTC 로 하루가 바뀌는 밤 9시 뒤에도)", () => {
    expect(kstDay(at("2026-10-14T23:55"))).toBe("2026-10-14");
    expect(kstDay(at("2026-10-15T00:05"))).toBe("2026-10-15");
  });
});

describe("보낸 알림의 레벨 · 기수 — DB 와 같은 규칙", () => {
  it("levels(자동 알림) ∪ level(손 알림), 숫자 꼴만", () => {
    expect(noticeLevels({ level: 650 })).toEqual([650]);
    expect(noticeLevels({ level: 650, levels: [650, 850] })).toEqual([650, 850]);
    expect(noticeLevels({ levels: ["850", 650] })).toEqual([650, 850]);
    expect(noticeLevels({ levels: [650.5, "x", 9999999], level: "abc" })).toEqual([]);
    expect(noticeLevels(null)).toEqual([]);
    expect(noticeLevels({ levels: "650" })).toEqual([]);
  });

  it("SQL 도 같은 모양 — levels 배열 · level 을 함께, 숫자 1~6자리", () => {
    const fn = lastFn("private.homework_missing_levels");
    expect(fn).toContain("jsonb_typeof(p_related -> 'levels') = 'array'");
    expect(fn).toContain("where x ~ '^[0-9]{1,6}$'");
    expect(fn).toContain("where p_related ->> 'level' ~ '^[0-9]{1,6}$'");
    const notices = lastFn("public.homework_missing_notices");
    expect(notices).toContain("left join lateral private.homework_missing_levels(m.related) as l (level) on true");
    expect(notices).toContain("if not private.is_crew() then raise exception 'forbidden'");
  });

  it("기수 id", () => {
    expect(noticeTerm({ termId: 3 })).toBe(3);
    expect(noticeTerm({ termId: "3" })).toBe(3);
    expect(noticeTerm({ termId: "x" })).toBeNull();
    expect(noticeTerm(null)).toBeNull();
  });

  it("학생 × 레벨마다 마지막 — 그 기수만, 레벨을 펼친다", () => {
    const m = lastSentByLevel(
      [
        { user_id: S.b, related: { termId: 1, levels: [650, 850] }, created_at: "2026-10-14T09:00:00Z" },
        { user_id: S.b, related: { termId: 1, level: 650 }, created_at: "2026-10-14T10:00:00Z" },
        { user_id: S.b, related: { termId: 2, level: 850 }, created_at: "2026-10-14T11:00:00Z" },
        { user_id: S.a, related: { termId: 1, level: 650 }, created_at: "bad" },
      ],
      1,
    );
    expect(m.get(sentKey(S.b, 650))).toBe(Date.parse("2026-10-14T10:00:00Z"));
    expect(m.get(sentKey(S.b, 850))).toBe(Date.parse("2026-10-14T09:00:00Z"));
    expect(m.has(sentKey(S.a, 650))).toBe(false);
  });
});

describe("누구에게 — 그날 새로 기한이 지난 숙제를 안 낸 학생, 한 사람에 한 통", () => {
  it("월수금 날 저녁 — 월수금 숙제를 안 낸 학생만 (화목금 숙제는 아직 기한 전)", () => {
    const { notices, optedOut } = autoNotices({ boards: boards(), windowFrom: WINDOW, lastSent: new Map(), today: "2026-10-14", openUntil });
    expect(notices.map((n) => n.name)).toEqual(["가학생", "나학생"]);
    // 라학생은 '알림 안 받기' — 세기만 한다. 다학생(화목금)은 기한 전, 사학생은 냈다, 마조교 · 바강사는 빼고, 아학생은 반이 끝났다
    expect(optedOut).toBe(1);
    const a = notices.find((n) => n.userId === S.a)!;
    expect(a.levels).toEqual([650]);
    expect(a.fresh.map((m) => `${m.level} ${m.subject} ${m.date}`)).toEqual(["650 rc 2026-10-12"]);
  });

  it("속성반은 650 · 850 을 한 통에 — 레벨마다 두 통이 가지 않는다", () => {
    const { notices } = autoNotices({ boards: boards(), windowFrom: WINDOW, lastSent: new Map(), today: "2026-10-14", openUntil });
    const b = notices.filter((n) => n.userId === S.b);
    expect(b).toHaveLength(1);
    expect(b[0].levels).toEqual([650, 850]);
    expect(b[0].missing.map((m) => `${m.level} ${m.subject}`).sort()).toEqual(["650 rc", "850 lc"]);
    expect(autoNoticeRelated(1, b[0])).toEqual({ termId: 1, level: 650, levels: [650, 850], subjects: ["rc", "lc"], missing: 2, auto: true });
  });

  it("그 레벨에서 그 숙제로 이미 알림을 받았으면(손으로 오늘 6시에) 다시 보내지 않는다", () => {
    const lastSent = new Map([[sentKey(S.a, 650), at("2026-10-14T18:00")]]);
    const { notices } = autoNotices({ boards: boards(), windowFrom: WINDOW, lastSent, today: "2026-10-14", openUntil });
    expect(notices.map((n) => n.name)).toEqual(["나학생"]);
  });

  it("속성반이 650 만 알림을 받았으면 850 으로는 보낸다 — 글에는 650 숙제도 함께", () => {
    const lastSent = new Map([[sentKey(S.b, 650), at("2026-10-14T18:00")]]);
    const { notices } = autoNotices({ boards: boards(), windowFrom: WINDOW, lastSent, today: "2026-10-14", openUntil });
    const b = notices.find((n) => n.userId === S.b)!;
    expect(b.fresh.map((m) => m.level)).toEqual([850]);
    expect(b.levels).toEqual([650, 850]);
  });

  it("지난번 자동 알림 뒤에 새로 지난 숙제가 없으면 아무에게도 (같은 숙제로 두 번 가지 않는다)", () => {
    // 오늘 밤 9시 실행이 끝난 뒤 다시 돌아도 (창이 오늘 9시부터)
    const { notices } = autoNotices({ boards: boards(), windowFrom: NOW, lastSent: new Map(), today: "2026-10-14", openUntil });
    expect(notices).toEqual([]);
  });

  it("전에 알린 숙제를 아직 안 냈어도, 새로 지난 숙제가 없으면 다시 보내지 않는다", () => {
    // 10/15(목) 밤 9시 — 오늘 5시에 지난 것은 화목금 10/13 숙제. 월수금 10/12 숙제는 어제 알렸다
    const now = at("2026-10-15T21:00");
    const { notices } = autoNotices({
      boards: boards({ now, subs: [...SUBS, ...done(S.c, ["2026-10-13"], 650, "lc")] }),
      windowFrom: at("2026-10-14T21:00"),
      lastSent: new Map(),
      today: "2026-10-15",
      openUntil,
    });
    // 다학생은 화목금 10/13 숙제를 냈다 — 아무도 새로 지난 숙제를 안 낸 학생이 없다
    expect(notices).toEqual([]);
  });

  it("화목금 날 저녁 — 화목금 숙제를 안 낸 학생", () => {
    const now = at("2026-10-15T21:00");
    const { notices } = autoNotices({ boards: boards({ now }), windowFrom: at("2026-10-14T21:00"), lastSent: new Map(), today: "2026-10-15", openUntil });
    expect(notices.map((n) => n.name)).toEqual(["다학생"]);
    expect(notices[0].fresh.map((m) => `${m.subject} ${m.date}`)).toEqual(["lc 2026-10-13"]);
  });

  it("켜기 전에 기한이 지난 숙제는 한꺼번에 알리지 않는다 (창의 시작 = 켠 날 0시)", () => {
    const { notices } = autoNotices({ boards: boards(), windowFrom: at("2026-10-15T00:00"), lastSent: new Map(), today: "2026-10-15", openUntil });
    expect(notices).toEqual([]);
  });

  it("며칠 못 돌았으면(창이 넓으면) 그 사이 지난 숙제를 한 통에", () => {
    const { notices } = autoNotices({ boards: boards({ subs: [] }), windowFrom: at("2026-10-07T00:00"), lastSent: new Map(), today: "2026-10-14", openUntil });
    const a = notices.find((n) => n.userId === S.a)!;
    expect(a.fresh.map((m) => m.date)).toEqual(["2026-10-07", "2026-10-09", "2026-10-12"]);
    expect(notices.filter((n) => n.userId === S.a)).toHaveLength(1);
  });

  it("반이 끝났으면(종강일이 오늘보다 앞) 보내지 않는다 — 더는 숙제를 낼 수 없다", () => {
    const { notices } = autoNotices({ boards: boards(), windowFrom: WINDOW, lastSent: new Map(), today: "2026-10-14", openUntil });
    expect(notices.some((n) => n.userId === S.h)).toBe(false);
    // 종강일 당일까지는 낸다
    const { notices: onDay } = autoNotices({
      boards: boards(),
      windowFrom: WINDOW,
      lastSent: new Map(),
      today: "2026-10-14",
      openUntil: new Map([...openUntil, [S.h, "2026-10-14"]]),
    });
    expect(onDay.some((n) => n.userId === S.h)).toBe(true);
  });

  it("'알림 안 받기' 를 끄면 다시 받는다", () => {
    const { notices, optedOut } = autoNotices({ boards: boards({ optedOut: [] }), windowFrom: WINDOW, lastSent: new Map(), today: "2026-10-14", openUntil });
    expect(notices.map((n) => n.name)).toContain("라학생");
    expect(optedOut).toBe(0);
  });
});

describe("글 · 트랙 표시", () => {
  it("레벨이 둘인 한 통 — 레벨 → RC · LC 순서로 줄", () => {
    const body = homeworkMissingMessage({
      name: "나학생",
      missing: [
        { date: "2026-10-12", subject: "lc", level: 850 },
        { date: "2026-10-12", subject: "rc", level: 650 },
        { date: "2026-10-09", subject: "rc", level: 650 },
      ],
      past: 6,
      done: 3,
    });
    expect(body.split("\n").filter((l) => l.startsWith("· "))).toEqual(["· 650 · RC — 10/9(금), 10/12(월)", "· 850 · LC — 10/12(월)"]);
    expect(body).toContain("기한이 지난 숙제 6개 중 3개를 냈어요.");
  });

  it("레벨을 하나만 주는 손 알림 모양은 그대로", () => {
    const body = homeworkMissingMessage({ name: "가학생", level: 650, missing: [{ date: "2026-10-12", subject: "rc" }], past: 3, done: 2 });
    expect(body.split("\n").filter((l) => l.startsWith("· "))).toEqual(["· 650 · RC — 10/12(월)"]);
  });

  it("새로 지난 숙제의 트랙 → 월수금 · 화목금", () => {
    const track = (d: string) => (MWF.includes(d) ? "mwf" : TTF.includes(d) ? "ttf" : null);
    expect(freshTracks([{ fresh: [{ date: "2026-10-12", subject: "rc", due: "2026-10-14", level: 650 }] }], track)).toEqual(["mwf"]);
    expect(
      freshTracks(
        [
          { fresh: [{ date: "2026-10-13", subject: "lc", due: "2026-10-15", level: 650 }] },
          { fresh: [{ date: "2026-10-12", subject: "rc", due: "2026-10-14", level: 650 }] },
        ],
        track,
      ),
    ).toEqual(["mwf", "ttf"]);
    expect(tracksLabel(["mwf"])).toBe("월수금 숙제");
    expect(tracksLabel(["mwf", "ttf"])).toBe("월수금 · 화목금 숙제");
    expect(tracksLabel([])).toBe("");
    expect(tracksLabel(null)).toBe("");
  });
});

// ─── DB · 서버 코드 모양 ───────────────────────────────────────────────────

const DIR = "supabase/migrations";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const sqlOf = (f: string) =>
  readFileSync(join(DIR, f), "utf8")
    .split("\n")
    .map((l) => (l.trim().startsWith("--") ? "" : l))
    .join("\n");
function readMigration() {
  const f = FILES.find((x) => x.endsWith("_homework_missing_auto.sql"));
  if (!f) throw new Error("자동 알림 마이그레이션이 없다");
  return sqlOf(f);
}
function lastFn(name: string) {
  let fn = "";
  const re = new RegExp(`create or replace function ${name.replace(".", "\\.")}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "g");
  for (const f of FILES) for (const m of sqlOf(f).matchAll(re)) fn = m[1];
  return fn.replace(/\s+/g, " ");
}
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("DB — 설정 · 실행 기록 · 하루 한 번 · 보낸 이름", () => {
  const sql = flat(readMigration());

  it("설정은 강사 · 관리자만 바꾸고(켜기 · 시각 칸만) 조교는 본다, 학생은 못 본다", () => {
    expect(sql).toContain("alter table public.homework_missing_auto enable row level security");
    expect(sql).toContain("grant update (enabled, send_time) on public.homework_missing_auto to authenticated");
    expect(sql).toContain(
      `create policy "homework_missing_auto: 스태프·조교 조회" on public.homework_missing_auto for select to authenticated using ((select private.is_crew()))`,
    );
    expect(sql).toContain(
      `create policy "homework_missing_auto: 스태프 수정" on public.homework_missing_auto for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()))`,
    );
  });

  it("실행 기록은 서버만 쓴다 (authenticated 는 조회만)", () => {
    expect(sql).toContain("alter table public.homework_missing_auto_runs enable row level security");
    expect(sql).toContain("grant select on public.homework_missing_auto_runs to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*homework_missing_auto_runs to authenticated/);
    expect(sql).not.toMatch(/create policy "[^"]+" on public\.homework_missing_auto_runs for (insert|update|delete|all)/);
  });

  it("켜는 순간 첫 실행일 0시부터 본다 · 켜기 · 시각을 바꾸면 그 뒤의 시각부터", () => {
    const touch = lastFn("private.tg_homework_missing_auto_touch");
    expect(touch).toContain("if new.enabled is distinct from old.enabled or new.send_time is distinct from old.send_time then new.schedule_changed_at := now();");
    expect(touch).toContain("if new.enabled and not old.enabled then new.covered_until := case");
    expect(touch).toContain("new.updated_by := auth.uid();");
  });

  it("하루 한 번 — 오늘 실행 한 줄을 가져간다 (멈춘 실행은 15분 뒤), 서버만 부른다", () => {
    const claim = lastFn("public.claim_homework_missing_auto");
    expect(claim).toContain("select * into a from public.homework_missing_auto where id for update;");
    expect(claim).toContain("if v_at > now() or v_at <= a.schedule_changed_at then return;");
    expect(claim).toContain("on conflict on constraint homework_missing_auto_runs_pkey do update");
    expect(claim).toContain("where r.finished_at is null and r.started_at < now() - interval '15 minutes'");
    expect(sql).toContain("revoke all on function public.claim_homework_missing_auto() from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.claim_homework_missing_auto() to service_role");
    const due = lastFn("private.homework_missing_auto_due");
    expect(due).toContain("(private.today_kst() + a.send_time) at time zone 'Asia/Seoul' <= now()");
    expect(due).toContain("(private.today_kst() + a.send_time) at time zone 'Asia/Seoul' > a.schedule_changed_at");
    expect(due).toContain("r.finished_at is not null or r.started_at > now() - interval '15 minutes'");
  });

  it("크론 — 5분마다, 보낼 때일 때만 우리 API 를 부른다", () => {
    expect(sql).toContain("select cron.schedule( 'homework-missing-auto', '*/5 * * * *', $$ select private.call_app('/api/cron/homework-missing-auto') where private.homework_missing_auto_due() $$ );");
    expect(sql).toContain("for r in select jobid from cron.job where jobname = 'homework-missing-auto' loop perform cron.unschedule(r.jobid);");
  });

  it("보낸 사람이 없는 자동 알림도 안 낸 과목의 선생님 이름", () => {
    const body = lastFn("private.student_messages_homework_missing_sender");
    expect(body).toContain("new.sender_id is null or exists (select 1 from public.profiles p where p.id = new.sender_id and p.role <> 'instructor')");
    expect(body).toContain("new.sender_name := private.homework_missing_teacher(new.related)");
  });
});

describe("서버 — 크론 API · 실행 · 설정 저장", () => {
  const route = readFileSync("src/app/api/cron/homework-missing-auto/route.ts", "utf8");
  const run = readFileSync("src/app/admin/homework/_lib/auto-run.ts", "utf8");
  const actions = readFileSync("src/app/admin/homework/missing/actions.ts", "utf8");

  it("API 는 DB 크론의 비밀로만 열리고, 오늘 실행을 가져간 뒤에만 보낸다", () => {
    expect(route).toContain("if (!(await authorizedAppCall(req))) return NextResponse.json({ ok: false }, { status: 401 });");
    expect(route).toContain('admin.rpc("claim_homework_missing_auto")');
    expect(route).toContain("if (!run) return NextResponse.json({ ok: true, claimed: false });");
    // 끝나면 기록을 닫고 다음 실행의 시작을 앞으로만 옮긴다 · 못 끝내면 까닭만 (열어 둔다)
    expect(route).toContain("finished_at: doneAt");
    expect(route).toContain(".or(`covered_until.is.null,covered_until.lt.${covered}`)");
    expect(route).toContain('update({ error: result.error })');
  });

  it("실행 — 수강 중인 기수만 · 손 알림과 같은 격자 · 보낸 사람 없이 homework_missing", () => {
    expect(run).toContain("inTerm(today, t)");
    expect(run).toContain("buildMissingBoard({ level, ...data, now })");
    expect(run).toContain("loadMissingData(admin, term, { names: serverNames(admin) })");
    expect(run).toContain("if (!data.ok) return { ok: false");
    expect(run).toContain("sender_id: null");
    expect(run).toContain('kind: "homework_missing"');
    expect(run).toContain("autoNoticeRelated(term.id, n)");
    expect(run).toContain('.eq("kind", "homework_missing")');
  });

  it("설정 저장은 강사 · 관리자만 (첫 줄), 세션으로", () => {
    const fn = actions.slice(actions.indexOf("export async function saveHomeworkMissingAuto"));
    expect(fn.split("\n")[1].trim()).toBe("await requireStaff();");
    expect(fn).toContain('.from("homework_missing_auto")');
    expect(fn).toContain("await createClient()");
    expect(fn).not.toContain("createAdminClient");
    expect(fn).toContain('revalidatePath("/admin/homework/missing")');
  });
});
