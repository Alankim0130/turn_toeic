import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_HTML_ATTRIBUTE, APP_USER_AGENT_MARK, appFileName, isAppUserAgent, isNativeApp } from "@/lib/native-app";

/**
 * 아이폰 앱 (2026-10-30 Alan — "같은 사이트, 앱에서만 켜기"). 앱은 웹사이트를 띄우는 껍데기라 **앱에서만 다른 것은 앱 표시로만 가른다** —
 * 웹 · 홈 화면 앱 학생에게는 아무것도 바뀌지 않아야 한다. 앱 쪽 값(mobile/)과 웹 쪽 값이 같은지 여기서 본다.
 */
const read = (f: string) => fs.readFileSync(f, "utf8");
const capacitor = JSON.parse(read("mobile/capacitor.config.json")) as {
  appId: string;
  server: { url: string; appStartPath: string; errorPath: string };
  ios: { appendUserAgent: string };
};
const swift = read("mobile/ios/App/App/WinnerToeicPlugin.swift");

describe("앱 표시 — 사용자 에이전트", () => {
  it("앱이 붙이는 표시와 서버가 찾는 표시가 같다", () => {
    expect(capacitor.ios.appendUserAgent.startsWith(APP_USER_AGENT_MARK)).toBe(true);
    expect(isAppUserAgent(`Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ${capacitor.ios.appendUserAgent}`)).toBe(true);
  });

  it("사파리 · 크롬 · 홈 화면 앱은 앱이 아니다 · 서버에서는 늘 거짓", () => {
    expect(isAppUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isAppUserAgent(null)).toBe(false);
    expect(isNativeApp()).toBe(false);
  });

  it("루트 레이아웃이 앱일 때만 <html> 에 표시를 단다 · CSS 가 그 표시로만 숨긴다", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("isAppRequest()");
    expect(layout).toContain("{...(inApp ? { [APP_HTML_ATTRIBUTE]: \"ios\" } : {})}");
    expect(read("src/app/globals.css")).toContain(`[${APP_HTML_ATTRIBUTE}] .hide-in-app { display: none !important; }`);
  });
});

