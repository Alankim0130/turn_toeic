import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isNoteImagePath } from "./note-images";
import { isSafeObjectPath, MB } from "./upload";
import {
  BOARD_CELLS,
  boardCell,
  boardDateLabel,
  boardLevel,
  boardListHref,
  boardPage,
  boardPageCount,
  boardPlaceLabel,
  boardTabFor,
  boardWhereLabel,
  canDeleteStaffPost,
  canEditStaffPost,
  cellLabel,
  cellOf,
  cellTagLabel,
  cellValue,
  isEditedPost,
  levelFilter,
  levelsLabel,
  normalizeLevels,
  normalizeSet,
  normalizeSubject,
  postInCell,
  postInLevel,
  setFilter,
  STAFF_BOARD_BUCKET,
  STAFF_BOARD_PAGE_SIZE,
  STAFF_POST_BODY_MAX,
  STAFF_POST_FILE_FOLDER,
  STAFF_POST_FILE_MAX_BYTES,
  STAFF_POST_FILES_MAX,
  STAFF_POST_IMAGE_FOLDER,
  STAFF_POST_IMAGE_MAX_COUNT,
  STAFF_POST_TITLE_MAX,
  staffPostAttachLabel,
  staffPostError,
  staffPostFilePath,
  staffPostHref,
  subjectFilter,
} from "./staff-board";

/**
 * 직원 게시판 (2026-10-21 Alan — "관리자모드에서 직원들만 사용할 수 있는 게시판을 하나 만들어주면 좋겠어" → "조교도 읽고 쓰기" · "글만 올리기").
 * 규칙 함수와 **마이그레이션을 순서대로 재생한 마지막 정책 모양**을 같이 본다 — 화면 규칙(canEditStaffPost …)과 DB 정책이 어긋나면
 * 버튼은 보이는데 저장이 막히거나(조용히 실패), 반대로 막아야 할 사람에게 열린다.
 */
const DIR = "supabase/migrations";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const sqlOf = (f: string) =>
  readFileSync(join(DIR, f), "utf8")
    .split("\n")
    .map((l) => (l.trim().startsWith("--") ? "" : l))
    .join("\n");
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const BOARD_SQL = flat(sqlOf("20261021100000_staff_board.sql"));
const LEVELS_SQL = flat(sqlOf("20261021110000_staff_board_levels.sql"));
const CELLS_SQL = flat(sqlOf("20261021120000_staff_board_cells.sql"));
/** 마이그레이션을 순서대로 읽어 마지막에 남는 문장 — 같은 꼴의 문장이 뒤에 또 오면 그것이 산다 */
const lastOf = (re: RegExp) => FILES.flatMap((f) => [...flat(sqlOf(f)).matchAll(re)].map((m) => m[0])).at(-1);

/** 마지막에 살아 있는 정책 — 표 · 이름 → 본문 */
const live = new Map<string, string>();
for (const f of FILES) {
  for (const [, verb, name, table, body] of sqlOf(f).matchAll(/(create|drop) policy (?:if exists )?"([^"]+)" on (public\.staff_posts|public\.staff_post_files|storage\.objects)([^;]*);/g)) {
    if (table === "storage.objects" && !name.startsWith("staff-board:")) continue;
    if (verb === "create") live.set(`${table} · ${name}`, flat(body));
    else live.delete(`${table} · ${name}`);
  }
}
const policiesOf = (table: string, verb: string) => [...live].filter(([key, body]) => key.startsWith(`${table} ·`) && body.includes(`for ${verb} `));

