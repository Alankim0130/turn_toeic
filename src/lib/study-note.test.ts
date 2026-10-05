import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MATERIAL_NOTE_IMAGE_FOLDER,
  MATERIAL_NOTE_IMAGE_MAX_COUNT,
  STUDY_MATERIAL_BUCKET,
  droppedNoteImages,
  isMaterialNoteImage,
  materialNoteError,
} from "./study-note";
import { MATERIAL_NOTE_MAX } from "./study-rounds";

const SQL = readFileSync("supabase/migrations/20261005180000_study_material_note_rich.sql", "utf8").replace(/\s+/g, " ");

describe("비대면 자료 회차 안내 — 공지와 같은 편집기 (2026-10-05)", () => {
  it("길이 끝은 DB check 와 같다 — 두 표 모두 (자료실 · 그 달 적용분)", () => {
    expect(MATERIAL_NOTE_MAX).toBe(50_000);
    expect(SQL).toContain(`add constraint study_material_items_note_check check (note is null or char_length(note) <= ${MATERIAL_NOTE_MAX})`);
    expect(SQL).toContain(`add constraint study_materials_note_check check (note is null or char_length(note) <= ${MATERIAL_NOTE_MAX})`);
    // 옛 500자 check 는 이름이 아니라 정의로 찾아 지운다 (두 번 돌아도 된다)
    expect(SQL).toContain("pg_get_constraintdef(c.oid) ilike '%char_length(note)%'");
  });

  it("사진은 study-materials 버킷 notes/ 폴더 — 조회 정책은 그 사진을 품은 안내가 보이는 사람", () => {
    expect(STUDY_MATERIAL_BUCKET).toBe("study-materials");
    expect(MATERIAL_NOTE_IMAGE_FOLDER).toBe("notes/");
    expect(SQL).toContain(`drop policy if exists "study-materials: 신청자·스태프 조회" on storage.objects`);
    expect(SQL).toContain("or exists (select 1 from public.study_materials m where m.file_path = objects.name)");
    expect(SQL).toContain(
      "objects.name like 'notes/%' and exists (select 1 from public.study_materials m where position(('[img=' || objects.name) in coalesce(m.note, '')) > 0)",
    );
  });

  it("우리가 올린 사진 경로만 받는다 — LIKE 와일드카드가 섞일 수 없는 꼴", () => {
    expect(isMaterialNoteImage("notes/0f8fad5b-d9cb-469f-a165-70867728950e.webp")).toBe(true);
    expect(isMaterialNoteImage("notes/0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isMaterialNoteImage("items/1-abc.pdf")).toBe(false);
    expect(isMaterialNoteImage("notes/a_b.png")).toBe(false);
    expect(isMaterialNoteImage("notes/a%.png")).toBe(false);
    expect(isMaterialNoteImage("notes/../x.png")).toBe(false);
  });

  it("저장 전 검사 — 길이 · 사진 경로 · 장수", () => {
    expect(materialNoteError("")).toBeNull();
    expect(materialNoteError("[b]Part 5[/b] 1~30번\n[center][img=notes/abc-1.png w=50]")).toBeNull();
    expect(materialNoteError("가".repeat(MATERIAL_NOTE_MAX))).toBeNull();
    expect(materialNoteError("가".repeat(MATERIAL_NOTE_MAX + 1))).toBe("안내가 50,000자를 넘어요 (50,001자). 줄이거나 나눠 주세요.");
    expect(materialNoteError("[img=images/a.png]")).toBe("사진 정보가 올바르지 않아요. 사진을 다시 넣어 주세요.");
    const many = Array.from({ length: MATERIAL_NOTE_IMAGE_MAX_COUNT + 1 }, (_, i) => `[img=notes/p${i}.png]`).join("\n");
    expect(materialNoteError(many)).toBe(`사진은 한 회차 안내에 ${MATERIAL_NOTE_IMAGE_MAX_COUNT}장까지 넣을 수 있어요.`);
  });

  it("고치면서 빠진 사진만 지울 후보", () => {
    expect(droppedNoteImages("[img=notes/a.png]\n[img=notes/b.png w=50]", "[img=notes/b.png w=75]")).toEqual(["notes/a.png"]);
    expect(droppedNoteImages(null, "[img=notes/a.png]")).toEqual([]);
    expect(droppedNoteImages("[img=notes/a.png]", null)).toEqual(["notes/a.png"]);
  });
});
