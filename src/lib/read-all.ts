/**
 * PostgREST 는 한 번에 1,000줄까지만 준다 — 방학에 600명이면 배정 · 숙제 · 신청이 넘는다. 넘친 줄은 **조용히 빠진다.**
 * 그래서 1,000줄씩 — 첫 쪽에서 개수를 받고 남은 쪽은 함께 읽는다. 읽다 실패하면 거기까지(`ok` 거짓) — 빈 칸을 어떻게 볼지는 부르는 쪽이 정한다.
 * 쪽을 나눠 읽으므로 **`order` 는 줄마다 하나로 정해지는 값까지**(보통 `id`) 걸어야 한다 — 같은 값이 여럿이면 쪽 사이에서 줄이 겹치거나 빠진다.
 * (2026-10-08 숙제 미제출 알림에서 처음 만들었다 → 2026-10-22 오류 점검에서 특강 신청 명단도 쓰며 여기로 옮겼다)
 */
export const READ_PAGE = 1000;

type Page<T> = { data: T[] | null; error: unknown; count?: number | null };

export async function readAll<T>(page: (from: number, to: number, count: boolean) => PromiseLike<Page<T>>): Promise<{ rows: T[]; ok: boolean }> {
  const first = await page(0, READ_PAGE - 1, true);
  if (first.error) return { rows: [], ok: false };
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  if (rows.length < READ_PAGE || total <= READ_PAGE) return { rows, ok: true };
  const rest = await Promise.all(Array.from({ length: Math.ceil(total / READ_PAGE) - 1 }, (_, i) => page((i + 1) * READ_PAGE, (i + 2) * READ_PAGE - 1, false)));
  if (rest.some((r) => r.error)) return { rows, ok: false };
  for (const r of rest) rows.push(...(r.data ?? []));
  return { rows, ok: true };
}

/**
 * 주소(쿼리 문자열)에 싣는 id 목록은 나눠 보낸다 — uuid 100개 ≈ 3.7KB. id 수백 개를 `.in()` 하나에 실으면 요청 주소가 너무 길어 실패하고,
 * 실패는 빈 목록으로 보인다 (2026-10-29 전체 점검 — 방학에 등록생 600명이면 학생명단 등록생 탭이 비었다). 묶음마다 `readAll` 로 1,000줄씩 읽는다
 */
export const IN_CHUNK = 100;

export async function readAllIn<T, I>(
  ids: readonly I[],
  page: (chunk: I[], from: number, to: number, count: boolean) => PromiseLike<Page<T>>,
  size = IN_CHUNK,
): Promise<{ rows: T[]; ok: boolean }> {
  const chunks: I[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  const results = await Promise.all(chunks.map((chunk) => readAll<T>((from, to, count) => page(chunk, from, to, count))));
  return { rows: results.flatMap((r) => r.rows), ok: results.every((r) => r.ok) };
}