describe("글 검사 — staffPostError (폼과 서버 액션이 같은 말)", () => {
  const ok = { title: "10월 넷째 주 근무표", body: "[b]월[/b] 이혜영 · 조교 한 명" };
  it("통과", () => expect(staffPostError(ok)).toBeNull());
  it("제목은 꼭 · 100자까지 (DB check 와 같다)", () => {
    expect(staffPostError({ ...ok, title: "   " })).toBe("제목을 적어 주세요.");
    expect(staffPostError({ ...ok, title: "가".repeat(STAFF_POST_TITLE_MAX) })).toBeNull();
    expect(staffPostError({ ...ok, title: "가".repeat(STAFF_POST_TITLE_MAX + 1) })).toContain(`${STAFF_POST_TITLE_MAX}자`);
  });
  it("본문은 비워도 되고 5만 자까지", () => {
    expect(staffPostError({ ...ok, body: "" })).toBeNull();
    expect(staffPostError({ ...ok, body: "가".repeat(STAFF_POST_BODY_MAX) })).toBeNull();
    expect(staffPostError({ ...ok, body: "가".repeat(STAFF_POST_BODY_MAX + 1) })).toContain("넘어요");
  });
  it("사진은 이 게시판의 images/ 폴더만 · 30장까지", () => {
    expect(staffPostError({ ...ok, body: "[img=images/a1.png w=50]" })).toBeNull();
    expect(staffPostError({ ...ok, body: "[img=files/a1.png]" })).toContain("사진");
    expect(staffPostError({ ...ok, body: "[img=images/../x.png]" })).toContain("사진");
    const many = (n: number) => Array.from({ length: n }, (_, k) => `[img=images/p${k}.png]`).join("\n");
    expect(staffPostError({ ...ok, body: many(STAFF_POST_IMAGE_MAX_COUNT) })).toBeNull();
    expect(staffPostError({ ...ok, body: many(STAFF_POST_IMAGE_MAX_COUNT + 1) })).toContain(`${STAFF_POST_IMAGE_MAX_COUNT}장`);
  });
  it("사진 폴더는 글 사진 서명(signNoteImages)이 받는 꼴이다", () => {
    expect(isNoteImagePath(`${STAFF_POST_IMAGE_FOLDER}0f1e2d3c.webp`)).toBe(true);
  });
  it("레벨 — 레벨 목록(lc_levels)을 주면 그 안의 값만 (비우면 모든 레벨)", () => {
    expect(staffPostError({ ...ok, levels: [] }, [650, 750, 850])).toBeNull();
    expect(staffPostError({ ...ok, levels: [650, 850] }, [650, 750, 850])).toBeNull();
    expect(staffPostError({ ...ok, levels: [700] }, [650, 750, 850])).toBe("레벨을 다시 골라 주세요.");
    // 목록을 안 주면 레벨은 보지 않는다 (예전 호출 그대로)
    expect(staffPostError({ ...ok, levels: [700] })).toBeNull();
  });
});

describe("레벨 — 650 · 750 · 850 탭 (2026-10-21 Alan \"직원게시판도 학습자료실처럼 650,750,850구분\")", () => {
  it("탭 하나에는 그 레벨 글과 모든 레벨 글이 선다", () => {
    expect(postInLevel([], 650)).toBe(true);
    expect(postInLevel([650], 650)).toBe(true);
    expect(postInLevel([650, 750], 750)).toBe(true);
    expect(postInLevel([750], 650)).toBe(false);
  });
  it("DB 조회의 거르기가 같은 뜻이다 — 빈 배열 · 그 레벨을 품은 배열 (정수로만)", () => {
    expect(levelFilter(650)).toBe("levels.eq.{},levels.cs.{650}");
    expect(levelFilter(750.9)).toBe("levels.eq.{},levels.cs.{750}");
  });
  it("레벨 이름 — 비우면 모든 레벨, 아니면 작은 것부터", () => {
    expect(levelsLabel([])).toBe("모든 레벨");
    expect(levelsLabel([850, 650])).toBe("650 · 850");
  });
  it("저장할 레벨 — 정수만 · 한 번씩 · 작은 것부터", () => {
    expect(normalizeLevels([850, "650", 650, 1.5, null, "x"])).toEqual([650, 850]);
    expect(normalizeLevels(null)).toEqual([]);
  });
  it("주소의 ?level= — 목록에 있으면 그것, 아니면 첫 레벨 (수업자료실과 같다), 목록이 비면 null", () => {
    const levels = [650, 750, 850];
    expect(boardLevel("750", levels)).toBe(750);
    expect(boardLevel(["850", "650"], levels)).toBe(850);
    expect(boardLevel("700", levels)).toBe(650);
    expect(boardLevel(undefined, levels)).toBe(650);
    expect(boardLevel("650", [])).toBeNull();
  });
});

