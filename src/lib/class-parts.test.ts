import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ofPart, partLabel, partSpan, partSubject, partsOf, partTimeBlock, sectionParts, toPart } from "./class-parts";

/**
 * 방학달 통짜 반의 두 교시 · 두 방송 (2026-11-05 Alan "각자 방송을 진행해").
 * 앱(`class-parts.ts`)과 DB(`private.section_parts` · `part_subject` · `part_start` · `part_end`)가 같은 규칙이어야 한다 — 마이그레이션 모양도 본다.
 */
const sql = readFileSync("supabase/migrations/20261105100000_vacation_block_parts.sql", "utf8");

const block = { subject: null, first_subject: "lc", second_start: "11:10:00", time_block: "10:00~12:10", course: { program: "score" } };
const hour = { subject: "rc", first_subject: null, second_start: null, time_block: "10:00~11:00", course: { program: "score" } };

describe("교시 판정 — 점수보장반 · 과목 칸이 비고 · 앞 교시 과목 · 뒤 교시 시작이 있을 때만 둘", () => {
  it("통짜 반은 둘, 시간 단위 반은 하나", () => {
    expect(sectionParts(block)).toBe(2);
    expect(partsOf(block)).toEqual([1, 2]);
    expect(sectionParts(hour)).toBe(1);
    expect(partsOf(hour)).toEqual([1]);
  });
  it("앞 교시 과목 · 뒤 교시 시작 중 하나라도 비면 하나 (유튜브 자동 연결은 손으로)", () => {
    expect(sectionParts({ ...block, first_subject: null })).toBe(1);
    expect(sectionParts({ ...block, second_start: null })).toBe(1);
  });
  it("묶음 반 · 스파르타 · 2주완성은 하나 — 과목 칸이 비어도", () => {
    expect(sectionParts(block, { isPackage: true })).toBe(1);
    expect(sectionParts({ ...block, course: { program: "sparta" } })).toBe(1);
    expect(sectionParts({ ...block, course: { program: "twoweek" } })).toBe(1);
  });
  it("과목이 정해진 반(시간 단위)은 앞 교시 칸이 있어도 하나", () => {
    expect(sectionParts({ ...block, subject: "lc" })).toBe(1);
  });
});

describe("교시의 과목 · 시간 · 이름", () => {
  it("앞 교시는 first_subject, 뒤 교시는 다른 과목 — 시간 단위 반은 반의 과목", () => {
    expect(partSubject(block, 1)).toBe("lc");
    expect(partSubject(block, 2)).toBe("rc");
    expect(partSubject({ ...block, first_subject: "rc" }, 2)).toBe("lc");
    expect(partSubject(hour, 1)).toBe("rc");
    expect(partSubject(hour, 2)).toBe("rc");
    expect(partSubject({ ...hour, subject: null }, 1)).toBeNull();
  });
  it("앞 교시 = 반 시작 ~ 뒤 교시 시작, 뒤 교시 = 뒤 교시 시작 ~ 반 끝", () => {
    expect(partSpan(block, 1)).toEqual({ start: 600, end: 670 });
    expect(partSpan(block, 2)).toEqual({ start: 670, end: 730 });
    expect(partTimeBlock(block, 1)).toBe("10:00~11:10");
    expect(partTimeBlock(block, 2)).toBe("11:10~12:10");
    // 시간 단위 반은 반의 시간대 그대로
    expect(partSpan(hour, 1)).toEqual({ start: 600, end: 660 });
    expect(partTimeBlock(hour, 2)).toBe("10:00~11:00");
    expect(partSpan({ ...block, time_block: null }, 1)).toBeNull();
  });
  it("이름은 두 교시 반에서만 — 앞 교시 LC · 뒤 교시 RC", () => {
    expect(partLabel(block, 1)).toBe("앞 교시 LC");
    expect(partLabel(block, 2)).toBe("뒤 교시 RC");
    expect(partLabel(hour, 1)).toBeNull();
  });
  it("회차의 줄에서 교시 것 — 예전 줄(part 없음)은 1교시", () => {
    const rows = [{ part: 2, url: "b" }, { url: "a" }];
    expect(ofPart(rows, 1)?.url).toBe("a");
    expect(ofPart(rows, 2)?.url).toBe("b");
    expect(ofPart({ part: 1, url: "x" }, 1)?.url).toBe("x");
    expect(ofPart(null, 1)).toBeNull();
    expect(toPart("2")).toBe(2);
    expect(toPart("3")).toBe(1);
    expect(toPart(undefined)).toBe(1);
  });
});

