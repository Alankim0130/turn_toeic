import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  copyStudyMessage,
  groupSlotsByLevel,
  hasLevelRequest,
  isSlotKind,
  MATERIAL_LEVELS,
  materialVisibleTo,
  pickCopySource,
  STUDY_KIND_ICON,
  STUDY_KIND_LABEL,
  STUDY_KINDS,
  STUDY_LEVEL_ALL,
  STUDY_LEVELS,
  studyErrorMessage,
  studyLevelLabel,
  studyLevelsOf,
} from "./study";

/** 마이그레이션 파일을 순서대로 — 주석(-- …)은 뺀다 */
const SQLS = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) =>
    readFileSync(`supabase/migrations/${f}`, "utf8")
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n"),
  );
const ALL = SQLS.join("\n");
const lastBody = (re: RegExp) => [...ALL.matchAll(re)].at(-1)?.[0] ?? "";

describe("스터디 종류 — 단어 스터디 · 비대면 둘 (2026-10-12 Alan \"기존 단어스터디를 없애자\")", () => {
  it("종류는 offline(단어 스터디) · online 둘이고 vocab 은 없다", () => {
    expect([...STUDY_KINDS]).toEqual(["offline", "online"]);
    expect(STUDY_KIND_LABEL.offline).toBe("단어 스터디");
    expect(STUDY_KIND_LABEL.online).toBe("비대면스터디");
    expect(STUDY_KIND_LABEL.vocab).toBeUndefined();
    expect(STUDY_KIND_ICON.offline).toBe("vocab");
  });
  it("시간대를 고르는 종류는 단어 스터디뿐", () => {
    expect(isSlotKind("offline")).toBe(true);
    expect(isSlotKind("online")).toBe(false);
    expect(isSlotKind("vocab")).toBe(false);
  });
  it("DB 의 kind check 도 둘 (마지막 정의)", () => {
    expect(lastBody(/add constraint studies_kind_check check \(kind in \(([^)]+)\)\)/g)).toContain("('offline', 'online')");
    // 시간대는 단어 스터디에만
    const slotInsert = lastBody(/create policy "study_slots: 스태프 등록"[\s\S]*?\);/g);
    expect(slotInsert).toContain("s.kind = 'offline'");
    expect(slotInsert).not.toContain("vocab");
  });
});