describe("과목 · 과정 — RC A과정 · RC B과정 · LC A과정 · LC B과정 칸 (2026-10-21 Alan \"A, B과정 표시가 없어. 이렇게해줘\")", () => {
  it("칸 넷은 수업자료실 둘째 줄과 같은 순서 · 같은 이름 · 같은 주소 꼴", () => {
    expect(BOARD_CELLS.map(cellLabel)).toEqual(["RC A과정", "RC B과정", "LC A과정", "LC B과정"]);
    expect(BOARD_CELLS.map(cellValue)).toEqual(["rc-A", "rc-B", "lc-A", "lc-B"]);
  });
  it("칸 하나에는 그 칸 글과 과목 · 과정을 비운 글이 선다", () => {
    const rcA = { subject: "rc", set: "A" } as const;
    expect(postInCell({ subject: "rc", book_set: "A" }, rcA)).toBe(true);
    expect(postInCell({ subject: null, book_set: null }, rcA)).toBe(true);
    expect(postInCell({ subject: "rc", book_set: null }, rcA)).toBe(true);
    expect(postInCell({ subject: null, book_set: "A" }, rcA)).toBe(true);
    expect(postInCell({ subject: "lc", book_set: "A" }, rcA)).toBe(false);
    expect(postInCell({ subject: "rc", book_set: "B" }, rcA)).toBe(false);
  });
  it("DB 조회의 거르기가 같은 뜻이다 — 비운 값 · 그 값", () => {
    expect(subjectFilter("lc")).toBe("subject.is.null,subject.eq.lc");
    expect(setFilter("B")).toBe("book_set.is.null,book_set.eq.B");
  });
  it("주소의 ?cell= — 과목을 모르면 null, 과정을 모르면 A과정 (수업자료실과 같다)", () => {
    expect(cellOf("lc-B")).toEqual({ subject: "lc", set: "B" });
    expect(cellOf("rc")).toEqual({ subject: "rc", set: "A" });
    expect(cellOf("rc-Z")).toEqual({ subject: "rc", set: "A" });
    expect(cellOf("xx-A")).toBeNull();
    expect(cellOf(undefined)).toBeNull();
    expect(cellOf(["lc-A", "rc-B"])).toEqual({ subject: "lc", set: "A" });
  });
  it("처음 칸 — 주소가 없으면 강사는 자기 과목의 A과정(말해 준다), 관리자 · 조교는 RC A과정", () => {
    expect(boardCell(undefined, "lc")).toEqual({ subject: "lc", set: "A", defaulted: true });
    expect(boardCell(undefined, null)).toEqual({ subject: "rc", set: "A", defaulted: false });
    expect(boardCell("rc-B", "lc")).toEqual({ subject: "rc", set: "B", defaulted: false });
    expect(boardCell("엉뚱", "lc")).toEqual({ subject: "lc", set: "A", defaulted: false });
  });
  it("저장할 값 — 아는 값만, 그 밖은 비운다(둘 다)", () => {
    expect(normalizeSubject("rc")).toBe("rc");
    expect(normalizeSubject("")).toBeNull();
    expect(normalizeSubject("RC")).toBeNull();
    expect(normalizeSet("B")).toBe("B");
    expect(normalizeSet("b")).toBeNull();
    expect(normalizeSet(null)).toBeNull();
  });
  it("글 검사 — 비우거나 아는 값만 (DB check 와 같다)", () => {
    const ok = { title: "제목", body: "" };
    expect(staffPostError({ ...ok, subject: "rc", book_set: "A" })).toBeNull();
    expect(staffPostError({ ...ok, subject: null, book_set: null })).toBeNull();
    expect(staffPostError({ ...ok, subject: "xx" })).toBe("과목을 다시 골라 주세요.");
    expect(staffPostError({ ...ok, book_set: "C" })).toBe("과정을 다시 골라 주세요.");
  });
  it("이름표 — 목록 · 글 화면의 칩, 옮기기 안내의 한 줄", () => {
    expect(cellTagLabel("rc", "A")).toBe("RC A과정");
    expect(cellTagLabel("lc", null)).toBe("LC");
    expect(cellTagLabel(null, "B")).toBe("B과정");
    expect(cellTagLabel(null, null)).toBe("");
    expect(boardPlaceLabel([850], "rc", "A")).toBe("850 · RC A과정");
    expect(boardPlaceLabel([], null, null)).toBe("모든 레벨");
    expect(boardPlaceLabel([650, 750], "lc", null)).toBe("650 · 750 · LC");
  });
  it("글쓰기 폼의 한 줄 — 어느 탭의 어느 칸에 보이나", () => {
    expect(boardWhereLabel([650], [650, 750, 850], "rc", "A")).toBe("650 탭의 RC A과정 칸에 보여요.");
    expect(boardWhereLabel([650], [650, 750, 850], "rc", null)).toBe("650 탭의 RC A과정 · RC B과정 칸에 보여요.");
    expect(boardWhereLabel([], [650, 750, 850], null, "B")).toBe("레벨 탭 모두(650 · 750 · 850)의 RC B과정 · LC B과정 칸에 보여요.");
    expect(boardWhereLabel([], [650, 750, 850], null, null)).toBe("레벨 탭 모두(650 · 750 · 850)의 과목 · 과정 칸 모두에 보여요.");
  });
  it("주소 — 목록 · 글 화면이 보던 탭 · 칸 · 쪽을 들고 다닌다", () => {
    const tab = { level: 850, cell: { subject: "lc", set: "B" } } as const;
    expect(boardListHref(tab)).toBe("/admin/board?level=850&cell=lc-B");
    expect(boardListHref(tab, 3)).toBe("/admin/board?level=850&cell=lc-B&page=3");
    expect(boardListHref({ level: null, cell: null })).toBe("/admin/board");
    expect(staffPostHref(7, tab)).toBe("/admin/board/7?level=850&cell=lc-B");
    expect(staffPostHref(7, { level: null })).toBe("/admin/board/7");
    expect(staffPostHref(7, tab, "edit")).toBe("/admin/board/7/edit?level=850&cell=lc-B");
    expect(staffPostHref(7, { level: null }, "edit")).toBe("/admin/board/7/edit");
  });
  it("저장한 뒤 — 그 글이 서는 탭 · 칸 (왔던 곳에 서면 그대로, 아니면 글의 첫 레벨 · 글의 과목 · 과정)", () => {
    const from = { level: 750, cell: { subject: "lc", set: "B" } } as const;
    // 왔던 칸에 선다 — 그대로
    expect(boardTabFor({ levels: [750], subject: "lc", set: "B" }, from)).toEqual(from);
    expect(boardTabFor({ levels: [650, 750], subject: null, set: "B" }, from)).toEqual(from);
    expect(boardTabFor({ levels: [], subject: null, set: null }, from)).toEqual(from);
    // 레벨이 다르면 글의 첫 레벨, 과목이 다르면 글의 과목 (과정은 비웠으니 왔던 값)
    expect(boardTabFor({ levels: [850, 650], subject: "rc", set: null }, from)).toEqual({ level: 850, cell: { subject: "rc", set: "B" } });
    // 왔던 탭이 없으면(고치기 화면을 주소로 바로 열었을 때) — 글의 첫 레벨 · 과목 · 과정, 비운 축은 RC · A과정 (어느 칸에나 선다)
    expect(boardTabFor({ levels: [750], subject: null, set: "B" }, { level: null, cell: null })).toEqual({ level: 750, cell: { subject: "rc", set: "B" } });
    expect(boardTabFor({ levels: [], subject: null, set: null }, { level: null })).toEqual({ level: null, cell: null });
    // 고른 대로 저장한 글은 늘 그 탭 · 칸에 선다
    for (const levels of [[], [650], [750, 850]] as const)
      for (const subject of ["rc", "lc", null] as const)
        for (const set of ["A", "B", null] as const)
          for (const f of [from, { level: null, cell: null }, { level: 650, cell: { subject: "rc", set: "A" } }] as const) {
            const tab = boardTabFor({ levels, subject, set }, f);
            if (tab.level !== null) expect(levels.length === 0 || (levels as readonly number[]).includes(tab.level)).toBe(true);
            if (tab.cell) expect(postInCell({ subject, book_set: set }, tab.cell)).toBe(true);
          }
  });
});

