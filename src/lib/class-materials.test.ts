import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_MAX_BYTES,
  CLASS_MATERIAL_NOTE_MAX,
  CLASS_MATERIAL_TITLE_MAX,
  fileKindLabel,
  initialSubject,
  isMaterialSubject,
  MATERIAL_SUBJECTS,
  materialFolder,
  materialObjectPath,
  titleFromFileName,
} from "./class-materials";
import { isSafeObjectPath } from "./upload";

/**
 * 수업자료실 (2026-10-05 Alan — "레벨별 구분과 RC, LC가 구분되어야해"). 화면 값이 DB 와 어긋나면 저장이 check 에 걸리거나(23514)
 * 학생 화면이 엉뚱한 과목을 먼저 연다 — 여기서 실제 마이그레이션 파일과 맞춘다.
 */
const SQL = readFileSync("supabase/migrations/20261005100000_class_materials.sql", "utf8");

describe("DB 와 같은 값", () => {
  it("과목은 rc · lc 둘이고 순서는 RC 먼저 (DB check 와 같다)", () => {
    expect(MATERIAL_SUBJECTS).toEqual(["rc", "lc"]);
    expect(SQL).toContain("check (subject in ('rc', 'lc'))");
  });

  it("제목 1~100자 · 안내 500자 · 버킷 50MB · 버킷 이름", () => {
    expect(SQL).toContain(`char_length(title) between 1 and ${CLASS_MATERIAL_TITLE_MAX}`);
    expect(SQL).toContain(`char_length(note) <= ${CLASS_MATERIAL_NOTE_MAX}`);
    expect(SQL).toContain(`('${CLASS_MATERIAL_BUCKET}', '${CLASS_MATERIAL_BUCKET}', false, 50 * 1024 * 1024`);
    expect(CLASS_MATERIAL_MAX_BYTES).toBe(50 * 1024 * 1024);
  });

  it("학생 조회는 내 레벨(my_lc_levels)로 — 수강 중이라는 것만으로 열지 않는다", () => {
    const select = /create policy "class_materials: [^"]+" on public\.class_materials\s+for select[^;]+;/.exec(SQL)?.[0] ?? "";
    expect(select).toContain("private.my_lc_levels()");
    expect(select).not.toMatch(/has_term_access|has_section_access/);
    // 저장소 파일은 이 표의 행이 보이는지로 — 남의 레벨 파일은 서명 URL 도 못 만든다
    expect(SQL).toMatch(/bucket_id = 'class-materials'\s+and \(\s+\(select private\.is_staff\(\)\)\s+or exists \(select 1 from public\.class_materials m where m\.file_path = objects\.name\)/);
  });
});

describe("저장소 경로", () => {
  it("레벨-과목 폴더 아래 무작위 이름 — 서버의 경로 검사를 통과한다", () => {
    const p = materialObjectPath(650, "rc", { name: "9월 Part5 해설.PDF" });
    expect(p).toMatch(/^650-rc\/[0-9a-f-]{36}\.pdf$/);
    expect(isSafeObjectPath(p, materialFolder(650, "rc"))).toBe(true);
    // 다른 칸 폴더로 올린 경로는 그 칸으로 저장할 수 없다
    expect(isSafeObjectPath(p, materialFolder(750, "rc"))).toBe(false);
    expect(isSafeObjectPath(p, materialFolder(650, "lc"))).toBe(false);
  });
});

describe("titleFromFileName — 제목을 비우면 파일 이름", () => {
  it("확장자를 떼고 밑줄은 띄어 쓴다", () => {
    expect(titleFromFileName("9월_Part5_해설.pdf")).toBe("9월 Part5 해설");
    expect(titleFromFileName("LC 받아쓰기 3강.hwpx")).toBe("LC 받아쓰기 3강");
    expect(titleFromFileName("v1.2 정리.docx")).toBe("v1.2 정리");
  });

  it("확장자가 없거나 이름이 비면 그대로 · 기본 이름", () => {
    expect(titleFromFileName("자료")).toBe("자료");
    expect(titleFromFileName(".pdf")).toBe(".pdf");
    expect(titleFromFileName("   ")).toBe("수업 자료");
  });

  it("100자를 넘지 않는다 (DB check)", () => {
    expect(titleFromFileName(`${"가".repeat(150)}.pdf`)).toHaveLength(CLASS_MATERIAL_TITLE_MAX);
  });
});

describe("fileKindLabel", () => {
  it.each([
    ["a.pdf", null, "PDF"],
    ["a.PDF", null, "PDF"],
    ["a", "application/pdf", "PDF"],
    ["a.hwp", null, "한글"],
    ["a.hwpx", null, "한글"],
    ["a.docx", null, "워드"],
    ["a.pptx", null, "PPT"],
    ["a.xlsx", null, "엑셀"],
    ["a.zip", null, "압축"],
    ["a.jpg", null, "그림"],
    ["사진", "image/png", "그림"],
    ["a.mp3", null, "음원"],
    ["a.bin", "application/octet-stream", "파일"],
  ])("%s (%s) → %s", (name, type, label) => {
    expect(fileKindLabel(name, type)).toBe(label);
  });
});

describe("initialSubject — 학생이 처음 펼칠 과목", () => {
  it("주소에 있으면 그것", () => {
    expect(initialSubject("lc", { rc: 3, lc: 0 })).toBe("lc");
  });

  it("없으면 자료가 있는 첫 과목 — RC 가 비어 있으면 LC", () => {
    expect(initialSubject(undefined, { rc: 2, lc: 5 })).toBe("rc");
    expect(initialSubject(undefined, { rc: 0, lc: 5 })).toBe("lc");
  });

  it("둘 다 비거나 이상한 값이면 RC", () => {
    expect(initialSubject(undefined, {})).toBe("rc");
    expect(initialSubject("math", { rc: 0, lc: 0 })).toBe("rc");
    expect(isMaterialSubject("math")).toBe(false);
    expect(isMaterialSubject(undefined)).toBe(false);
  });
});
