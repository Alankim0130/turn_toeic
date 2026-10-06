import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_FILES_MAX,
  CLASS_MATERIAL_LINK_LABEL_MAX,
  CLASS_MATERIAL_LINK_URL_MAX,
  CLASS_MATERIAL_LINKS_MAX,
  CLASS_MATERIAL_MAX_BYTES,
  CLASS_MATERIAL_NOTE_MAX,
  CLASS_MATERIAL_TITLE_MAX,
  charCount,
  defaultMaterialTitle,
  draftLinks,
  fileKindLabel,
  initialSubject,
  isMaterialSubject,
  isViewableKind,
  linkCountLabel,
  linkTitle,
  materialAccess,
  materialBadge,
  materialLinks,
  MATERIAL_SUBJECTS,
  materialFolder,
  materialObjectPath,
  normalizeLinkUrl,
  parseMaterialLinks,
  shortLinkUrl,
  NOTE_FOLD_CHARS,
  NOTE_FOLD_LINES,
  NOTE_PREVIEW_CHARS,
  NOTE_PREVIEW_LINES,
  NOTE_TITLE_CHARS,
  noteHasText,
  notePreview,
  noteTooLong,
  sortMaterialFiles,
  titleFromFileName,
} from "./class-materials";
import { isSafeObjectPath } from "./upload";

/**
 * 수업자료실 (2026-10-05 Alan — "레벨별 구분과 RC, LC가 구분되어야해"). 화면 값이 DB 와 어긋나면 저장이 check 에 걸리거나(23514)
 * 학생 화면이 엉뚱한 과목을 먼저 연다 — 여기서 실제 마이그레이션 파일과 맞춘다.
 */
const SQL = readFileSync("supabase/migrations/20261005100000_class_materials.sql", "utf8");
/** 안내를 스크립트용으로 늘린 마이그레이션 (2026-10-05 Alan — "여기 안내에 스크립트를 올려줄예정이야") */
const NOTE_SQL = readFileSync("supabase/migrations/20261005150000_class_material_note_long.sql", "utf8");
/** 자료 하나에 파일 여러 개 · 글만 (2026-10-06 Alan — "파일업로드를 안하고 글만 적어서 올릴수도 … 파일을 한번에 여러개") */
const FILES_SQL = readFileSync("supabase/migrations/20261006100000_class_material_files.sql", "utf8");
/** 그 다음 단계 (contract) — 새 앱이 뜬 뒤 옛 파일 칸을 지운다 */
const CONTRACT_SQL = readFileSync("supabase/migrations/20261006110000_class_material_files_contract.sql", "utf8");
/** 자료 하나에 링크 여러 개 (2026-10-06 Alan — "유튜브 링크를 한번씩 … 링크를 여러개 올릴 수 있도록") */
const LINKS_SQL = readFileSync("supabase/migrations/20261006143000_class_material_links.sql", "utf8");

