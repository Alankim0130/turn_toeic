import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 화면 전환 속도 (2026-10-09 Alan "지금 화면 전환이 좀 느린데, 이걸 빨리하려면 앱개발 밖에 없는거야?" →
 * "1,2,3번을 다 해야할것같은데") — 누르자마자 화면 틀 · 방금 본 화면 30초 기억 · 서버 쪽 줄이기.
 *
 * 소스를 읽어 그 결정을 못박는다 — 하나를 되돌려도 화면은 멀쩡해 보이고 **느려지기만** 해서 늦게 발견된다.
 * 자세한 까닭은 CLAUDE.md "화면 전환 속도".
 */
const read = (path: string) => readFileSync(path, "utf8");

describe("① 누르자마자 화면 틀 (loading.tsx)", () => {
  it.each([
    "src/app/my",
    "src/app/admin",
    "src/app/(public)",
    // 상세로 들어가는 부모 — 목록에서 상세로 갈 때도 틀이 뜨게
    "src/app/my/lc-audio",
    "src/app/my/materials",
    "src/app/my/attendance",
    "src/app/admin/sections",
    "src/app/admin/students",
    "src/app/admin/verifications",
    "src/app/admin/homework",
  ])("%s 에 빈 화면 틀(PageSkeleton)이 있다", (dir) => {
    const file = `${dir}/loading.tsx`;
    expect(existsSync(file), `${file} 가 없다 — 같은 구역 안에서 옮길 때 서버가 답할 때까지 화면이 멈춘다`).toBe(true);
    expect(read(file)).toContain("<PageSkeleton");
  });

  it("화면 틀은 '불러오는 중' 을 알리고 꽉 찬 색만 쓴다 (반투명 + 깜빡임을 시험용 브라우저가 하늘색으로 그렸다)", () => {
    const src = read("src/components/ui/PageSkeleton.tsx");
    expect(src).toContain('aria-busy="true"');
    expect(src).toContain("불러오는 중");
    expect(src).not.toMatch(/bg-brand-\d+\/\d+/);
  });

  it("하단 메뉴 · 서랍 · 관리자 메뉴는 누른 칸이 바로 켜진다 (useLinkStatus — 틀을 미리 못 받았을 때의 몫)", () => {
    expect(read("src/components/layout/NavPending.tsx")).toContain("useLinkStatus()");
    expect(read("src/components/layout/BottomNav.tsx")).toContain("<NavTabIcon");
    expect(read("src/components/admin/AdminBottomNav.tsx")).toContain("<NavTabIcon");
    expect(read("src/components/layout/MobileMenu.tsx")).toContain("<NavPendingRing");
    expect(read("src/components/admin/AdminNav.tsx").match(/<NavPendingRing/g)).toHaveLength(2);
  });
});

describe("② 방금 본 화면 30초 기억", () => {
  it("next.config 의 staleTimes.dynamic 이 30초다 — 늘리면 다른 사람이 바꾼 것(불라방 링크 · 알림)이 그만큼 늦게 보인다", () => {
    expect(read("next.config.ts")).toMatch(/staleTimes:\s*\{\s*dynamic:\s*30\s*\}/);
  });
});