describe("스터디 레벨 — 단어 1 · 2, 비대면 1 · 2 · 3", () => {
  it("앱의 레벨 목록이 DB private.study_level_max 와 같다", () => {
    expect([...STUDY_LEVELS.offline]).toEqual([1, 2]);
    expect([...STUDY_LEVELS.online]).toEqual([1, 2, 3]);
    const fn = lastBody(/create or replace function private\.study_level_max[\s\S]*?\$\$;/g);
    expect(fn).toContain("when p_kind = 'online' then 3");
    expect(fn).toContain("when p_kind = 'offline' then 2");
    expect(studyLevelsOf("online")).toEqual([1, 2, 3]);
    expect(studyLevelsOf("vocab")).toEqual([]);
    // 칸의 check 도 같은 범위
    expect(ALL).toContain("add column if not exists level smallint check (level is null or level between 1 and 2)"); // study_slots
    expect(ALL).toContain("add column if not exists level smallint check (level is null or level between 1 and 3)"); // study_signups
  });
  it("자료 레벨 — 0 은 공통, 칸은 공통 + 셋", () => {
    expect(STUDY_LEVEL_ALL).toBe(0);
    expect([...MATERIAL_LEVELS]).toEqual([0, 1, 2, 3]);
    expect(ALL).toContain("add column if not exists level smallint not null default 0 check (level between 0 and 3)");
    expect(ALL).toContain("add constraint study_material_items_seq_level_key unique (seq, level)");
    expect(ALL).toContain("create unique index if not exists study_materials_study_seq_level_key on public.study_materials (study_id, seq, level)");
  });
  it("레벨 글자 — 레벨 N · 공통 · 레벨 미정", () => {
    expect(studyLevelLabel(1)).toBe("레벨 1");
    expect(studyLevelLabel(0)).toBe("공통");
    expect(studyLevelLabel(null)).toBe("레벨 미정");
    expect(studyLevelLabel(undefined)).toBe("레벨 미정");
  });
  it("학생에게 보이는 자료 = 내 레벨 + 공통 (레벨을 안 골랐으면 공통만) — DB 조회 정책과 같다", () => {
    expect(materialVisibleTo(0, 1)).toBe(true);
    expect(materialVisibleTo(1, 1)).toBe(true);
    expect(materialVisibleTo(2, 1)).toBe(false);
    expect(materialVisibleTo(0, null)).toBe(true);
    expect(materialVisibleTo(1, null)).toBe(false);
    const policy = lastBody(/create policy "study_materials: 신청자·스태프·조교 조회"[\s\S]*?\);\n/g);
    expect(policy).toContain("(study_materials.level = 0 or study_materials.level = g.level)");
    // 스태프 · 조교 확인이 맨 앞 (2026-10-09 화면 전환 속도 4)
    expect(policy.indexOf("(select private.is_crew())")).toBeLessThan(policy.indexOf("date <="));
    const checkin = lastBody(/create policy "study_checkins: 본인 인증"[\s\S]*?\);\n/g);
    expect(checkin).toContain("(m.level = 0 or m.level = sg.level)");
  });
  it("시간대를 레벨별로 묶는다 — 1 · 2 · 미정(맨 뒤), 묶음 안은 시작 시간순", () => {
    const g = groupSlotsByLevel([
      { id: 3, start_time: "20:00", level: null },
      { id: 2, start_time: "19:00", level: 2 },
      { id: 1, start_time: "18:00", level: 1 },
      { id: 4, start_time: "17:00", level: 2 },
    ]);
    expect(g.map((x) => [x.level, x.slots.map((s) => s.id)])).toEqual([
      [1, [1]],
      [2, [4, 2]],
      [null, [3]],
    ]);
  });
  it("변경 요청 — requested_level 이 있으면 요청 중", () => {
    expect(hasLevelRequest({ requested_level: 2 })).toBe(true);
    expect(hasLevelRequest({ requested_level: null })).toBe(false);
  });
  it("DB 오류를 학생 말로 — 레벨 규칙 · 잠김 · 같은 레벨 · 시간대 레벨 없음", () => {
    expect(studyErrorMessage({ message: "study_level_required" })).toContain("레벨을 골라");
    expect(studyErrorMessage({ message: "study_level_locked" })).toContain("승인");
    expect(studyErrorMessage({ message: "study_level_same" })).toContain("같아요");
    expect(studyErrorMessage({ message: "study_slot_level_missing" })).toContain("레벨이 정해지지");
    expect(studyErrorMessage({ message: "study_slot_gone" })).toContain("시간대");
    expect(studyErrorMessage({ message: "study_not_enrollee" })).toContain("수강 중");
  });
  it("학생이 부르는 함수는 auth.uid() 로 거르고 anon 은 못 부른다 · 승인은 is_crew", () => {
    const set = lastBody(/create or replace function public\.set_study_level[\s\S]*?\$\$;/g);
    expect(set).toContain("v_uid uuid := (select auth.uid())");
    expect(set).toContain("where id = p_signup_id and user_id = v_uid");
    expect(set).toContain("private.is_term_enrollee(s.term_id)");
    const cancel = lastBody(/create or replace function public\.cancel_study_level_request[\s\S]*?\$\$;/g);
    expect(cancel).toContain("user_id = v_uid and requested_level is not null");
    const decide = lastBody(/create or replace function public\.decide_study_level[\s\S]*?\$\$;/g);
    expect(decide).toContain("if not (select private.is_crew()) then");
    expect(ALL).toContain("revoke all on function public.set_study_level(bigint, int, bigint) from public, anon;");
    expect(ALL).toContain("revoke all on function public.cancel_study_level_request(bigint) from public, anon;");
    expect(ALL).toContain("revoke all on function public.decide_study_level(bigint, boolean) from public, anon;");
    // 학생은 level · 요청 칸을 직접 못 고친다 — update grant 는 slot_id 뿐이고 트리거가 레벨이 달라지는 시간대 이동을 막는다
    const grants = [...ALL.matchAll(/grant update \(([^)]+)\) on public\.study_signups to authenticated/g)].map((m) => m[1]);
    expect(grants).toEqual(["slot_id"]);
    const trig = lastBody(/create or replace function private\.study_signups_level\(\)[\s\S]*?\$\$;/g);
    expect(trig).toContain("raise exception 'study_level_locked'");
    expect(trig).toContain("raise exception 'study_level_required'");
    expect(ALL).toContain("before insert or update on public.study_signups\n  for each row execute function private.study_signups_level();");
  });
});