describe("DB 와 같은 값", () => {
  it("과목은 rc · lc 둘이고 순서는 RC 먼저 (DB check 와 같다)", () => {
    expect(MATERIAL_SUBJECTS).toEqual(["rc", "lc"]);
    expect(SQL).toContain("check (subject in ('rc', 'lc'))");
  });

  it("제목 1~100자 · 버킷 50MB · 버킷 이름", () => {
    expect(SQL).toContain(`char_length(title) between 1 and ${CLASS_MATERIAL_TITLE_MAX}`);
    expect(SQL).toContain(`('${CLASS_MATERIAL_BUCKET}', '${CLASS_MATERIAL_BUCKET}', false, 50 * 1024 * 1024`);
    expect(CLASS_MATERIAL_MAX_BYTES).toBe(50 * 1024 * 1024);
  });

  it("안내 · 스크립트 5만 자 — 처음 500자 check 를 정의로 찾아 지우고 새로 건다 (20261005150000)", () => {
    // 표를 만들 때의 500자 check 는 이름을 Postgres 가 지었다 — 이름으로 지우지 않는다 (없는 이름을 지우면 배포가 통째로 실패한다)
    expect(SQL).toContain("char_length(note) <= 500");
    expect(NOTE_SQL).toMatch(/pg_get_constraintdef\(c\.oid\) ilike '%char_length\(note\)%'/);
    expect(NOTE_SQL).toContain("execute format('alter table public.class_materials drop constraint %I', r.conname)");
    expect(NOTE_SQL).toContain(`add constraint class_materials_note_check check (note is null or char_length(note) <= ${CLASS_MATERIAL_NOTE_MAX})`);
    expect(CLASS_MATERIAL_NOTE_MAX).toBe(50_000);
    // 서버 액션 본문 한도(1MB) 안 — 한 글자가 UTF-8 4바이트(이모지)여도 넉넉하다
    expect(CLASS_MATERIAL_NOTE_MAX * 4).toBeLessThan(1024 * 1024);
  });

  it("저장소 파일은 이 표의 행이 보이는지로 판정한다 — 학생 조회 정책(레벨 × 과목)은 roles.test.ts 가 재생해서 본다", () => {
    // 남의 레벨 · 내가 듣지 않는 과목의 파일은 서명 URL 도 못 만든다 (2026-10-05 — RC 단과 학생의 LC 자료)
    expect(SQL).toMatch(/bucket_id = 'class-materials'\s+and \(\s+\(select private\.is_staff\(\)\)\s+or exists \(select 1 from public\.class_materials m where m\.file_path = objects\.name\)/);
  });
});

describe("파일 여러 개 · 글만 (마이그레이션 20261006100000)", () => {
  it("새 표 = RLS + 정책 + grant 를 한 파일에 (CLAUDE.md 보안 점검)", () => {
    expect(FILES_SQL).toContain("create table if not exists public.class_material_files");
    expect(FILES_SQL).toContain("references public.class_materials (id) on delete cascade");
    expect(FILES_SQL).toContain("alter table public.class_material_files enable row level security");
    expect(FILES_SQL).toContain("grant select, insert, update, delete on public.class_material_files to authenticated");
    // 정책은 지우고 만든다 — 다시 돌려도 실패하지 않게 (없는 정책을 그냥 drop 하면 배포가 통째로 실패한다)
    for (const name of [...FILES_SQL.matchAll(/create policy "([^"]+)"/g)].map((m) => m[1])) {
      expect(FILES_SQL, name).toContain(`drop policy if exists "${name}"`);
    }
  });

  it("파일 행은 부모 자료가 보이는 사람만 본다 — 열린 회차 규칙(class_materials 정책)을 그대로 탄다", () => {
    expect(FILES_SQL).toMatch(/for select to authenticated\s+using \(exists \(select 1 from public\.class_materials m where m\.id = class_material_files\.material_id\)\)/);
    // 쓰기는 강사·관리자만 — 조교 화면이 아니다
    for (const verb of ["insert", "update", "delete"]) {
      expect(FILES_SQL).toMatch(new RegExp(`for ${verb} to authenticated[^;]*private\\.is_staff\\(\\)`));
    }
  });

  it("있던 파일은 자료와 같은 id 로 옮긴다 — 그날 받은 /files/class/{id} 링크가 그대로 같은 파일이다", () => {
    expect(FILES_SQL).toMatch(/select m\.id, m\.id, m\.file_path/);
    // 직접 넣은 id 뒤에서 번호를 이어 간다 (안 맞추면 다음 파일이 23505 로 실패한다)
    expect(FILES_SQL).toContain("pg_get_serial_sequence('public.class_material_files', 'id')");
    // 글만 올린 자료는 파일 칸이 빈다
    expect(FILES_SQL).toContain("alter table public.class_materials alter column file_path drop not null");
    expect(FILES_SQL).toContain("alter table public.class_materials alter column file_name drop not null");
  });

  it("저장소 정책 — 파일 표의 행이 보이면 (배포 사이 옛 앱이 올린 파일을 위해 옛 칸도 함께 본다)", () => {
    expect(FILES_SQL).toContain('drop policy if exists "class-materials: 내 레벨 수강생·스태프 조회" on storage.objects');
    expect(FILES_SQL).toMatch(/or exists \(select 1 from public\.class_material_files f where f\.file_path = objects\.name\)/);
  });

  it("파일 수 상한 — 서버 액션 본문(1MB)에 경로 · 이름 20개는 넉넉하다", () => {
    expect(CLASS_MATERIAL_FILES_MAX).toBe(20);
  });

  it("마무리(20261006110000) — 배포 사이 옛 앱이 올린 파일을 옮기고, 저장소 정책을 먼저 바꾼 뒤 옛 칸을 지운다", () => {
    const copy = CONTRACT_SQL.indexOf("insert into public.class_material_files");
    const policy = CONTRACT_SQL.indexOf('create policy "class-materials: 자료가 보이는 사람·스태프 조회" on storage.objects');
    const drop = CONTRACT_SQL.indexOf("drop column if exists file_path");
    expect(copy).toBeGreaterThan(-1);
    // 옛 칸을 쓰는 정책이 남아 있으면 칸을 지울 수 없다 (정책이 칸에 기대고 있다) — 순서가 곧 배포 성공 여부다
    expect(policy).toBeGreaterThan(copy);
    expect(drop).toBeGreaterThan(policy);
    expect(CONTRACT_SQL).not.toMatch(/public\.class_materials m where m\.file_path = objects\.name/);
    for (const col of ["file_path", "file_name", "file_size", "content_type"]) expect(CONTRACT_SQL).toContain(`drop column if exists ${col}`);
  });
});

describe("noteHasText — 글만 올리는 자료의 조건", () => {
  it("보이는 글자가 있어야 한다 — 서식 태그 · 빈 줄만 남은 글은 없는 것", () => {
    expect(noteHasText("1강 스크립트")).toBe(true);
    expect(noteHasText("[b]듣기 전에[/b]")).toBe(true);
    expect(noteHasText("")).toBe(false);
    expect(noteHasText(null)).toBe(false);
    expect(noteHasText(undefined)).toBe(false);
    expect(noteHasText("  \n\n  ")).toBe(false);
    expect(noteHasText("[b][/b]\n[center]")).toBe(false);
  });
});

describe("defaultMaterialTitle — 제목을 비워 두면", () => {
  it("파일 하나면 그 이름 · 여럿이면 첫 이름 외 N개", () => {
    expect(defaultMaterialTitle(["850 LC 1강 스크립트.pdf"], null)).toBe("850 LC 1강 스크립트");
    expect(defaultMaterialTitle(["1강_스크립트.pdf", "1강 해설.pdf", "1강 음원.mp3"], "안내")).toBe("1강 스크립트 외 2개");
  });

  it("글만이면 안내의 첫 줄 — 서식 태그는 빼고, 길면 줄인다", () => {
    expect(defaultMaterialTitle([], "\n\n[b]850+R 1강 교재 스크립트[/b]\nM: Good morning")).toBe("850+R 1강 교재 스크립트");
    const long = `${"가".repeat(NOTE_TITLE_CHARS + 10)}\n둘째 줄`;
    expect(defaultMaterialTitle([], long)).toBe(`${"가".repeat(NOTE_TITLE_CHARS)}…`);
  });

  it("아무것도 없으면 '수업 자료' · 늘 1~100자 (DB check)", () => {
    expect(defaultMaterialTitle([], null)).toBe("수업 자료");
    expect(defaultMaterialTitle([], "[b][/b]")).toBe("수업 자료");
    const many = defaultMaterialTitle([`${"나".repeat(150)}.pdf`, "b.pdf"], null);
    expect(Array.from(many).length).toBeLessThanOrEqual(CLASS_MATERIAL_TITLE_MAX);
    expect(many.endsWith(" 외 1개")).toBe(true);
  });
});

describe("materialBadge · isViewableKind · sortMaterialFiles", () => {
  const f = (id: number, file_name: string, sort_order = 0, content_type: string | null = null) => ({ id, file_name, content_type, sort_order, file_size: 1 });

  it("글만 → 글 · 하나 → 그 종류 · 여럿 → 파일 N", () => {
    expect(materialBadge([])).toBe("글");
    expect(materialBadge([f(1, "a.pdf")])).toBe("PDF");
    expect(materialBadge([f(1, "a.pdf"), f(2, "b.mp3")])).toBe("파일 2");
  });

  it("그 자리에서 여는 것은 PDF · 그림뿐", () => {
    expect(isViewableKind("PDF")).toBe(true);
    expect(isViewableKind("그림")).toBe(true);
    expect(isViewableKind("한글")).toBe(false);
    expect(isViewableKind("음원")).toBe(false);
  });

  it("올린 순서(sort_order), 같으면 먼저 넣은 것 — 원본은 건드리지 않는다", () => {
    const list = [f(5, "c", 2), f(3, "a", 0), f(9, "b", 0)];
    expect(sortMaterialFiles(list).map((x) => x.id)).toEqual([3, 9, 5]);
    expect(list.map((x) => x.id)).toEqual([5, 3, 9]);
    expect(sortMaterialFiles(null)).toEqual([]);
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
  it("그 레벨에서 내가 듣는 과목 안에서만 — RC 단과가 주소에 subject=lc 를 쳐도 RC (2026-10-05)", () => {
    expect(initialSubject("lc", { rc: 3 }, ["rc"])).toBe("rc");
    expect(initialSubject(undefined, { lc: 2 }, ["lc"])).toBe("lc");
    expect(initialSubject(undefined, { lc: 0 }, ["lc"])).toBe("lc");
    expect(initialSubject("rc", { rc: 0, lc: 4 }, ["rc", "lc"])).toBe("rc");
  });

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

describe("materialAccess — 레벨마다 내가 듣는 과목 (DB private.my_subject_levels 와 같은 규칙에서 받는다)", () => {
  it("RC 단과 650 → 650 은 RC 하나", () => {
    expect(materialAccess({ rc: [650], lc: [] }, [650, 750, 850])).toEqual([{ level: 650, subjects: ["rc"] }]);
  });
  it("중급속성(650 + 850, 두 과목) · 레벨 순서는 교재 레벨 목록 그대로", () => {
    expect(materialAccess({ rc: [650, 850], lc: [650, 850] }, [850, 650, 750])).toEqual([
      { level: 850, subjects: ["rc", "lc"] },
      { level: 650, subjects: ["rc", "lc"] },
    ]);
  });
  it("레벨마다 과목이 다를 수 있다 — 650 RC 단과 + 750 LC 단과", () => {
    expect(materialAccess({ rc: [650], lc: [750] }, [650, 750, 850])).toEqual([
      { level: 650, subjects: ["rc"] },
      { level: 750, subjects: ["lc"] },
    ]);
  });
  it("레벨 목록을 못 읽으면 숫자 순서 · 반이 없으면 빈 목록", () => {
    expect(materialAccess({ rc: [750], lc: [650, 750] }, [])).toEqual([
      { level: 650, subjects: ["lc"] },
      { level: 750, subjects: ["rc", "lc"] },
    ]);
    expect(materialAccess({ rc: [], lc: [] }, [650])).toEqual([]);
  });
});

describe("notePreview — 짧은 안내는 펼쳐 두고 긴 스크립트만 접는다 (2026-10-05)", () => {
  it("짧은 안내 · 다섯 줄짜리 준비물 안내는 접지 않는다", () => {
    expect(notePreview("수업 전에 출력해 오세요.")).toEqual({ folded: false, preview: "수업 전에 출력해 오세요.", chars: 14 });
    const fiveLines = "준비물\n- 교재\n- 펜\n- 이어폰\n수업 10분 전 입실";
    expect(notePreview(fiveLines).folded).toBe(false);
    // 앞뒤 빈 줄은 센다 전에 지운다
    expect(notePreview("\n\n  짧은 안내  \n\n")).toEqual({ folded: false, preview: "짧은 안내", chars: 5 });
  });

  it("기준 바로 위에서 접는다 — 줄 수 · 글자 수 어느 쪽이든", () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `M: line ${i + 1}`).join("\n");
    expect(notePreview(lines(NOTE_FOLD_LINES)).folded).toBe(false);
    expect(notePreview(lines(NOTE_FOLD_LINES + 1)).folded).toBe(true);
    expect(notePreview("가".repeat(NOTE_FOLD_CHARS)).folded).toBe(false);
    expect(notePreview("가".repeat(NOTE_FOLD_CHARS + 1)).folded).toBe(true);
  });

  it("접으면 앞 네 줄 · 200자까지만 보인다 · 글자 수는 전체", () => {
    const script = Array.from({ length: 40 }, (_, i) => (i % 2 ? `W: Sure, I can help with question ${i}.` : `M: Could you check question ${i}?`)).join("\n");
    const r = notePreview(script);
    expect(r.folded).toBe(true);
    expect(r.preview.split("\n")).toHaveLength(NOTE_PREVIEW_LINES);
    expect(r.preview).toBe(script.split("\n").slice(0, NOTE_PREVIEW_LINES).join("\n"));
    expect(r.chars).toBe(script.length);
    const long = notePreview("나".repeat(5000));
    expect(Array.from(long.preview)).toHaveLength(NOTE_PREVIEW_CHARS);
    expect(long.chars).toBe(5000);
  });

  it("이모지를 반으로 자르지 않는다 (코드 포인트로 센다)", () => {
    const r = notePreview("😀".repeat(400));
    expect(r.folded).toBe(true);
    expect(Array.from(r.preview)).toHaveLength(NOTE_PREVIEW_CHARS);
    expect(r.preview).toBe("😀".repeat(NOTE_PREVIEW_CHARS));
    expect(r.chars).toBe(400);
  });
});

describe("noteTooLong — 폼과 서버가 같은 말로 막는다", () => {
  it("5만 자까지는 괜찮고 넘으면 몇 자인지 말한다", () => {
    expect(noteTooLong("")).toBeNull();
    expect(noteTooLong("가".repeat(CLASS_MATERIAL_NOTE_MAX))).toBeNull();
    expect(noteTooLong("가".repeat(CLASS_MATERIAL_NOTE_MAX + 1))).toBe("안내가 50,000자를 넘어요 (50,001자). 줄이거나, 긴 스크립트는 파일로 올려 주세요.");
  });

  it("DB(char_length)와 같은 셈 — 이모지 5만 자는 들어간다 (재생 DB 에서 200KB 로 들어가는 것을 확인했다)", () => {
    expect(charCount("😀가a\n")).toBe(4);
    expect("😀".length).toBe(2);
    expect(noteTooLong("😀".repeat(CLASS_MATERIAL_NOTE_MAX))).toBeNull();
    expect(noteTooLong("😀".repeat(CLASS_MATERIAL_NOTE_MAX + 1))).toContain("(50,001자)");
  });
});

describe("링크 — 자료 하나에 0 ~ 20개 (2026-10-06 Alan '유튜브 링크를 … 여러개', 마이그레이션 20261006143000)", () => {
  it("DB check 와 같은 상한 — 20개 · 주소 2,000자(http/https) · 이름 100자", () => {
    expect(CLASS_MATERIAL_LINKS_MAX).toBe(20);
    expect(LINKS_SQL).toContain(`jsonb_array_length(p_links) <= ${CLASS_MATERIAL_LINKS_MAX}`);
    expect(LINKS_SQL).toContain(`char_length(e.v ->> 'url') > ${CLASS_MATERIAL_LINK_URL_MAX}`);
    expect(LINKS_SQL).toContain(`char_length(coalesce(e.v ->> 'label', '')) > ${CLASS_MATERIAL_LINK_LABEL_MAX}`);
    expect(LINKS_SQL).toContain("'^https?://[^[:space:]]+$'");
    // 칸은 비어 있는 배열로 시작한다 — 있던 자료는 그대로 '링크 없음' 이다
    expect(LINKS_SQL).toContain("add column if not exists links jsonb not null default '[]'::jsonb");
    // check 는 저장하는 강사 세션의 권한으로 함수를 부른다 — 실행 권한이 없으면 저장이 통째로 막힌다
    expect(LINKS_SQL).toContain("grant execute on function private.class_material_links_ok(jsonb) to authenticated, service_role");
    // 다시 돌려도 실패하지 않게
    expect(LINKS_SQL).toContain("drop constraint if exists class_materials_links_check");
  });

  it("normalizeLinkUrl — https:// 를 빼먹으면 붙이고, http(s) 가 아니거나 이상한 주소는 받지 않는다", () => {
    expect(normalizeLinkUrl("  https://youtu.be/dQw4w9WgXcQ?si=abc  ")).toBe("https://youtu.be/dQw4w9WgXcQ?si=abc");
    expect(normalizeLinkUrl("youtu.be/dQw4w9WgXcQ")).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(normalizeLinkUrl("www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(normalizeLinkUrl("http://blog.naver.com/abc/1")).toBe("http://blog.naver.com/abc/1");
    expect(normalizeLinkUrl("HTTPS://EXAMPLE.COM/A")).toBe("https://example.com/A");
    for (const bad of ["", "   ", "javascript:alert(1)", "data:text/html,x", "ftp://a.com/x", "mailto:a@b.com", "http://localhost:3000", "https://youtube.com@evil.com/x", "그냥 글", "youtube"]) {
      expect(normalizeLinkUrl(bad), bad).toBeNull();
    }
    expect(normalizeLinkUrl(`https://a.com/${"a".repeat(CLASS_MATERIAL_LINK_URL_MAX)}`)).toBeNull();
  });

  it("parseMaterialLinks — 빈 줄은 건너뛰고, 주소 없는 이름 · 못 읽는 주소는 그 줄 번호와 함께 막는다", () => {
    expect(parseMaterialLinks(null)).toEqual({ ok: true, links: [] });
    expect(
      parseMaterialLinks([
        { url: "youtu.be/dQw4w9WgXcQ", label: "  1강\n해설   영상 " },
        { url: "", label: "" },
        { url: "https://blog.naver.com/x", label: "" },
      ]),
    ).toEqual({
      ok: true,
      links: [
        { url: "https://youtu.be/dQw4w9WgXcQ", label: "1강 해설 영상" },
        { url: "https://blog.naver.com/x", label: null },
      ],
    });
    expect(parseMaterialLinks([{ url: "", label: "이름만" }])).toMatchObject({ ok: false, index: 0, error: expect.stringContaining("1번째 링크에 주소가 없어요") });
    expect(parseMaterialLinks([{ url: "https://a.com" }, { url: "javascript:alert(1)" }])).toMatchObject({ ok: false, index: 1, error: expect.stringContaining("2번째 링크 주소") });
    expect(parseMaterialLinks([{ url: "https://a.com", label: "가".repeat(CLASS_MATERIAL_LINK_LABEL_MAX + 1) }])).toMatchObject({ ok: false, index: 0 });
    expect(parseMaterialLinks([{ url: "https://a.com", label: "가".repeat(CLASS_MATERIAL_LINK_LABEL_MAX) }])).toMatchObject({ ok: true });
    // 화면이 보낸 이상한 값도 견딘다 (서버 액션이 그대로 받는다)
    expect(parseMaterialLinks([{ url: 5 } as never, null as never, { url: "https://a.com", label: 3 } as never])).toEqual({ ok: true, links: [{ url: "https://a.com/", label: null }] });
  });

  it("같은 주소는 한 번만 (먼저 적은 이름) · 20개를 넘으면 막는다", () => {
    const r = parseMaterialLinks([
      { url: "https://youtu.be/dQw4w9WgXcQ", label: "처음" },
      { url: "youtu.be/dQw4w9WgXcQ", label: "두 번째" },
    ]);
    expect(r).toEqual({ ok: true, links: [{ url: "https://youtu.be/dQw4w9WgXcQ", label: "처음" }] });
    const many = Array.from({ length: CLASS_MATERIAL_LINKS_MAX + 1 }, (_, k) => ({ url: `https://a.com/${k}` }));
    expect(parseMaterialLinks(many)).toMatchObject({ ok: false, error: "링크는 한 자료에 20개까지 올릴 수 있어요." });
    expect(parseMaterialLinks(many.slice(0, CLASS_MATERIAL_LINKS_MAX))).toMatchObject({ ok: true });
  });

  it("materialLinks — DB 값이 이상해도 http(s) 주소만 남긴다 (화면 href 의 마지막 방어선)", () => {
    expect(materialLinks(null)).toEqual([]);
    expect(materialLinks({ url: "https://a.com" })).toEqual([]);
    expect(
      materialLinks([
        { url: "https://youtu.be/dQw4w9WgXcQ", label: "영상" },
        { url: "javascript:alert(1)", label: "x" },
        { url: "https://a.com/x y" },
        "https://b.com",
        { url: "http://c.com", label: "  " },
      ]),
    ).toEqual([
      { url: "https://youtu.be/dQw4w9WgXcQ", label: "영상" },
      { url: "http://c.com", label: null },
    ]);
  });

  it("linkTitle · shortLinkUrl — 이름이 없으면 유튜브 영상 · 사이트 이름, 여럿이면 번호", () => {
    expect(linkTitle({ url: "https://youtu.be/dQw4w9WgXcQ", label: "1강 해설" }, 0, 3)).toBe("1강 해설");
    expect(linkTitle({ url: "https://youtu.be/dQw4w9WgXcQ", label: null }, 0, 1)).toBe("유튜브 영상");
    expect(linkTitle({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", label: null }, 1, 2)).toBe("유튜브 영상 2");
    expect(linkTitle({ url: "https://www.youtube.com/@winnertoeic", label: null }, 0, 1)).toBe("유튜브");
    expect(linkTitle({ url: "https://www.blog.naver.com/x", label: null }, 2, 3)).toBe("blog.naver.com 3");
    expect(shortLinkUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube.com/watch?v=dQw4w9WgXcQ");
    expect(shortLinkUrl("http://a.com/")).toBe("a.com");
  });

  it("defaultMaterialTitle — 파일이 먼저, 그다음 이름 붙인 링크, 안내 첫 줄, 이름 없는 링크", () => {
    const yt = { url: "https://youtu.be/dQw4w9WgXcQ", label: null };
    const named = { url: "https://youtu.be/aaaaaaaaaaa", label: "Part 5 해설 강의" };
    expect(defaultMaterialTitle(["1강.pdf"], "안내", [named])).toBe("1강");
    expect(defaultMaterialTitle([], "꼭 보고 오세요", [yt, named])).toBe("Part 5 해설 강의 외 1개");
    expect(defaultMaterialTitle([], "꼭 보고 오세요", [yt])).toBe("꼭 보고 오세요");
    expect(defaultMaterialTitle([], null, [yt])).toBe("유튜브 영상");
    expect(defaultMaterialTitle([], null, [yt, { url: "https://a.com", label: null }])).toBe("유튜브 영상 외 1개");
    const longLabel = defaultMaterialTitle([], null, [{ url: "https://a.com", label: "가".repeat(100) }, yt]);
    expect(Array.from(longLabel).length).toBeLessThanOrEqual(CLASS_MATERIAL_TITLE_MAX);
    expect(longLabel.endsWith(" 외 1개")).toBe(true);
  });

  it("draftLinks — 폼의 제목 자리 표시는 지금 읽히는 줄만 (못 읽는 줄 · 빈 줄 · 같은 주소는 건너뛴다)", () => {
    expect(
      draftLinks([
        { url: "youtu.be/dQw4w9WgXcQ", label: "1강" },
        { url: "아직 치는 중", label: "" },
        { url: "", label: "이름만" },
        { url: "https://youtu.be/dQw4w9WgXcQ", label: "또" },
        { url: "https://a.com", label: "" },
      ]),
    ).toEqual([
      { url: "https://youtu.be/dQw4w9WgXcQ", label: "1강" },
      { url: "https://a.com/", label: null },
    ]);
    expect(draftLinks([])).toEqual([]);
  });

  it("linkCountLabel — 다 유튜브 영상이면 영상 N개, 아니면 링크 N개", () => {
    expect(linkCountLabel([{ url: "https://youtu.be/dQw4w9WgXcQ", label: null }])).toBe("영상 1개");
    expect(linkCountLabel([{ url: "https://youtu.be/dQw4w9WgXcQ", label: null }, { url: "https://a.com", label: null }])).toBe("링크 2개");
  });

  it("materialBadge — 링크만이면 영상 · 유튜브 · 링크, 파일과 함께면 자료 N", () => {
    const pdf = { id: 1, file_name: "a.pdf", content_type: null, sort_order: 0, file_size: 1 };
    const yt = { url: "https://youtu.be/dQw4w9WgXcQ", label: null };
    const yt2 = { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", label: null };
    const channel = { url: "https://www.youtube.com/@winnertoeic", label: null };
    const web = { url: "https://blog.naver.com/x", label: null };
    expect(materialBadge([], [yt])).toBe("영상");
    expect(materialBadge([], [yt, yt2])).toBe("영상 2");
    expect(materialBadge([], [channel])).toBe("유튜브");
    expect(materialBadge([], [web])).toBe("링크");
    expect(materialBadge([], [yt, web])).toBe("링크 2");
    expect(materialBadge([pdf], [yt])).toBe("자료 2");
    // 링크가 없으면 예전 그대로
    expect(materialBadge([pdf], [])).toBe("PDF");
    expect(materialBadge([], [])).toBe("글");
  });
});
