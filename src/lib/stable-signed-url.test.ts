import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LC 교재 표지 — 하루 동안 같은 서명 주소 (2026-10-09 Alan "Lc음원듣기에서도 교재 이미지 불러오는게 시간이 쫌 걸려").
 * Supabase CDN 은 서명 토큰마다 캐시를 따로 둬서, 볼 때마다 새 주소를 만들면 원본을 매번 다시 줄였다 (stable-signed-url.ts 머리말).
 * 되돌려도 표지는 멀쩡히 떠서 **느려지기만** 한다 — 그래서 소스까지 읽어 못박는다.
 */
const sign = vi.hoisted(() => ({
  calls: [] as { bucket: string; path: string; expiresIn: number; transform: unknown }[],
  fail: false,
}));
const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock("next/cache", () => ({
  // 실패는 담지 않는 데이터 캐시 흉내 — 키는 keyParts
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[]) =>
    async () => {
      const key = JSON.stringify(keyParts);
      if (store.has(key)) return store.get(key);
      const value = await fn();
      store.set(key, value);
      return value;
    },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expiresIn: number, opts?: { transform?: unknown }) => {
          sign.calls.push({ bucket, path, expiresIn, transform: opts?.transform });
          if (sign.fail) return { data: null, error: { message: "boom" } };
          return { data: { signedUrl: `https://x.supabase.co/storage/v1/render/image/sign/${bucket}/${path}?token=t${sign.calls.length}` }, error: null };
        },
      }),
    },
  }),
}));

const { COVER_REDIRECT_MAX_AGE, COVER_SIGNED_SECONDS, COVER_WINDOW_SECONDS, coverWindow, stableCoverUrl } = await import("./stable-signed-url");

const at = (iso: string) => new Date(iso).getTime();

