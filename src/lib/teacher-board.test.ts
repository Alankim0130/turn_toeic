import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { folderNameError, nextSeq, splitRoundDates, termCellKey, termRoundKey, groupItemsBySeq } from "./teacher-board";
import { roundKey } from "./class-rounds";
import { NAV_ADMIN } from "./site";

/**
 * 강사 자료 게시판 (2026-11-03 Alan — "850반 자료는 매달 바뀌기 때문에 한번에 정리를 쫙 해놓고 원하는 과정의 자료를 오픈 …
 * 몇월 수업자료로 사용하고 싶다고 하면 그 자료들이 학생들에게 오픈 … 기존에 날짜별 오픈시스템도 그대로" → "그 달은 폴더 자료만").
 */

const MIGRATIONS = "supabase/migrations";
const allSql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(`${MIGRATIONS}/${f}`, "utf8"))
  .join("\n");
const sql = readFileSync(`${MIGRATIONS}/20261103100000_teacher_board.sql`, "utf8");
/** 마지막 정의 — 이름으로 찾은 create policy 문장 중 맨 뒤 */
const lastPolicy = (name: string) => {
  const all = [...allSql.matchAll(new RegExp(`create policy "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?;\\n`, "g"))];
  return all.at(-1)?.[0] ?? "";
};

const sec = (term: number, level: number, subject: string | null, set: string) => ({ term_id: term, subject, book_set: set, course: { target_score: level } });

describe("폴더를 쓰는 칸 / 아닌 칸 — DB my_open_class_rounds · my_open_term_rounds 와 같은 규칙", () => {
  const sessions = [
    // 10월 850 RC A — 폴더 없음
    { seq: 1, date: "2026-10-07", section: sec(10, 850, "rc", "A") },
    // 11월 850 RC A — 폴더를 쓴다 (오전 · 저녁 같은 과정이면 이른 날짜)
    { seq: 1, date: "2026-11-04", section: sec(11, 850, "rc", "A") },
    { seq: 1, date: "2026-11-03", section: sec(11, 850, "rc", "A") },
    { seq: 2, date: "2026-11-06", section: sec(11, 850, "rc", "A") },
    // 11월 방학달 통짜처럼 과목 칸이 빈 반 — RC · LC 두 칸 중 RC 만 폴더
    { seq: 1, date: "2026-11-05", section: sec(11, 750, null, "B") },
  ];
  const foldered = new Set([termCellKey(11, 850, "rc", "A"), termCellKey(11, 750, "rc", "B")]);
  const { classDates, folderDates } = splitRoundDates(sessions, foldered);

  it("폴더를 쓰는 (기수 · 칸)의 회차는 폴더 자료로만 연다 — 그 달 그 칸은 수업자료실 자료가 닫힌다", () => {
    expect(folderDates.get(termRoundKey(11, 850, "rc", "A", 1))).toBe("2026-11-03");
    expect(folderDates.get(termRoundKey(11, 850, "rc", "A", 2))).toBe("2026-11-06");
    // 10월 같은 칸은 폴더가 없으니 수업자료실 그대로
    expect(classDates.get(roundKey(850, "rc", "A", 1))).toBe("2026-10-07");
    expect(classDates.has(roundKey(850, "rc", "A", 2))).toBe(false);
  });

  it("과목 칸이 빈 반은 과목마다 따로 — RC 만 폴더면 LC 는 수업자료실", () => {
    expect(folderDates.get(termRoundKey(11, 750, "rc", "B", 1))).toBe("2026-11-05");
    expect(classDates.get(roundKey(750, "lc", "B", 1))).toBe("2026-11-05");
    expect(classDates.has(roundKey(750, "rc", "B", 1))).toBe(false);
  });
});

