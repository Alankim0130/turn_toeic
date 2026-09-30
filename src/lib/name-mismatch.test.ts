import { describe, expect, it } from "vitest";
import { nameMismatchOf } from "./name-mismatch";

describe("nameMismatchOf — 이름이 다를 때만, 또렷이 읽었을 때만 팝업", () => {
  it("수강증 이름을 읽었고 가입 실명과 다르면 둘을 돌려준다", () => {
    expect(nameMismatchOf(false, "김채은세", "김채은")).toEqual({ receiptName: "김채은세", myName: "김채은" });
    expect(nameMismatchOf(false, "홍길동", "김 민수")).toEqual({ receiptName: "홍길동", myName: "김민수" });
  });
  it("이름이 맞았거나 판정하지 못했으면 띄우지 않는다", () => {
    expect(nameMismatchOf(true, "김민수", "김민수")).toBeUndefined();
    expect(nameMismatchOf(null, "김민수", "홍길동")).toBeUndefined();
  });
  it("수강증 이름을 못 읽었으면 띄우지 않는다 (다르다고 말할 근거가 없다)", () => {
    expect(nameMismatchOf(false, null, "김민수")).toBeUndefined();
  });
  it("읽은 이름이 가입 실명과 같으면 띄우지 않는다", () => {
    expect(nameMismatchOf(false, "김민수", "김민수")).toBeUndefined();
  });
  it("가입 이름이 한글이 아니면 비교하지 않는다", () => {
    expect(nameMismatchOf(false, "김민수", "Minsu Kim")).toBeUndefined();
    expect(nameMismatchOf(false, "김민수", "")).toBeUndefined();
  });
});
