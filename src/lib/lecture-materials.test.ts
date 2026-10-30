import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupLectureMaterials,
  LECTURE_MATERIAL_BUCKET,
  LECTURE_MATERIAL_FOLDER,
  lectureFilePath,
  lectureMaterialMeta,
  lectureMaterialsTitle,
  type LectureMaterialRow,
} from "./lecture-materials";
import { CLASS_MATERIAL_BUCKET } from "./class-materials";
import { isSafeObjectPath } from "./upload";

/**
 * 특강 자료실 (2026-10-30 Alan — "특강신청한 사람들이 특강 신청한 곳에 들어가면 볼 수 있는 자료실이 하나 있으면 좋겠어!
 * 다른사람들 말고 신청한 사람들만 보이는 자료실이야"). 누가 보는지는 화면이 아니라 DB 가 막는다 — 정책 모양을 못박고,
 * 학생 화면은 내가 신청한 특강 id 로 한 번 더 좁히는지, 관리자 액션은 가드 · 폴더 검사가 있는지 본다.
 */
const DIR = "supabase/migrations";
const SQL = readFileSync(join(DIR, "20261030110000_lecture_materials.sql"), "utf8");
/** 주석(-- …)을 뺀 본문 */
const body = SQL.split("\n")
  .map((l) => (l.trim().startsWith("--") ? "" : l))
  .join("\n");
const flat = body.replace(/\s+/g, " ");

describe("마이그레이션 — 새 표 둘은 RLS + 정책 + grant 를 한 파일에", () => {
  it("표 · RLS · grant", () => {
    for (const t of ["special_lecture_materials", "special_lecture_material_files"]) {
      expect(flat).toContain(`create table if not exists public.${t} (`);
      expect(flat).toContain(`alter table public.${t} enable row level security`);
      expect(flat).toContain(`grant select, insert, update, delete on public.${t} to authenticated`);
      expect(flat).toContain(`grant all on public.${t} to service_role`);
    }
  });

  it("자료 조회 = 강사 · 관리자(맨 앞) 또는 그 특강을 신청한 학생 — 신청 방식은 가리지 않는다", () => {
    const m = flat.match(/create policy "special_lecture_materials: 신청자·스태프 조회" on public\.special_lecture_materials for select to authenticated using \((.*?)\); drop policy/);
    expect(m).not.toBeNull();
    const using = m![1];
    // 스태프 확인이 맨 앞 (화면 전환 속도 4)
    expect(using.indexOf("(select private.is_staff())")).toBe(1);
    expect(using).toContain("from public.lecture_signups s where s.lecture_id = special_lecture_materials.lecture_id and s.user_id = (select auth.uid())");
    // 특강이 보여야 한다 — 종강 뒤에는 특강 조회 정책(is_term_assignee)이 닫혀 자료도 닫힌다
    expect(using).toContain("exists (select 1 from public.special_lectures l where l.id = special_lecture_materials.lecture_id)");
    expect(using).not.toMatch(/is_crew|is_assistant|has_term_access|\.way\b/);
  });

  it("쓰기 셋은 강사 · 관리자만 — 조교 아님", () => {
    for (const t of ["special_lecture_materials", "special_lecture_material_files"]) {
      for (const verb of ["등록", "수정", "삭제"]) {
        const re = new RegExp(`create policy "${t}: 스태프 ${verb}" on public\\.${t} for (insert|update|delete) to authenticated ([^;]*);`);
        const m = flat.match(re);
        expect(m, `${t} ${verb}`).not.toBeNull();
        expect(m![2]).toContain("(select private.is_staff())");
        expect(m![2]).not.toMatch(/is_crew|is_assistant/);
      }
    }
  });

  it("파일 행 조회 = 부모 자료가 보이는 사람 · 경로는 lectures/ 아래만 (수업자료 파일을 가리켜 미리 열지 못하게)", () => {
    expect(flat).toContain(
      'create policy "special_lecture_material_files: 자료가 보이는 사람 조회" on public.special_lecture_material_files for select to authenticated using (exists (select 1 from public.special_lecture_materials m where m.id = special_lecture_material_files.material_id))',
    );
    expect(flat).toContain(`check (file_path like '${LECTURE_MATERIAL_FOLDER}%' and position('..' in file_path) = 0)`);
    expect(flat).toContain("references public.special_lecture_materials (id) on delete cascade");
    expect(flat).toContain("references public.special_lectures (id) on delete cascade");
  });

  it("자료의 상한은 수업자료실과 같다 — 제목 100 · 안내 5만 · 링크 check", () => {
    expect(flat).toContain("check (char_length(title) between 1 and 100)");
    expect(flat).toContain("check (note is null or char_length(note) <= 50000)");
    expect(flat).toContain("check (private.class_material_links_ok(links))");
  });

  it("저장소 — class-materials 조회 정책의 마지막 판이 세 파일 표를 모두 본다 (수업자료 · 공지 첨부 · 특강 자료)", () => {
    const storage = new Map<string, string>();
    for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(DIR, f), "utf8")
        .split("\n")
        .map((l) => (l.trim().startsWith("--") ? "" : l))
        .join("\n");
      for (const [, verb, name, policy] of sql.matchAll(/(create|drop) policy (?:if exists )?"(class-materials:[^"]+)" on storage\.objects([^;]*);/g)) {
        if (verb === "create") storage.set(name, policy);
        else storage.delete(name);
      }
    }
    const selects = [...storage].filter(([, p]) => /for select/.test(p));
    expect(selects.length).toBe(1);
    const p = selects[0][1].replace(/\s+/g, " ");
    expect(p).toContain("exists (select 1 from public.class_material_files f where f.file_path = objects.name)");
    expect(p).toContain("exists (select 1 from public.class_notice_files f where f.file_path = objects.name)");
    expect(p).toContain("exists (select 1 from public.special_lecture_material_files f where f.file_path = objects.name)");
    // 쓰기 정책은 그대로 강사 · 관리자 — 이 마이그레이션은 조회 정책만 다시 만든다
    expect(flat.match(/on storage\.objects/g)?.length).toBe(2);
  });
});