describe("고치기 · 지우기 — DB 정책과 같은 규칙", () => {
  const mine = { author_id: "u1" };
  it("고치기는 글쓴이만 — 글쓴이 계정이 지워진 글은 아무도", () => {
    expect(canEditStaffPost(mine, "u1")).toBe(true);
    expect(canEditStaffPost(mine, "u2")).toBe(false);
    expect(canEditStaffPost({ author_id: null }, "u1")).toBe(false);
  });
  it("지우기는 글쓴이와 강사 · 관리자", () => {
    expect(canDeleteStaffPost(mine, "u1", false)).toBe(true);
    expect(canDeleteStaffPost(mine, "u2", false)).toBe(false);
    expect(canDeleteStaffPost(mine, "u2", true)).toBe(true);
    expect(canDeleteStaffPost({ author_id: null }, "u2", true)).toBe(true);
  });
});

describe("목록 · 쪽 · 날짜", () => {
  it("붙은 것 — 공지 목록과 같은 꼴", () => {
    expect(staffPostAttachLabel(0, [])).toBe("");
    expect(staffPostAttachLabel(2, [{ url: "https://example.com/a", label: null }])).toBe("파일 2개 · 링크 1개");
    expect(staffPostAttachLabel(0, [{ url: "https://youtu.be/dQw4w9WgXcQ", label: null }])).toBe("영상 1개");
  });
  it("?page= 는 1 이상의 정수만", () => {
    expect(boardPage(undefined)).toBe(1);
    expect(boardPage("3")).toBe(3);
    expect(boardPage(["4", "5"])).toBe(4);
    for (const bad of ["0", "-1", "2.5", "abc", "", "10001"]) expect(boardPage(bad), bad).toBe(1);
  });
  it("쪽 수 — 글이 없어도 1쪽", () => {
    expect(boardPageCount(0)).toBe(1);
    expect(boardPageCount(STAFF_BOARD_PAGE_SIZE)).toBe(1);
    expect(boardPageCount(STAFF_BOARD_PAGE_SIZE + 1)).toBe(2);
  });
  it("날짜 — 오늘(한국 시간) 올린 글은 시각, 그 밖은 YY.MM.DD", () => {
    const now = new Date("2026-10-21T05:00:00Z"); // 10월 21일 14:00 KST
    expect(boardDateLabel("2026-10-21T04:05:00Z", now)).toBe("13:05");
    // 10월 21일 00:30 KST — UTC 로는 전날이지만 한국 날짜로는 오늘
    expect(boardDateLabel("2026-10-20T15:30:00Z", now)).toBe("00:30");
    expect(boardDateLabel("2026-10-20T14:59:00Z", now)).toBe("26.10.20");
    expect(boardDateLabel("2025-12-31T16:00:00Z", now)).toBe("26.01.01");
    expect(boardDateLabel("엉뚱한 값", now)).toBe("");
  });
  it("고친 글 — 두 시각이 1초 넘게 다를 때만 (올릴 때 트리거가 같은 값을 적는다)", () => {
    expect(isEditedPost({ created_at: "2026-10-21T04:00:00.000Z", updated_at: "2026-10-21T04:00:00.000Z" })).toBe(false);
    expect(isEditedPost({ created_at: "2026-10-21T04:00:00.000Z", updated_at: "2026-10-21T04:00:00.400Z" })).toBe(false);
    expect(isEditedPost({ created_at: "2026-10-21T04:00:00.000Z", updated_at: "2026-10-21T04:10:00.000Z" })).toBe(true);
  });
});