describe("마이그레이션 — DB 가 같은 규칙으로 교시를 가른다", () => {
  it("시간표 통짜 줄 · 반에 교시 칸, 링크 · 송출 · 다시보기 · 알림 표시에 part (예전 줄은 1)", () => {
    for (const col of ["first_mwf", "first_ttf", "second_start"]) expect(sql).toContain(`add column if not exists ${col}`);
    expect(sql).toContain("add column if not exists first_subject text");
    expect(sql).toContain("second_start > start_time and second_start < end_time");
    for (const t of ["session_live_links", "session_streams", "replays"]) expect(sql).toContain(`alter table public.${t} add column if not exists part smallint not null default 1;`);
    expect(sql).toContain("alter table public.session_live_links add primary key (session_date_id, part);");
    expect(sql).toContain("alter table public.session_streams add primary key (session_date_id, part);");
    expect(sql).toContain("alter table private.live_start_notices add primary key (section_id, class_date, part);");
  });
  it("교시 판정 함수 — 점수보장반 · 묶음 아님 · 과목 없음 · 앞 교시 과목 · 뒤 교시 시작 (앱 sectionParts 와 같다)", () => {
    const fn = sql.slice(sql.indexOf("create or replace function private.section_parts"), sql.indexOf("create or replace function private.part_subject"));
    expect(fn).toContain("s.subject is null and s.first_subject in ('lc', 'rc') and s.second_start is not null");
    expect(fn).toContain("c.program = 'score' and not private.is_package_section(s.id)");
    const subj = sql.slice(sql.indexOf("create or replace function private.part_subject"), sql.indexOf("create or replace function private.part_start"));
    expect(subj).toContain("case when p_part = 2 then (case s.first_subject when 'lc' then 'rc' else 'lc' end) else s.first_subject end");
    const start = sql.slice(sql.indexOf("create or replace function private.part_start"), sql.indexOf("create or replace function private.part_end"));
    expect(start).toContain("when private.section_parts(s.id) = 2 and p_part = 2 then s.second_start else private.time_block_start(s.time_block)");
    const end = sql.slice(sql.indexOf("create or replace function private.part_end"), sql.indexOf("create or replace function private.subject_teacher"));
    expect(end).toContain("when private.section_parts(s.id) = 2 and p_part = 1 then s.second_start else private.time_block_end(s.time_block)");
  });
  it("감지 후보 — 통짜 반은 교시마다 (과목 선생님 · 교시 시작), 송출 · 다시보기 없음은 교시로 본다. 두 인자 등록 함수는 지운다", () => {
    const cand = sql.slice(sql.indexOf("create function public.live_detect_candidates"), sql.indexOf("drop function if exists public.register_detected_stream"));
    expect(cand).toContain("returns table (session_date_id bigint, section_id bigint, instructor_id uuid, starts_at timestamptz, label text, live_to_replay boolean, part int)");
    expect(cand).toContain("select g.p, private.subject_teacher(private.part_subject(s.id, g.p)), private.part_start(s.id, g.p)");
    expect(cand).toContain("where private.section_parts(s.id) = 2");
    expect(cand).toContain("not exists (select 1 from public.session_streams st where st.session_date_id = d.id and st.part = x.part)");
    expect(cand).toContain("not exists (select 1 from public.replays r where r.session_date_id = d.id and r.part = x.part)");
    expect(cand).toContain("grant execute on function public.live_detect_candidates() to service_role;");
    expect(sql).toContain("drop function if exists public.register_detected_stream(bigint[], text);");
    expect(sql).toContain("create or replace function public.register_detected_stream(p_session_date_ids bigint[], p_url text, p_part int default 1)");
    expect(sql).toContain("on conflict (session_date_id, part) do nothing");
  });
  it("다시보기 승격 · 링크 바꾸기 · 시작 알림이 교시를 본다 — 앞 교시는 뒤 교시 시작 뒤에 올라간다", () => {
    const promote = sql.slice(sql.indexOf("create or replace function private.promote_live_replays"), sql.indexOf("create or replace function private.tg_session_live_link_changed"));
    expect(promote).toContain("(d.date + coalesce(private.part_end(s.id, st.part), time '23:59')) <= (now() at time zone 'Asia/Seoul')");
    expect(promote).toContain("insert into public.replays (session_date_id, part, video_url)");
    expect(promote).toContain("and r.part = st.part");
    expect(promote).toContain("and r.part = l.part");
    const changed = sql.slice(sql.indexOf("create or replace function private.tg_session_live_link_changed"), sql.indexOf("-- ─── 7."));
    expect(changed).toContain("and r.part = new.part");
    expect(sql).toContain("drop function if exists private.notify_live_session(bigint, date);");
    expect(sql).toContain("create or replace function private.notify_live_session(p_section_id bigint, p_date date, p_part int default 1)");
    expect(sql).toContain("on conflict (section_id, class_date, part) do nothing");
    expect(sql).toContain("perform private.notify_live_session(v_section, v_date, new.part::int);");
    expect(sql).toContain("cross join lateral generate_series(1, private.section_parts(s.id)) as p(part)");
    // 정책은 손대지 않는다 — drop policy 가 없다 (migrations.test 가 살아 있는 이름을 본다)
    expect(sql).not.toMatch(/drop policy/);
  });
});