describe("③ 서버 쪽 — 로그인 확인과 차례로 묻기 줄이기", () => {
  it("proxy 는 getClaims 로 확인한다 — getUser 로 되돌리면 요청마다(미리 받기까지) 로그인 서버를 다녀온다", () => {
    const src = read("src/lib/supabase/proxy.ts");
    expect(src).toContain("supabase.auth.getClaims()");
    expect(src).not.toMatch(/supabase\.auth\.getUser\(/);
  });

  it("화면의 로그인 확인도 getClaims 한 번 (getSessionUser) — getUser 는 토큰에 없는 마지막 로그인 시각(getLastSignInAt) 하나뿐", () => {
    const src = read("src/lib/auth.ts");
    expect(src).toMatch(/export const getSessionUser = cache\(async \(\)[\s\S]*?auth\.getClaims\(\)/);
    expect(src).toMatch(/export const getSessionProfile = cache\(async \(\) => \{\s*const user = await getSessionUser\(\);/);
    // 머리말(주석)의 `auth.getUser()` 는 세지 않는다 — 부르는 곳만
    expect(src.match(/supabase\.auth\.getUser\(/g)).toHaveLength(1);
    expect(src).toMatch(/export const getLastSignInAt = cache\(async \(\) => \{[\s\S]*?auth\.getUser\(\)/);
  });

  it("수강생전용 판정은 프로필과 등록을 동시에 묻는다", () => {
    const src = read("src/lib/auth.ts");
    const block = src.slice(src.indexOf("export const getStudentAccess"));
    expect(block).toMatch(/Promise\.all\(\[\s*getSessionProfile\(\),\s*supabase\.from\("enrollment_orders"\)/);
  });

  it("학생 조회 함수는 프로필을 기다리지 않는다 — 내 id 만 필요하다 (getSessionUser)", () => {
    expect(read("src/app/my/_lib/queries.ts")).not.toContain("getSessionProfile");
  });

  it.each([
    "src/app/my/live/page.tsx",
    "src/app/my/lc-audio/page.tsx",
    "src/app/my/lc-audio/[bookId]/page.tsx",
    "src/app/my/replay/page.tsx",
    "src/app/my/materials/page.tsx",
    "src/app/my/materials/notices/[id]/page.tsx",
    "src/app/my/study/page.tsx",
    "src/app/my/lecture/page.tsx",
    "src/app/my/textbook/page.tsx",
  ])("%s 는 잠금 판정과 데이터를 함께 받는다 (loadGated)", (file) => {
    const src = read(file);
    expect(src).toContain("loadGated(");
    expect(src, "studentGate 를 먼저 기다린 뒤 데이터를 물으면 서버를 한 번 더 다녀온다").not.toContain("await studentGate(");
  });
});

/**
 * ④ 조회 정책은 "스태프(조교)인가" 를 맨 앞에 (2026-10-09 Alan "숙제미제출 알림 페이지를 클릭하면 로딩시간이 오래걸려", 마이그레이션 20261009100000).
 * 수업일 표의 조회 정책이 행마다 `private.has_section_access(…)` 같은 함수를 먼저 부르고 맨 끝에서야 `is_crew()` 를 물어,
 * 강사 · 관리자 · 조교가 한 달 수업일(353줄)을 읽는 데 0.85초가 갔다 (운영 크기 재생 DB). `(select private.is_crew())` 는 요청마다 한 번만
 * 계산되니 맨 앞에 두면 스태프는 행마다의 함수를 건너뛴다. OR 의 순서만 다르고 누가 무엇을 보는지는 같다.
 * 허용 정책끼리 합치는 순서는 Postgres 가 정해서, 정책마다 따로 지킨다.
 */
describe("④ 조회 정책 — 스태프 확인이 행마다의 접근 함수보다 앞", () => {
  const DIR = "supabase/migrations";
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const sqlOf = (f: string) =>
    readFileSync(join(DIR, f), "utf8")
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n");
  // 마이그레이션을 순서대로 재생한 마지막 정책 — `create policy "…"` 와 `on 표` 가 두 줄로 갈린 것도 읽는다
  const live = new Map<string, string>();
  for (const f of files) {
    for (const [, verb, name, table, body] of sqlOf(f).matchAll(/(create|drop) policy (?:if exists )?"([^"]+)"\s+on\s+([\w.]+)([^;]*);/g)) {
      const key = `${table} :: ${name}`;
      if (verb === "create") live.set(key, body.replace(/\s+/g, " "));
      else live.delete(key);
    }
  }
  const reads = [...live].filter(([, b]) => !/\bfor (insert|update|delete)\b/.test(b));

  it("수업일 두 정책 · 상시 불라방 링크 — using 의 첫 갈래가 스태프(조교) 확인이다", () => {
    for (const [key, staff] of [
      ["public.session_dates :: session_dates: 수강생·스태프·조교 조회", "is_crew"],
      ["public.session_dates :: session_dates: 예비등록생 내 반 일정 조회", "is_crew"],
      ["public.section_live_links :: live_links: 수강생·스태프 조회", "is_staff"],
    ]) {
      expect(live.get(key), key).toMatch(new RegExp(`using \\( ?\\(select private\\.${staff}\\(\\)\\)`));
    }
  });

  it("행마다 부르는 접근 함수(private.has_*)가 있는 조회 정책은 스태프 확인을 그보다 앞에 둔다", () => {
    const late = reads
      .filter(([, b]) => {
        const staff = b.search(/private\.is_(crew|staff|admin)\(\)/);
        const perRow = b.search(/private\.has_\w+\(/);
        return staff >= 0 && perRow >= 0 && perRow < staff;
      })
      .map(([k]) => k);
    expect(late, `스태프 확인이 뒤에 있다 — 강사 · 관리자 · 조교가 읽을 때 행마다 함수가 돈다:\n${late.join("\n")}`).toEqual([]);
  });
});
