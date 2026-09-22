import { describe, expect, it } from "vitest";
import { qrMatrix } from "./qr";
import { qrPath } from "./qr-svg";

describe("QR 칸 → SVG path", () => {
  it("가로로 이어진 칸은 한 조각, 조용한 여백(4칸)만큼 밀어 그린다", () => {
    expect(qrPath({ size: 2, cells: "1101" })).toBe("M4 4h2v1h-2zM5 5h1v1h-1z");
    expect(qrPath({ size: 2, cells: "1101" }, 0)).toBe("M0 0h2v1h-2zM1 1h1v1h-1z");
  });

  it("실제 QR 의 검은 칸을 빠짐없이 칠한다", () => {
    const m = qrMatrix("https://winnertoeic.com/attend?t=ABCDEF0123456789ABCD", "H");
    expect(m.cells).toHaveLength(m.size * m.size);
    const painted = [...qrPath(m).matchAll(/h(\d+)v1/g)].reduce((n, [, w]) => n + Number(w), 0);
    expect(painted).toBe([...m.cells].filter((c) => c === "1").length);
  });
});
