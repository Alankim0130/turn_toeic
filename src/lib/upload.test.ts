import { describe, expect, it } from "vitest";
import { contentTypeOf, fileExt, objectName } from "./upload";
import { isMaterialNoteImage } from "./study-note";

/**
 * 저장소 객체 이름 (2026-10-22 오류 점검) — 확장자는 영문 · 숫자 1~8자일 때만 붙인다.
 * 예전에는 `사진.` · `사진.한글` 이 `uuid.` 로, `사진.jpeg_large` 가 `uuid.jpeglarge` 로 올라가 비대면 자료 안내의 사진 경로 검사에 걸렸다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe("objectName — 무작위 이름 + 안전한 확장자", () => {
  it.each([
    ["스크린샷 2026-10-22.png", ".png"],
    ["IMG_1234.HEIC", ".heic"],
    ["교재 해설.hwpx", ".hwpx"],
    ["새로운 녹음.m4a", ".m4a"],
    ["압축.tar.gz", ".gz"],
  ])("%s → 끝이 %s", (name, ext) => {
    const n = objectName({ name });
    expect(n).toMatch(UUID);
    expect(n.slice(36)).toBe(ext);
  });

  it.each(["사진.", "사진.한글", "사진.jpeg_large", "확장자없음", "a..", "x.aaaaaaaaaaaaaaaaaaaaaaa"])("%s → 확장자를 붙이지 않는다", (name) => {
    const n = objectName({ name });
    expect(n).toMatch(UUID);
    expect(n).toHaveLength(36);
  });

  it("비대면 자료 안내의 사진 경로 검사를 늘 통과한다", () => {
    for (const name of ["사진.png", "사진.", "사진.한글", "사진.jpeg_large", "image", "x.aaaaaaaaaaaaaaaaaaaaaaa"]) {
      expect(isMaterialNoteImage(`notes/${objectName({ name })}`)).toBe(true);
    }
  });

  it("형식은 경로가 아니라 파일 이름 · 브라우저가 정한다 — 확장자를 떼도 그대로", () => {
    expect(fileExt("사진.jpeg_large")).toBe(".jpeglarge");
    expect(contentTypeOf({ name: "사진.jpeg_large", type: "image/jpeg" })).toBe("image/jpeg");
    expect(contentTypeOf({ name: "해설.hwp", type: "" })).toBe("application/x-hwp");
  });
});
