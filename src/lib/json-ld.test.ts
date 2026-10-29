import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { jsonLdText } from "./json-ld";

describe("jsonLdText — JSON-LD 안의 < 를 이스케이프한다", () => {
  it("</script> 가 글자로 남지 않고, JSON 으로 다시 읽으면 같은 값이다", () => {
    const data = { name: "역전토익 </script><script>alert(1)</script>", n: 1 };
    const out = jsonLdText(data);
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c/script>");
    expect(JSON.parse(out)).toEqual(data);
  });

  it("랜딩이 이 함수로 그린다 — 예전처럼 `\"\\u003c\"`(= `<` 한 글자)로 바꾸는 코드가 남아 있지 않다", () => {
    const page = fs.readFileSync(path.resolve(__dirname, "../app/page.tsx"), "utf8");
    expect(page).toContain("__html: jsonLdText(data)");
    expect(page).not.toMatch(/replace\(\/<\/g, "\\u003c"\)/);
  });
});