describe("저장소 — 버킷 · 폴더 · 한도가 마이그레이션과 같다", () => {
  it("버킷은 private · 50MB · 형식 제한 없음", () => {
    expect(BOARD_SQL).toContain(`values ('${STAFF_BOARD_BUCKET}', '${STAFF_BOARD_BUCKET}', false, ${STAFF_POST_FILE_MAX_BYTES / MB} * 1024 * 1024, null)`);
  });
  it("첨부 파일 경로는 files/ 아래 무작위 이름 — DB check · 서버 액션 경로 검사를 통과한다", () => {
    expect(BOARD_SQL).toContain(`check (file_path like '${STAFF_POST_FILE_FOLDER}%' and position('..' in file_path) = 0)`);
    const path = staffPostFilePath({ name: "10월 근무표.xlsx" });
    expect(path).toMatch(/^files\/[0-9a-f-]{36}\.xlsx$/);
    expect(isSafeObjectPath(path, STAFF_POST_FILE_FOLDER)).toBe(true);
  });
  it("제목 · 본문 상한이 DB check 와 같다", () => {
    expect(BOARD_SQL).toContain(`check (char_length(title) between 1 and ${STAFF_POST_TITLE_MAX})`);
    expect(BOARD_SQL).toContain(`check (char_length(body) <= ${STAFF_POST_BODY_MAX})`);
    expect(BOARD_SQL).toContain("check (private.class_material_links_ok(links))");
    expect(STAFF_POST_FILES_MAX).toBe(20);
  });
});

