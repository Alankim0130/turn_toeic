import { existsSync, readFileSync } from "node:fs";
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