describe("경로 · 버킷", () => {
  it("공지 첨부 파일처럼 class-materials 버킷의 제 폴더 — 새 버킷을 만들지 않는다", () => {
    expect(LECTURE_MATERIAL_BUCKET).toBe(CLASS_MATERIAL_BUCKET);
    expect(LECTURE_MATERIAL_FOLDER).toBe("lectures/");
    const path = lectureFilePath({ name: "2차 모의고사 해설.pdf" });
    expect(path.startsWith("lectures/")).toBe(true);
    expect(path).toMatch(/^lectures\/[A-Za-z0-9-]+\.pdf$/);
    expect(isSafeObjectPath(path, LECTURE_MATERIAL_FOLDER)).toBe(true);
    // 다른 폴더(수업자료 · 공지) · 거슬러 올라가는 경로는 받지 않는다
    expect(isSafeObjectPath("650-rc/x.pdf", LECTURE_MATERIAL_FOLDER)).toBe(false);
    expect(isSafeObjectPath("notices/x.pdf", LECTURE_MATERIAL_FOLDER)).toBe(false);
    expect(isSafeObjectPath("lectures/../650-rc/x.pdf", LECTURE_MATERIAL_FOLDER)).toBe(false);
  });
});

describe("groupLectureMaterials · 글자", () => {
  const row = (id: number, lecture_id: number, extra: Partial<LectureMaterialRow> = {}): LectureMaterialRow => ({
    id,
    lecture_id,
    title: `자료 ${id}`,
    note: null,
    links: [],
    sort_order: 0,
    created_at: `2026-10-${String(10 + id).padStart(2, "0")}T00:00:00Z`,
    updated_at: `2026-10-${String(10 + id).padStart(2, "0")}T00:00:00Z`,
    files: null,
    ...extra,
  });

  it("특강마다 묶고 올린 순서 · 파일 순서 · 링크 꼴을 맞춘다", () => {
    const grouped = groupLectureMaterials([
      row(2, 7, { files: [{ id: 9, file_name: "b.pdf", file_size: 2, content_type: "application/pdf", sort_order: 1 }, { id: 8, file_name: "a.pdf", file_size: 1, content_type: "application/pdf", sort_order: 0 }] }),
      row(1, 7, { links: [{ url: "https://youtu.be/abc12345678", label: "해설" }, { url: "javascript:alert(1)" }] }),
      row(3, 8),
    ]);
    expect([...grouped.keys()]).toEqual([7, 8]);
    expect(grouped.get(7)!.map((m) => m.id)).toEqual([1, 2]);
    expect(grouped.get(7)![1].files.map((f) => f.id)).toEqual([8, 9]);
    // 링크는 materialLinks 를 거친다 — http(s) 가 아닌 주소는 버린다
    expect(grouped.get(7)![0].links).toEqual([{ url: "https://youtu.be/abc12345678", label: "해설" }]);
    expect(groupLectureMaterials(null).size).toBe(0);
  });

  it("작은 회색 글 · 카드 머리", () => {
    expect(lectureMaterialMeta({ files: [{ id: 1, file_name: "a", file_size: 1, content_type: null, sort_order: 0 }], links: [], note: null })).toBe("파일 1개");
    expect(lectureMaterialMeta({ files: [], links: [{ url: "https://youtu.be/abc12345678", label: null }], note: null })).toBe("영상 1개");
    expect(lectureMaterialMeta({ files: [], links: [], note: "출력해 오세요" })).toBe("안내");
    expect(lectureMaterialMeta({ files: [], links: [], note: null })).toBe("");
    expect(lectureMaterialsTitle(3)).toBe("특강 자료 3개");
  });
});