describe("DB 정책 — 마이그레이션을 순서대로 재생한 마지막 모양", () => {
  const CREW = "(select private.is_crew())";
  const ME = "author_id = (select auth.uid())";

  it("글 조회는 강사 · 관리자 · 조교뿐 — 학생 · 회원 갈래가 없다", () => {
    const selects = policiesOf("public.staff_posts", "select");
    expect(selects.length, "조회 정책을 못 찾았다 (문장 모양이 바뀌면 이 테스트가 헛돈다)").toBe(1);
    expect(selects[0][1]).toBe(`for select to authenticated using (${CREW})`);
  });

  it("쓰기는 조교까지 · 글쓴이 칸은 나 · 고치기는 글쓴이 · 지우기는 글쓴이와 강사 · 관리자", () => {
    const [insert] = policiesOf("public.staff_posts", "insert");
    expect(insert?.[1]).toBe(`for insert to authenticated with check (${CREW} and ${ME})`);
    const [update] = policiesOf("public.staff_posts", "update");
    expect(update?.[1]).toBe(`for update to authenticated using (${CREW} and ${ME}) with check (${CREW} and ${ME})`);
    const [del] = policiesOf("public.staff_posts", "delete");
    expect(del?.[1]).toBe(`for delete to authenticated using ((select private.is_staff()) or (${CREW} and ${ME}))`);
  });

  it("첨부 파일 행은 부모 글이 보이면 보이고, 넣기 · 순서 고치기는 그 글의 글쓴이만", () => {
    const [select] = policiesOf("public.staff_post_files", "select");
    expect(select?.[1]).toContain("using (exists (select 1 from public.staff_posts p where p.id = staff_post_files.post_id))");
    for (const verb of ["insert", "update"]) {
      const [p] = policiesOf("public.staff_post_files", verb);
      expect(p?.[1], verb).toContain("p.author_id = (select auth.uid())");
    }
    const [del] = policiesOf("public.staff_post_files", "delete");
    expect(del?.[1]).toContain("((select private.is_staff()) or p.author_id = (select auth.uid()))");
  });

  it("글쓴이 · 시각은 트리거가 채우고, authenticated 는 제목 · 본문 · 링크 칸만 넣고 고친다", () => {
    expect(BOARD_SQL).toContain("new.author_id := auth.uid();");
    expect(BOARD_SQL).toContain("new.author_name := left(private.my_profile_name(), 40);");
    expect(BOARD_SQL).toContain("before insert or update on public.staff_posts for each row execute function private.tg_staff_posts_stamp()");
    expect(BOARD_SQL).toContain("grant insert (title, body, links), update (title, body, links) on public.staff_posts to authenticated;");
    expect(BOARD_SQL).toContain("grant select, delete on public.staff_posts to authenticated;");
    expect(BOARD_SQL).not.toMatch(/grant (?:all|insert|update)[^;]*on public\.staff_posts to (?:anon|public)\b/);
    expect(BOARD_SQL).toContain("revoke execute on function private.tg_staff_posts_stamp() from public, anon, authenticated;");
  });

  it("계정을 합치면 옛 계정의 글이 남길 계정으로 간다", () => {
    expect(BOARD_SQL).toContain("update public.staff_posts set author_id = new.merged_into where author_id = new.id;");
    expect(BOARD_SQL).toContain("after update of merged_into on public.profiles for each row when (old.merged_into is null and new.merged_into is not null)");
  });

  it("저장소 — 조회 · 올리기는 강사 · 관리자 · 조교(images/ · files/ 만), 지우기는 올린 사람과 강사 · 관리자", () => {
    const keys = [...live.keys()].filter((k) => k.startsWith("storage.objects ·"));
    expect(keys.length, "저장소 정책을 못 찾았다").toBe(3);
    const [select] = policiesOf("storage.objects", "select");
    expect(select?.[1]).toBe(`for select to authenticated using (bucket_id = '${STAFF_BOARD_BUCKET}' and ${CREW})`);
    const [insert] = policiesOf("storage.objects", "insert");
    expect(insert?.[1]).toContain(`(storage.foldername(name))[1] in ('${STAFF_POST_IMAGE_FOLDER.slice(0, -1)}', '${STAFF_POST_FILE_FOLDER.slice(0, -1)}')`);
    expect(insert?.[1]).toContain(CREW);
    const [del] = policiesOf("storage.objects", "delete");
    expect(del?.[1]).toContain("((select private.is_staff()) or owner_id = (select auth.uid())::text)");
  });

  it("레벨 · 옮겨 온 자리 (20261021110000) — 넣을 때 둘 다, 고칠 때는 레벨만 (옮겨 온 자리는 한 번 넣고 그대로)", () => {
    expect(LEVELS_SQL).toContain("add column if not exists levels int[] not null default '{}'");
    expect(LEVELS_SQL).toContain("add column if not exists moved_from jsonb");
    expect(LEVELS_SQL).toContain("check (cardinality(levels) <= 20 and array_position(levels, null) is null)");
    expect(LEVELS_SQL).toContain("moved_from ->> 'kind' in ('notice', 'material')");
    expect(LEVELS_SQL).toContain(
      "grant insert (title, body, links, levels, moved_from), update (title, body, links, levels) on public.staff_posts to authenticated;",
    );
  });

  it("과목 · 과정 (20261021120000) — 비우면 둘 다 · 아는 값만 · 넣을 때 · 고칠 때 둘 다 (옮겨 온 자리는 여전히 넣을 때만)", () => {
    expect(CELLS_SQL).toContain("add column if not exists subject text;");
    expect(CELLS_SQL).toContain("add column if not exists book_set text;");
    expect(CELLS_SQL).toContain("check (subject is null or subject in ('rc', 'lc'))");
    expect(CELLS_SQL).toContain("check (book_set is null or book_set in ('A', 'B'))");
    // 마지막에 남는 칸 단위 grant — 글쓴이 · 시각 칸은 여전히 없다
    expect(lastOf(/grant insert \([^)]*\), update \([^)]*\) on public\.staff_posts to authenticated;/g)).toBe(
      "grant insert (title, body, links, levels, moved_from, subject, book_set), update (title, body, links, levels, subject, book_set) on public.staff_posts to authenticated;",
    );
  });

  it("옮겨 온 글은 원래 자리로 채운다 — 빈 칸만 · 고친 시각 트리거를 바꾸기 전에 (지금 트리거는 두 칸을 보지 않아 '고침' 이 붙지 않는다)", () => {
    const fill = CELLS_SQL.indexOf("update public.staff_posts set subject = moved_from ->> 'subject'");
    expect(fill).toBeGreaterThan(0);
    expect(CELLS_SQL).toContain("update public.staff_posts set book_set = moved_from ->> 'set' where book_set is null and moved_from ->> 'kind' = 'material'");
    expect(CELLS_SQL).toContain("jsonb_array_length(moved_from -> 'subjects') = 1");
    expect(fill).toBeLessThan(CELLS_SQL.indexOf("create or replace function private.tg_staff_posts_stamp()"));
  });

  it("고친 시각은 레벨 · 과목 · 과정이 바뀔 때도 오르고, 글쓴이 · 시각은 여전히 트리거가 채운다 (마지막 함수 정의)", () => {
    const fn = lastOf(/create or replace function private\.tg_staff_posts_stamp\(\).*?\$\$;/g) ?? "";
    expect(fn).toContain("new.author_id := auth.uid();");
    expect(fn).toContain("new.author_name := left(private.my_profile_name(), 40);");
    expect(fn).toContain(
      "or new.levels is distinct from old.levels or new.subject is distinct from old.subject or new.book_set is distinct from old.book_set then new.updated_at := now();",
    );
    expect(fn).not.toContain("moved_from is distinct");
    expect(LEVELS_SQL).toContain("revoke execute on function private.tg_staff_posts_stamp() from public, anon, authenticated;");
    expect(CELLS_SQL).toContain("revoke execute on function private.tg_staff_posts_stamp() from public, anon, authenticated;");
  });

  it("두 표 모두 RLS 가 켜져 있다", () => {
    expect(BOARD_SQL).toContain("alter table public.staff_posts enable row level security;");
    expect(BOARD_SQL).toContain("alter table public.staff_post_files enable row level security;");
  });
});

