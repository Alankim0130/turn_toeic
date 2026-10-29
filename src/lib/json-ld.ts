/**
 * `<script type="application/ld+json">` 에 넣을 글. `<` 를 `<` 여섯 글자로 바꿔 데이터 안의 `</script>` 가 스크립트를 닫지 못하게 한다
 * (JSON 에서는 같은 글자다 — 검색 로봇이 읽는 값은 그대로).
 * 2026-10-29 점검 전까지는 `.replace(/</g, "<")` 로 적혀 있었다 — JS 가 `"<"` 를 `<` 한 글자로 읽어 아무것도 바꾸지 않았다.
 */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