describe("앱 — 파일 주소 · 학생 화면 좁히기 · 관리자 액션", () => {
  it("/files/lecture/{파일 id} — 사용자 세션으로 파일 행을 읽고(RLS) class-materials 버킷에서 서명한다", () => {
    const route = readFileSync("src/app/files/[kind]/[id]/route.ts", "utf8");
    expect(route).toContain('lecture: "class-materials"');
    expect(route).toContain('kind === "lecture"');
    expect(route).toContain('.from("special_lecture_material_files").select(cols).eq("id", id).maybeSingle()');
    expect(readFileSync("src/components/class-materials/MaterialFileList.tsx", "utf8")).toContain('"/files/lecture"');
  });

  it("학생 화면은 내가 신청한 특강 id 로 좁히고 그 카드(신청 완료) 안에만 그린다", () => {
    const queries = readFileSync("src/app/my/_lib/queries.ts", "utf8");
    const fn = queries.slice(queries.indexOf("export async function getMyLectureMaterials"));
    expect(fn).toContain('.from("special_lecture_materials")');
    expect(fn).toContain('.in("lecture_id", [...lectureIds])');
    expect(fn).toContain("if (lectureIds.length === 0) return new Map()");
    const page = readFileSync("src/app/my/lecture/page.tsx", "utf8");
    expect(page).toContain("getMyLectureMaterials([...mySignups.keys()])");
    // 신청한 학생의 카드(applied 갈래) 안 — 신청 전 카드에는 자료 칸이 없다
    const applied = page.slice(page.indexOf(") : applied ? ("), page.indexOf(') : state === "open" || state === "full" ? ('));
    expect(applied).toContain("<LectureMaterials materials={materialsByLecture.get(l.id) ?? []} />");
    expect(page.match(/<LectureMaterials /g)?.length).toBe(1);
    const card = readFileSync("src/components/my/LectureMaterials.tsx", "utf8");
    expect(card).toContain('base="/files/lecture"');
    expect(card).toContain("<details");
  });

  it("관리자 액션 — 강사 · 관리자만(requireStaff) · 테스트 등급 막음 · lectures/ 폴더 검사 · 서비스 롤 없음 · 세 화면 비우기", () => {
    const src = readFileSync("src/app/admin/lectures/material-actions.ts", "utf8");
    const actions = src.split(/export async function /).slice(1);
    expect(actions.map((a) => a.slice(0, a.indexOf("(")))).toEqual(["saveLectureMaterial", "deleteLectureMaterial"]);
    for (const a of actions) {
      expect(a).toContain("await requireStaff()");
      expect(a).toContain("profile.test_role");
    }
    expect(src).toContain("isSafeObjectPath(f.path, LECTURE_MATERIAL_FOLDER)");
    expect(src).not.toMatch(/createAdminClient|service_role/);
    expect(src).not.toContain("requireCrew(");
    for (const path of ["/admin/lectures/settings", "/admin/lectures", "/my/lecture"]) expect(src).toContain(`revalidatePath("${path}")`);
    // 올리는 곳은 특강 설정 — 조교 화면이 아니다
    const settings = readFileSync("src/app/admin/lectures/settings/page.tsx", "utf8");
    expect(settings).toContain("requireStaff()");
    expect(settings).toContain("<LectureMaterialsPanel");
    expect(settings).toContain('.from("special_lecture_materials")');
  });

  it("화면의 올리기 · 수정은 lectures/ 폴더에 올리고, 등록을 보낸 뒤 끊기면 올린 파일을 지우지 않는다 (2026-10-29 규칙)", () => {
    const panel = readFileSync("src/components/admin/lectures/LectureMaterialsPanel.tsx", "utf8");
    expect(panel.match(/uploadFile\(LECTURE_MATERIAL_BUCKET, lectureFilePath\(p\.file\), p\.file\)/g)?.length).toBe(2);
    expect(panel.match(/if \(uploaded\.length && !sent\) await removeUploaded/g)?.length).toBe(2);
    expect(panel.match(/if \(!res\.filesSaved\) await removeUploaded/g)?.length).toBe(2);
  });

  it("달력에서 특강을 빼면 그 특강 자료의 저장소 파일도 지운다 — 저장이 성공한 뒤에만", () => {
    const src = readFileSync("src/app/admin/sections/actions.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function saveTermSchedule"), src.indexOf("/* ─── 강좌 마스터 추가"));
    const read = fn.indexOf("await lectureMaterialPathsToDrop(supabase, year, month, toSave)");
    const rpc = fn.indexOf('supabase.rpc("save_term_schedule"');
    const remove = fn.indexOf("storage.from(LECTURE_MATERIAL_BUCKET).remove(orphanPaths)");
    const fail = fn.indexOf("if (error) {");
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(rpc);
    // 실패 갈래(if (error) { … return }) 뒤에서 지운다
    expect(remove).toBeGreaterThan(fail);
    expect(fn.indexOf("revalidateSchedule()")).toBeGreaterThan(remove);
    expect(src).toContain('.from("special_lecture_material_files")');
    expect(src).toContain("special_lecture_materials!inner(lecture_id)");
  });
});