describe("앱 밖 결제로 이끄는 것은 앱에서 숨긴다 (App Store 심사 3.1.1)", () => {
  const HIDDEN: Record<string, string> = {
    "src/components/landing/CTA.tsx": "CTA 배너의 YBM 수강 신청 버튼과 문구",
    "src/components/layout/Footer.tsx": "푸터의 '수강 신청과 결제는 YBM' 줄",
    "src/app/(public)/contact/inquiry/page.tsx": "문의 화면의 YBM 수강 신청 링크",
    "src/app/(public)/student/page.tsx": "수강생전용 안내의 YBM 바로가기",
    "src/components/landing/Stats.tsx": "YBM 강좌 페이지(후기 탭) 링크",
    "src/components/landing/Reviews.tsx": "YBM 후기 탭 링크",
  };
  it.each(Object.entries(HIDDEN))("%s — %s", (file) => {
    expect(read(file)).toContain("hide-in-app");
  });

  it("YBM 강좌 · 수강 신청 페이지(ybmUrl · ybmReviewUrl)로 가는 링크는 모두 hide-in-app 이다", () => {
    const files = [...HIDDEN_FILES()];
    const bare: string[] = [];
    for (const f of files) {
      for (const m of read(f).matchAll(/<a\b[^>]*href=\{site\.academy\.(ybmUrl|ybmReviewUrl)\}[^>]*>/g)) {
        if (!m[0].includes("hide-in-app") && !insideHidden(read(f), m.index ?? 0)) bare.push(`${f}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(bare, `앱에서 숨기지 않은 YBM 결제 쪽 링크:\n${bare.join("\n")}`).toEqual([]);
  });

  it("수강생전용 안내는 앱에서 'YBM 에서 수강 신청' 단계를 뺀다 · 마이페이지 빈 화면 문구도", () => {
    expect(read("src/app/(public)/student/page.tsx")).toContain("UNLOCK_STEPS.filter((s) => !(inApp && s.webOnly))");
    expect(read("src/app/my/page.tsx")).toContain('inApp ? "수강증을 올리면 수강생으로 자동 등업됩니다."');
  });
});

/** 화면 파일 중 YBM 강좌 페이지 주소를 쓰는 곳 */
function* HIDDEN_FILES(): Generator<string> {
  const walk = function* (dir: string): Generator<string> {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) yield* walk(p);
      else if (p.endsWith(".tsx") && !p.includes("/admin/")) yield p;
    }
  };
  for (const f of [...walk("src/app"), ...walk("src/components")]) if (/site\.academy\.(ybmUrl|ybmReviewUrl)\}/.test(read(f))) yield f;
}

/** 링크가 hide-in-app 로 감싼 문단 안에 있나 (푸터처럼 문단째 숨긴 곳) */
function insideHidden(src: string, at: number): boolean {
  const before = src.slice(Math.max(0, at - 400), at);
  const open = before.lastIndexOf('className="hide-in-app');
  return open >= 0 && !before.slice(open).includes("</p>");
}

describe("앱 쪽 설정과 같은 값", () => {
  it("띄우는 주소는 우리 사이트의 /my · 끊기면 offline.html", () => {
    expect(capacitor.server.url).toBe("https://winnertoeic.com");
    expect(capacitor.server.appStartPath).toBe("/my");
    expect(fs.existsSync(`mobile/www/${capacitor.server.errorPath}`)).toBe(true);
    expect(read(`mobile/www/${capacitor.server.errorPath}`)).toContain(`"${capacitor.server.url}${capacitor.server.appStartPath}"`);
  });

  it("앱 화면이 여는 주소는 호스트가 정확히 우리 사이트일 때만 — 그 밖은 사파리 (앞부분만 견주면 winnertoeic.com.evil 이 통과한다)", () => {
    expect(swift).toContain(`private let appHost = "${new URL(capacitor.server.url).host}"`);
    expect(swift).toContain('if host == appHost && scheme == "https" {');
    expect(swift).toContain("UIApplication.shared.open(url");
  });

  it("번들 ID 가 세 곳에서 같다 — Xcode · capacitor.config · 서버의 기본값(앱 알림 주제 · 앱 Apple 로그인)", () => {
    const pbx = read("mobile/ios/App/App.xcodeproj/project.pbxproj");
    const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([\w.]+);/g)].map((m) => m[1]);
    expect(new Set(ids)).toEqual(new Set([capacitor.appId]));
    expect(read("src/lib/apple-key.ts")).toContain(`|| "${capacitor.appId}"`);
  });

  it("권한 문구는 한국어로 다 있다 · 암호화 신고는 '아니요' · 알림 · Apple 로그인 권한", () => {
    const plist = read("mobile/ios/App/App/Info.plist");
    for (const key of ["NSCameraUsageDescription", "NSMicrophoneUsageDescription", "NSPhotoLibraryUsageDescription"]) {
      expect(plist).toMatch(new RegExp(`<key>${key}</key>\\s*<string>[^<]*[가-힣][^<]*</string>`));
    }
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    const ent = read("mobile/ios/App/App/App.entitlements");
    expect(ent).toContain("<key>aps-environment</key>");
    expect(ent).toContain("<key>com.apple.developer.applesignin</key>");
  });

  it("앱 폴더는 웹 빌드 · 타입 검사 · 린트에서 빠진다", () => {
    expect(read(".vercelignore")).toContain("/mobile/");
    expect(JSON.parse(read("tsconfig.json")).exclude).toContain("mobile");
    expect(read("eslint.config.mjs")).toContain('"mobile/**"');
  });
});

describe("앱에서 파일 받기", () => {
  it("임시 폴더에 둘 이름 — 못 쓰는 글자를 지운다", () => {
    expect(appFileName("역전토익_반별명단_2026-10.pdf")).toBe("역전토익_반별명단_2026-10.pdf");
    expect(appFileName('a/b\\c:*?"<>|.pdf')).toBe("abc.pdf");
    expect(appFileName("   ")).toBe("download");
  });
});