describe("앱 — 교시를 거쳐 가는 자리", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("반 한 줄(sectionInsertOf)은 통짜 줄의 앞 교시 과목(트랙별) · 뒤 교시 시작을 옮긴다", () => {
    const s = read("src/lib/month-open.ts");
    expect(s).toContain('first_subject: track === "mwf" ? plan.first_mwf : plan.first_ttf,');
    expect(s).toContain("second_start: plan.second_start,");
  });
  it("회차 링크 · 다시보기 등록 서버 액션은 교시를 받는다 (없으면 1)", () => {
    const a = read("src/app/admin/sections/actions.ts");
    expect(a).toContain('const part = toPart(str(formData, "part"));');
    expect(a).toContain('{ onConflict: "session_date_id,part" }');
    expect(a).toContain('.eq("session_date_id", sessionDateId).eq("part", part).select("session_date_id")');
    expect(read("src/app/admin/replays/actions.ts")).toContain("insert({ session_date_id: sessionDateId, part, video_url: url })");
  });
  it("감지 크론은 교시마다 따로 걸어 둔다", () => {
    const r = read("src/app/api/cron/live-detect/route.ts");
    expect(r).toContain("for (const part of [...new Set(m.sessions.map(candidatePart))])");
    expect(r).toContain("p_part: part,");
  });
  it("학생 불라방 카드는 교시마다 입장 버튼, 다시보기는 교시의 과목 · 시간", () => {
    expect(read("src/app/my/live/page.tsx")).toContain("{c.links.map((l) => (");
    const replay = read("src/app/my/replay/page.tsx");
    expect(replay).toContain("subject: partSubject(sec, toPart(r.part)),");
    expect(replay).toContain("time: partTimeBlock(sec, toPart(r.part)),");
    const q = read("src/app/my/_lib/queries.ts");
    expect(q).toContain("time_block: partTimeBlock(sec, toPart(l.part))");
    expect(q).toContain("subject, first_subject, second_start, recorded, live_to_replay,");
  });
});
