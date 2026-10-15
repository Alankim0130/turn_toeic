import { describe, expect, it } from "vitest";
import { crc32, zipFiles } from "./zip";
import { unzip } from "./__fixtures__/unzip";

/** Word(.docx) 를 묶는 작은 ZIP 쓰기 (2026-10-15 학생명단 Word 받기) — 다시 풀어 내용 · CRC 가 같은지 본다 */
describe("ZIP 쓰기 (zip.ts)", () => {
  it("CRC-32 — 알려진 값", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("넣은 순서 · 이름 · 내용 그대로 풀린다 (한글 · 빈 파일 · 큰 파일)", () => {
    const big = "가나다라마바사 ".repeat(20_000);
    const bytes = zipFiles(
      [
        { name: "[Content_Types].xml", data: "<Types/>" },
        { name: "word/document.xml", data: big },
        { name: "empty.txt", data: "" },
        { name: "bin.dat", data: new Uint8Array([0, 1, 2, 255]) },
      ],
      new Date("2026-10-15T04:05:06Z"),
    );
    const files = unzip(bytes);
    expect(files.map((f) => f.name)).toEqual(["[Content_Types].xml", "word/document.xml", "empty.txt", "bin.dat"]);
    expect(files[1].data.toString("utf8")).toBe(big);
    expect(files[2].data.length).toBe(0);
    expect([...files[3].data]).toEqual([0, 1, 2, 255]);
    expect(files.every((f) => f.method === 8)).toBe(true);
    // 압축이 된다 — 같은 글이 되풀이되는 XML 은 크게 준다
    expect(bytes.length).toBeLessThan(big.length / 20);
  });

  it("ZIP 안의 시각 (DOS 꼴) — 2초 단위", () => {
    const bytes = Buffer.from(zipFiles([{ name: "a.txt", data: "a" }], new Date("2026-10-15T04:05:06Z")));
    const time = bytes.readUInt16LE(10);
    const date = bytes.readUInt16LE(12);
    expect([time >> 11, (time >> 5) & 0x3f, (time & 0x1f) * 2]).toEqual([4, 5, 6]);
    expect([(date >> 9) + 1980, (date >> 5) & 0x0f, date & 0x1f]).toEqual([2026, 10, 15]);
  });

  it("이름은 ASCII 경로만 받는다", () => {
    expect(() => zipFiles([{ name: "명단.xml", data: "x" }])).toThrow();
    expect(() => zipFiles([{ name: "a b.xml", data: "x" }])).toThrow();
  });
});