describe("마이그레이션 — 학생에게는 DB 가 막는다", () => {
  it("폴더는 강사 · 관리자만, 쓰기는 전부 스태프", () => {
    expect(lastPolicy("teacher_folders: 스태프 조회")).toMatch(/using \(\(select private\.is_staff\(\)\)\)/);
    for (const t of ["teacher_folders", "teacher_folder_uses", "teacher_folder_items", "teacher_folder_files"]) {
      for (const verb of ["등록", "수정", "삭제"]) expect(lastPolicy(`${t}: 스태프 ${verb}`), `${t} ${verb}`).toMatch(/private\.is_staff\(\)/);
      expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
    }
  });

  it("조회 정책은 스태프 확인이 맨 앞 — 자료는 열린 회차(기수까지), 쓰는 달은 내 기수 · 칸, 파일은 부모 자료가 보일 때", () => {
    const items = lastPolicy("teacher_folder_items: 수강생·스태프 조회");
    expect(items).toMatch(/\(select private\.is_staff\(\)\)\s*or exists/);
    expect(items).toMatch(/my_open_term_rounds/);
    expect(lastPolicy("teacher_folder_uses: 내 칸 수강생·스태프 조회")).toMatch(/\(select private\.is_staff\(\)\) or array\[.*my_term_cells/);
    expect(lastPolicy("teacher_folder_files: 자료가 보이는 사람 조회")).toMatch(/from public\.teacher_folder_items i where i\.id = teacher_folder_files\.item_id/);
  });

  it("정책 이름은 63바이트 안 — 넘으면 Postgres 가 잘라 drop · create 가 어긋난다", () => {
    for (const m of sql.matchAll(/create policy "([^"]+)"/g)) expect(Buffer.byteLength(m[1]), m[1]).toBeLessThanOrEqual(63);
  });

  it("수업자료실은 폴더를 쓰는 칸을 뺀 열린 회차로 연다 (그 달은 폴더 자료만)", () => {
    expect(lastPolicy("class_materials: 지난 수업일 수강생·스태프 조회")).toMatch(/my_open_class_rounds/);
    expect(sql).toMatch(/function private\.my_open_class_rounds[\s\S]*?not exists \([\s\S]*?teacher_folder_uses u[\s\S]*?u\.term_id = s\.term_id/);
  });

  it("저장소 조회는 수업자료 · 공지 · 특강 자료 · 강사 게시판 파일 행 넷 다", () => {
    const storage = lastPolicy("class-materials: 자료가 보이는 사람·스태프 조회");
    for (const t of ["class_material_files", "class_notice_files", "special_lecture_material_files", "teacher_folder_files"]) expect(storage).toContain(t);
    expect(sql).toMatch(/file_path like 'teacher\/%'/);
  });

  it("학생 함수는 security definer + search_path '' · 비회원 실행 불가", () => {
    for (const fn of ["my_term_cells", "my_open_term_rounds", "my_open_class_rounds"]) {
      expect(sql).toMatch(new RegExp(`function private\\.${fn}\\(\\)[\\s\\S]*?security definer\\s*set search_path = ''`));
      expect(sql).toContain(`revoke all on function private.${fn}() from public, anon;`);
    }
  });

  it("쓰는 달의 과목은 폴더의 것 — 복합 FK, 한 칸에 폴더 하나", () => {
    expect(sql).toMatch(/foreign key \(folder_id, subject\) references public\.teacher_folders \(id, subject\)/);
    expect(sql).toMatch(/unique \(term_id, level, subject, book_set\)/);
  });

  it("처음 폴더 — 쓰시던 이름 그대로 (LC 37 · RC 16, 850+ 차 · 카 포함)", () => {
    const lc = sql.slice(sql.indexOf("select 'lc'"), sql.indexOf("select 'rc'"));
    const rc = sql.slice(sql.indexOf("select 'rc'"));
    const names = (part: string) => [...part.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((n) => n.length > 2);
    expect(names(lc)).toHaveLength(37);
    expect(names(lc)).toEqual(expect.arrayContaining(["스텝게시판 800+A", "스텝게시판 800+i", "스텝게시판 800 추가문제", "강사게시판 850+ 가", "강사게시판 850+ 차", "강사게시판 850+ 카", "강사게시판 850+ 파"]));
    expect(names(rc)).toHaveLength(16);
    expect(names(rc)).toEqual(expect.arrayContaining(["문풀반 C(A) 강사용", "문풀반 D (A)강사용", "문풀반 F(A)반 (강사용)", "문풀반 I(B)"]));
  });
});

describe("서버 액션 · 메뉴", () => {
  const actions = readFileSync("src/app/admin/teacher-board/actions.ts", "utf8");
  it("액션마다 맨 위에 requireStaff — 조교 화면이 아니다. 서비스 롤 없음", () => {
    const fns = [...actions.matchAll(/export async function (\w+)\([\s\S]*?\): Promise<TeacherBoardResult> \{\n([^\n]*)\n/g)];
    expect(fns.length).toBeGreaterThanOrEqual(8);
    for (const m of fns) expect(m[2], m[1]).toMatch(/await requireStaff\(\)/);
    expect(actions).not.toMatch(/service|createAdminClient/i);
  });

  it("관리자 메뉴에 있고 조교에게는 열지 않는다", () => {
    const item = NAV_ADMIN.find((n) => n.href === "/admin/teacher-board");
    expect(item).toBeTruthy();
    expect(item?.crew).toBeFalsy();
  });
});

describe("작은 규칙", () => {
  it("폴더 이름 — 비면 · 60자 넘으면 안 된다", () => {
    expect(folderNameError("  ")).not.toBeNull();
    expect(folderNameError("가".repeat(61))).not.toBeNull();
    expect(folderNameError(" 문풀반 J(A) ")).toBeNull();
  });

  it("새 자료 회차 = 마지막 다음 (끝 30)", () => {
    expect(nextSeq([])).toBe(1);
    expect(nextSeq([1, 3])).toBe(4);
    expect(nextSeq([30])).toBe(30);
  });

  it("회차로 묶고 회차 안은 순서대로", () => {
    const row = (id: number, seq: number, sort_order: number) => ({ id, folder_id: 1, seq, title: `${id}`, note: null, links: [], sort_order, created_at: "2026-11-01", updated_at: "2026-11-01", files: null });
    const groups = groupItemsBySeq([row(1, 2, 0), row(2, 1, 1), row(3, 1, 0)]);
    expect(groups.map(([seq, items]) => [seq, items.map((i) => i.id)])).toEqual([
      [1, [3, 2]],
      [2, [1]],
    ]);
  });
});