describe("앱 — 화면 · 액션 · 파일 주소", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("서버 액션은 로그인한 사람의 세션으로만 쓴다 (서비스 롤 없음) · 테스트 등급이면 막는다", () => {
    const src = read("src/app/admin/board/actions.ts");
    const actions = src.split(/export async function /).slice(1);
    expect(actions.map((a) => a.slice(0, a.indexOf("(")))).toEqual(["saveStaffPost", "deleteStaffPost"]);
    for (const a of actions) {
      expect(a).toContain("requireCrew(");
      expect(a).toContain("if (profile.test_role) return");
    }
    expect(src).not.toMatch(/createAdminClient|service_role|SUPABASE_SERVICE_ROLE/);
    // 글쓴이 칸은 보내지 않는다 — grant 도 없다
    expect(src).not.toMatch(/author_(?:id|name):/);
  });

  it("옮기기 액션은 강사 · 관리자만 (requireStaff) · 테스트 등급이면 막고 · 서비스 롤 없이 세션으로", () => {
    const src = read("src/app/admin/board/move-actions.ts");
    const actions = src.split(/export async function /).slice(1);
    // 하나 옮기기 셋 + 여러 개 옮기기의 계획 읽기 · 끝 정리 (2026-10-21)
    expect(actions.map((a) => a.slice(0, a.indexOf("(")))).toEqual([
      "moveStaffPostToClass",
      "moveClassNoticeToBoard",
      "moveClassMaterialToBoard",
      "planStaffPostsMove",
      "finishBoardMoves",
    ]);
    for (const a of actions) {
      // 첫 줄이 가드다 — 그 앞에 아무것도 없다
      const body = a.slice(a.indexOf("> {\n") + 4).trimStart();
      expect(body).toMatch(/^(?:const \{ [^}]*\} = )?await requireStaff\(\);/);
      if (a.includes("createClient(")) expect(a.indexOf("requireStaff(")).toBeLessThan(a.indexOf("createClient("));
      if (!a.startsWith("finishBoardMoves")) expect(a).toContain("if (profile.test_role) return");
    }
    // 여러 개를 차례로 옮길 때는 하나마다 화면을 새로 그리지 않는다 (quiet) — 끝에 finishBoardMoves 가 한 번
    expect(src.match(/revalidateAll\([^;]*, opts\);/g)?.length).toBe(4);
    expect(src).toMatch(/function revalidateAll\(paths: string\[\], opts\?: MoveOptions\) \{\s*if \(opts\?\.quiet === true\) return;/);
    expect(src).not.toMatch(/createAdminClient|service_role|SUPABASE_SERVICE_ROLE/);
    // 직원 글을 넣을 때 글쓴이 칸은 보내지 않는다 (트리거가 옮긴 사람으로 적는다)
    const insert = src.slice(src.indexOf('.from("staff_posts")\n    .insert('));
    expect(insert.slice(0, insert.indexOf(")"))).not.toMatch(/author_/);
  });

  it("목록은 레벨 탭 아래 칸 줄(RC A과정 …)이 있고, 글 · 숫자 모두 레벨 · 과목 · 과정으로 거른다 (2026-10-21)", () => {
    const src = read("src/app/admin/board/page.tsx");
    expect(src).toContain('paramKey="cell"');
    expect(src).toContain("tabs={BOARD_CELLS.map(");
    expect(src).toContain("list = list.or(subjectFilter(cell.subject)).or(setFilter(cell.set));");
    expect(src).toContain("return (await q.or(subjectFilter(c.subject)).or(setFilter(c.set))).count ?? 0;");
    expect(src).toContain("Promise.all(BOARD_CELLS.map(async (c) => [cellValue(c), await countIn(level, c)] as const))");
    // 저장 · 옮기기도 두 칸을 쓴다
    expect(read("src/app/admin/board/actions.ts")).toContain("...cell");
    expect(read("src/app/admin/board/move-actions.ts")).toContain("subject: post.subject, book_set: post.book_set, moved_from: post.moved_from");
  });

  it("글 화면의 '수업자료실로 옮기기' 는 강사 · 관리자에게만 그린다", () => {
    const src = read("src/app/admin/board/[id]/page.tsx");
    expect(src).toMatch(/\{staff && levels\.length > 0 && \(\s*<MoveToClassButton/);
    expect(src).toContain("const staff = isStaff(profile.role);");
  });

  it("화면 넷(목록 · 글 · 글쓰기 · 고치기)이 모두 requireCrew 로 연다", () => {
    for (const p of ["src/app/admin/board/page.tsx", "src/app/admin/board/[id]/page.tsx", "src/app/admin/board/new/page.tsx", "src/app/admin/board/[id]/edit/page.tsx"]) {
      expect(read(p), p).toContain("requireCrew(");
    }
  });

  it("고치기 화면은 글쓴이에게만 폼을 그린다", () => {
    const src = read("src/app/admin/board/[id]/edit/page.tsx");
    expect(src.indexOf("canEditStaffPost(")).toBeGreaterThan(0);
    expect(src.indexOf("canEditStaffPost(")).toBeLessThan(src.indexOf("<StaffPostForm"));
  });

  it("첨부 파일은 /files/board/{파일 id} — 사용자 세션으로 staff_post_files 행을 읽은 뒤 staff-board 에서 서명한다", () => {
    const src = read("src/app/files/[kind]/[id]/route.ts");
    expect(src).toContain(`board: "${STAFF_BOARD_BUCKET}"`);
    expect(src).toContain('kind === "board"');
    expect(src).toContain('from("staff_post_files")');
  });
});