beforeEach(() => {
  sign.calls.length = 0;
  sign.fail = false;
  store.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("하루 칸 — 04:00 KST 에 바뀐다", () => {
  it("03:59:59 KST 와 04:00 KST 는 다른 칸, 04:00 ~ 다음 날 03:59:59 는 같은 칸", () => {
    const before = coverWindow(at("2026-10-10T03:59:59+09:00"));
    const start = coverWindow(at("2026-10-10T04:00:00+09:00"));
    expect(start).toBe(before + 1);
    expect(coverWindow(at("2026-10-10T12:00:00+09:00"))).toBe(start);
    expect(coverWindow(at("2026-10-11T03:59:59+09:00"))).toBe(start);
    expect(coverWindow(at("2026-10-11T04:00:00+09:00"))).toBe(start + 1);
  });

  it("서명 주소는 칸 + 브라우저가 302 를 기억하는 시간보다 오래 산다 — 칸 처음에 만든 주소를 칸 끝에 건네고 브라우저가 12시간 써도 살아 있다", () => {
    expect(COVER_WINDOW_SECONDS).toBe(24 * 60 * 60);
    expect(COVER_SIGNED_SECONDS).toBeGreaterThanOrEqual(COVER_WINDOW_SECONDS + COVER_REDIRECT_MAX_AGE);
    // 너무 길게 잡지 않는다 — 학생이 주소를 남에게 보내면 그만큼 표지가 보인다 (CLAUDE.md 보안 점검)
    expect(COVER_SIGNED_SECONDS).toBeLessThanOrEqual(2 * COVER_WINDOW_SECONDS);
    expect(COVER_REDIRECT_MAX_AGE).toBeLessThan(COVER_WINDOW_SECONDS);
  });
});

describe("stableCoverUrl — 같은 칸 · 같은 표지 · 같은 크기면 같은 주소", () => {
  it("같은 칸에서는 몇 번을 불러도 한 번만 서명한다 (CDN 이 같은 주소로 받아 원본을 한 번만 줄인다)", async () => {
    vi.setSystemTime(at("2026-10-09T09:00:00+09:00"));
    const a = await stableCoverUrl("650/A-x.jpg", 480);
    vi.setSystemTime(at("2026-10-10T03:59:00+09:00"));
    const b = await stableCoverUrl("650/A-x.jpg", 480);
    expect(b).toBe(a);
    expect(sign.calls).toHaveLength(1);
    expect(sign.calls[0]).toEqual({
      bucket: "lc-textbooks",
      path: "650/A-x.jpg",
      expiresIn: COVER_SIGNED_SECONDS,
      transform: { width: 480, resize: "contain", quality: 70 },
    });
  });

  it("칸이 바뀌면 새 주소 — 크기 · 표지가 다르면 다른 주소", async () => {
    vi.setSystemTime(at("2026-10-09T09:00:00+09:00"));
    const a = await stableCoverUrl("650/A-x.jpg", 480);
    const small = await stableCoverUrl("650/A-x.jpg", 160);
    const other = await stableCoverUrl("650/B-y.jpg", 480);
    vi.setSystemTime(at("2026-10-10T04:00:00+09:00"));
    const next = await stableCoverUrl("650/A-x.jpg", 480);
    expect(new Set([a, small, other, next]).size).toBe(4);
    expect(sign.calls).toHaveLength(4);
  });

  it("서명이 실패하면 던진다 — 실패를 담아 두면 하루 동안 표지가 깨진다", async () => {
    vi.setSystemTime(at("2026-10-09T09:00:00+09:00"));
    sign.fail = true;
    await expect(stableCoverUrl("650/A-x.jpg", 480)).rejects.toThrow(/표지 서명 실패/);
    sign.fail = false;
    await expect(stableCoverUrl("650/A-x.jpg", 480)).resolves.toContain("token=");
    expect(sign.calls).toHaveLength(2);
  });
});

describe("소스 — 표지만, 행을 읽은 뒤에만, 브라우저가 기억하게", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const ROUTE = "src/app/files/[kind]/[id]/route.ts";

  it("/files 라우트는 로그인한 사람의 세션으로 lc_books 행을 읽은 **뒤에** 교재 표지에만 같은 주소를 쓴다", () => {
    const src = read(ROUTE);
    const rowRead = src.indexOf('supabase.from("lc_books")');
    const notFound = src.indexOf("if (!row?.file_path || !row.file_name) return notFound();");
    const use = src.indexOf("stableCoverUrl(row.file_path, width)");
    expect(rowRead).toBeGreaterThan(0);
    expect(notFound).toBeGreaterThan(rowRead);
    expect(use, "행을 못 읽은(볼 수 없는) 사람에게도 주소가 나간다").toBeGreaterThan(notFound);
    expect(src.slice(0, use)).toMatch(/if \(kind === "textbook" && thumb && Number\.isInteger\(width\)\) \{\s*try \{\s*const url = await $/);
    // 실패하면 예전처럼 그 자리에서 서명한다 — 표지가 깨지지 않게
    expect(src.slice(use)).toMatch(/catch \(e\) \{[\s\S]*?\}\s*\}\s*[\s\S]*?supabase\.storage\.from\(BUCKET\[kind\]\)\.createSignedUrl/);
  });

  it("표지 302 는 브라우저가 기억한다 (private) — 다른 파일은 그대로 no-store", () => {
    const src = read(ROUTE);
    expect(src).toContain('headers: { "Cache-Control": `private, max-age=${COVER_REDIRECT_MAX_AGE}` }');
    expect(src.match(/"Cache-Control": "private, no-store"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("/files 라우트의 로그인 확인은 getClaims — getUser 는 로그인 서버를 한 번 더 다녀온다", () => {
    const src = read(ROUTE);
    expect(src).toContain("supabase.auth.getClaims()");
    expect(src).not.toMatch(/auth\.getUser\(/);
  });

  it("stableCoverUrl 은 /files 라우트에서만 부른다 — 서비스 롤 서명이라 RLS 확인 없이 부르면 안 된다", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts") ? [p] : [];
      });
    const users = walk("src").filter((p) => p !== "src/lib/stable-signed-url.ts" && read(p).includes("stableCoverUrl("));
    expect(users).toEqual([ROUTE]);
  });

  it("학생 LC 음원 목록과 교재 화면은 같은 크기의 표지를 쓴다 — 목록에서 받은 그림을 교재 화면이 그대로 쓴다", () => {
    for (const p of ["src/app/my/lc-audio/page.tsx", "src/app/my/lc-audio/[bookId]/page.tsx"]) {
      const src = read(p);
      expect(src, p).toMatch(/coverSrc\(\w+, STUDENT_COVER_WIDTH\)/);
      expect(src, p).not.toMatch(/coverSrc\(\w+, \d+\)/);
    }
  });

  it("표지가 있으면 저장소 주소에 미리 연결한다", () => {
    expect(read("src/components/lc/BookCover.tsx")).toMatch(/if \(src && STORAGE_ORIGIN\) preconnect\(STORAGE_ORIGIN\);/);
  });
});
