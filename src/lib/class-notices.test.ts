import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLASS_NOTICE_BODY_MAX,
  CLASS_NOTICE_FILE_BUCKET,
  CLASS_NOTICE_FILE_FOLDER,
  CLASS_NOTICE_IMAGE_MAX_BYTES,
  noticeAttachLabel,
  noticeCovers,
  noticeError,
  noticeFilePath,
  noticeVisible,
  partitionNotices,
  publishToggleLabel,
  scopeLabel,
} from "./class-notices";
import { CLASS_MATERIAL_BUCKET } from "./class-materials";
import { isSafeObjectPath } from "./upload";

const SQL = readFileSync("supabase/migrations/20261005170000_class_notices.sql", "utf8");

describe("noticeVisible — DB 정책과 같은 규칙", () => {
  const all = { levels: [], subjects: [] };
  it("전체 공지는 수강 중이면 누구나 (과정 칸이 아직 없어도)", () => {
    expect(noticeVisible(all, [], true)).toBe(true);
    expect(noticeVisible(all, ["650:rc:A"], false)).toBe(false);
  });
  it("레벨 · 과목이 내 과정 칸과 맞아야 한다 — RC 단과에게 LC 공지는 없다", () => {
    expect(noticeVisible({ levels: [650], subjects: [] }, ["650:rc:A"], true)).toBe(true);
    expect(noticeVisible({ levels: [650], subjects: ["lc"] }, ["650:rc:A"], true)).toBe(false);
    expect(noticeVisible({ levels: [], subjects: ["rc"] }, ["750:rc:B"], true)).toBe(true);
    expect(noticeVisible({ levels: [850], subjects: [] }, ["650:rc:A", "850:lc:A"], true)).toBe(true);
    expect(noticeVisible({ levels: [750], subjects: [] }, ["650:rc:A"], true)).toBe(false);
  });
  it("정책 SQL 이 같은 갈래를 가진다", () => {
    const flat = SQL.replace(/\s+/g, " ");
    expect(flat).toContain("cardinality(levels) = 0 and cardinality(subjects) = 0 and (select private.has_term_access(null))");
    expect(flat).toContain("from unnest((select private.my_round_cells())) as c(cell)");
    expect(flat).toContain(`char_length(body) <= ${CLASS_NOTICE_BODY_MAX}`);
    expect(flat).toContain(`${CLASS_NOTICE_IMAGE_MAX_BYTES / 1024 / 1024} * 1024 * 1024`);
    expect(flat).toContain("position(('[img=' || objects.name) in n.body) > 0");
  });
});

describe("범위 이름 · 관리자 화면 거르기", () => {
  it("scopeLabel", () => {
    expect(scopeLabel({ levels: [], subjects: [] })).toBe("전체");
    expect(scopeLabel({ levels: [750, 650], subjects: [] })).toBe("650 · 750");
    expect(scopeLabel({ levels: [650], subjects: ["lc"] })).toBe("650 LC");
    expect(scopeLabel({ levels: [], subjects: ["rc"] })).toBe("RC 전체");
    expect(scopeLabel({ levels: [650], subjects: ["rc", "lc"] })).toBe("650");
  });
  it("noticeCovers", () => {
    expect(noticeCovers({ levels: [], subjects: [] }, 650, "rc")).toBe(true);
    expect(noticeCovers({ levels: [650], subjects: ["lc"] }, 650, "rc")).toBe(false);
  });
});

describe("noticeError", () => {
  const ok = { title: "공지", body: "본문", levels: [650], subjects: ["rc"] };
  it("통과", () => expect(noticeError(ok, [650, 750])).toBeNull());
  it("제목 · 레벨 · 과목 · 그림 경로", () => {
    expect(noticeError({ ...ok, title: "  " }, [650])).toBe("제목을 적어 주세요.");
    expect(noticeError({ ...ok, levels: [999] }, [650])).toBe("레벨을 다시 골라 주세요.");
    expect(noticeError({ ...ok, subjects: ["xx"] }, [650])).toBe("RC · LC 를 다시 골라 주세요.");
    expect(noticeError({ ...ok, body: "[img=other/a.png]" }, [650])).toContain("사진");
    expect(noticeError({ ...ok, body: "[img=images/a.png w=50]" }, [650])).toBeNull();
  });
});

describe("partitionNotices — 내린 공지는 따로 (2026-10-06 Alan)", () => {
  it("published 로 가르고 순서를 지킨다", () => {
    const { live, down } = partitionNotices([
      { id: 1, published: true },
      { id: 2, published: false },
      { id: 3, published: true },
    ]);
    expect(live.map((n) => n.id)).toEqual([1, 3]);
    expect(down.map((n) => n.id)).toEqual([2]);
  });
  it("토글 글자는 지금 상태의 반대 동작이다", () => {
    expect(publishToggleLabel(true)).toBe("공지 내리기");
    expect(publishToggleLabel(false)).toBe("다시 올리기");
  });
});

/**
 * 공지 첨부 파일 · 링크 (2026-10-13 Alan — 공지 고치기 화면을 보여 주며 "공지사항에서도 파일올리기 등등 다 할 수 있도록 부탁해").
 * 수업자료실 자료와 같은 꼴 — 파일은 class_notice_files(부모 공지가 보이는 사람만), 링크는 class_notices.links(같은 check),
 * 저장소는 class-materials 의 notices/ 폴더. 화면이 아니라 DB 가 막는다.
 */