describe("지난달 그대로 가져오기 (2026-10-12 Alan \"응 지난달 그대로 가져오기를 만들어줘\")", () => {
  const c = (year: number, month: number, slotCount: number) => ({ term: { year, month }, slotCount });

  it("이 달보다 앞선 달 중 시간대가 있는 가장 최근 달을 고른다 — 같은 달 · 뒤 달은 아니다", () => {
    const picked = pickCopySource({ year: 2026, month: 11 }, [c(2026, 9, 2), c(2026, 10, 3), c(2026, 11, 1), c(2026, 12, 4)]);
    expect(picked?.term).toEqual({ year: 2026, month: 10 });
  });
  it("지난달에 시간대가 없으면 그 앞 달로 거슬러 간다 (달을 건너뛴 뒤에도)", () => {
    const picked = pickCopySource({ year: 2026, month: 11 }, [c(2026, 8, 2), c(2026, 10, 0)]);
    expect(picked?.term).toEqual({ year: 2026, month: 8 });
  });
  it("해가 바뀌어도 기수 순서로 본다 — 2027년 1월의 지난달은 2026년 12월", () => {
    const picked = pickCopySource({ year: 2027, month: 1 }, [c(2026, 11, 2), c(2026, 12, 3)]);
    expect(picked?.term).toEqual({ year: 2026, month: 12 });
  });
  it("가져올 것이 없으면 null — 앞선 달이 없거나 전부 시간대가 비었을 때", () => {
    expect(pickCopySource({ year: 2026, month: 9 }, [])).toBeNull();
    expect(pickCopySource({ year: 2026, month: 10 }, [c(2026, 9, 0), c(2026, 10, 3), c(2026, 11, 2)])).toBeNull();
  });
  it("가져온 뒤 안내 — 레벨이 비어 있던 시간대가 있으면 수정에서 고르라고 덧붙인다", () => {
    expect(copyStudyMessage({ month: 9 }, [{ level: 1 }, { level: 2 }])).toBe("9월 시간대 2개와 안내를 가져왔어요. 시간 · 정원을 확인한 뒤 '신청 받기'로 바꿔 주세요.");
    expect(copyStudyMessage({ month: 9 }, [{ level: 1 }, { level: null }, { level: null }])).toContain("레벨 미정 2개는 수정에서 레벨을 골라 주세요.");
  });

  it("가져온 안내에 지난달 이름이 그대로 있으면 고치라고 말한다 (2026-10-13 월 넘김 리허설)", () => {
    const slots = [{ level: 1 }];
    expect(copyStudyMessage({ month: 10 }, slots, "10월 단어 스터디 · 302호", { month: 11 })).toContain("안내에 '10월' 이 그대로 있어요 — 11월에 맞게 고쳐 주세요.");
    expect(copyStudyMessage({ month: 10 }, slots, "단어 스터디 · 302호", { month: 11 })).not.toContain("그대로 있어요");
    expect(copyStudyMessage({ month: 10 }, slots, null, { month: 11 })).not.toContain("그대로 있어요");
    // 1월에서 가져올 때 '11월' · '12월' 을 1월로 보지 않는다
    expect(copyStudyMessage({ month: 1 }, slots, "11월 기말 대비 · 12월 일정", { month: 2 })).not.toContain("그대로 있어요");
    expect(copyStudyMessage({ month: 1 }, slots, "1월 단어 스터디", { month: 2 })).toContain("'1월'");
  });
});