describe("공지 첨부 파일 · 링크 (2026-10-13)", () => {
  const FILES_SQL = readFileSync("supabase/migrations/20261013110000_class_notice_files.sql", "utf8")
    .split("\n")
    .map((l) => (l.trim().startsWith("--") ? "" : l))
    .join("\n")
    .replace(/\s+/g, " ");

  it("파일은 수업자료실 버킷의 notices/ 폴더 — DB check 와 같은 접두어다", () => {
    expect(CLASS_NOTICE_FILE_BUCKET).toBe(CLASS_MATERIAL_BUCKET);
    expect(CLASS_NOTICE_FILE_FOLDER).toBe("notices/");
    expect(FILES_SQL).toContain(`check (file_path like '${CLASS_NOTICE_FILE_FOLDER}%' and position('..' in file_path) = 0)`);
    const path = noticeFilePath({ name: "3주차 모의고사 해설.PDF" });
    expect(path).toMatch(/^notices\/[0-9a-f-]{36}\.pdf$/);
    // 서버 액션이 경로를 이 폴더로 다시 본다 — 수업자료 폴더(650-rc/…)는 받지 않는다
    expect(isSafeObjectPath(path, CLASS_NOTICE_FILE_FOLDER)).toBe(true);
    expect(isSafeObjectPath("650-rc/x.pdf", CLASS_NOTICE_FILE_FOLDER)).toBe(false);
    expect(isSafeObjectPath("notices/../650-rc/x.pdf", CLASS_NOTICE_FILE_FOLDER)).toBe(false);
  });

  it("파일 행 조회 = 부모 공지가 보이는 사람 (공지 정책이 범위 · 내림 · 수강 중을 본다), 쓰기는 강사·관리자", () => {
    expect(FILES_SQL).toContain("using (exists (select 1 from public.class_notices n where n.id = class_notice_files.notice_id))");
    for (const verb of ["insert", "update", "delete"]) {
      expect(FILES_SQL).toMatch(new RegExp(`create policy "class_notice_files: 스태프 [^"]+" on public\\.class_notice_files for ${verb} to authenticated (?:using|with check) \\(\\(select private\\.is_staff\\(\\)\\)\\)`));
    }
    expect(FILES_SQL).toContain("alter table public.class_notice_files enable row level security");
    expect(FILES_SQL).toContain("grant select, insert, update, delete on public.class_notice_files to authenticated");
    expect(FILES_SQL).toContain("notice_id bigint not null references public.class_notices (id) on delete cascade");
  });

  it("링크는 수업자료실 링크와 같은 check (http · https · 20개 · 이름 100자)", () => {
    expect(FILES_SQL).toContain("add column if not exists links jsonb not null default '[]'::jsonb");
    expect(FILES_SQL).toContain("add constraint class_notices_links_check check (private.class_material_links_ok(links))");
  });

  it("저장소 조회 정책에 공지 파일 갈래가 있다 — 수업자료 파일 갈래 · 스태프 갈래는 그대로", () => {
    expect(FILES_SQL).toContain(
      "bucket_id = 'class-materials' and ( (select private.is_staff()) or exists (select 1 from public.class_material_files f where f.file_path = objects.name) or exists (select 1 from public.class_notice_files f where f.file_path = objects.name) )",
    );
  });

  it("noticeAttachLabel — 목록 줄의 작은 글", () => {
    const yt = { url: "https://youtu.be/dQw4w9WgXcQ", label: null };
    const site = { url: "https://example.com/a", label: "해설" };
    expect(noticeAttachLabel(0, [])).toBe("");
    expect(noticeAttachLabel(2, [])).toBe("파일 2개");
    expect(noticeAttachLabel(0, [yt])).toBe("영상 1개");
    expect(noticeAttachLabel(1, [yt, site])).toBe("파일 1개 · 링크 2개");
  });

  it("공지 서버 액션 — 경로는 공지 폴더로 다시 보고 · 링크는 parseMaterialLinks 로 다시 읽고 · 지울 때 첨부 파일도 저장소에서 지운다", () => {
    const actions = readFileSync("src/app/admin/class-materials/notice-actions.ts", "utf8");
    expect(actions).toContain("isSafeObjectPath(f.path, CLASS_NOTICE_FILE_FOLDER)");
    expect(actions).toContain("parseMaterialLinks(input.links)");
    expect(actions).toContain(`.from("class_notice_files").select("file_path").eq("notice_id", id)`);
    expect(actions).toContain("supabase.storage.from(CLASS_NOTICE_FILE_BUCKET).remove(files.map((f) => f.file_path))");
    // 서비스 롤을 쓰지 않는다 — 로그인한 세션으로 써서 RLS 가 한 번 더 막는다
    expect(actions).not.toMatch(/createAdminClient|service_role|SERVICE_ROLE/);
  });

  it("학생 공지 페이지 · 파일 주소 — /files/notice/{파일 id} 는 class_notice_files 를 사용자 세션으로 읽는다", () => {
    const route = readFileSync("src/app/files/[kind]/[id]/route.ts", "utf8");
    expect(route).toContain('notice: "class-materials"');
    expect(route).toContain('kind === "notice"\n        ? await supabase.from("class_notice_files").select(cols).eq("id", id).maybeSingle()');
    const page = readFileSync("src/app/my/materials/notices/[id]/page.tsx", "utf8");
    expect(page).toContain('<MaterialFileList files={notice.files} base="/files/notice" />');
    expect(page).toContain("<MaterialLinkList links={notice.links} />");
  });
});
