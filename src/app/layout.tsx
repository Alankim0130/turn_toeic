import type { Metadata, Viewport } from "next";
import { BASE_VIEWPORT } from "@/lib/theme-color";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import { TestModeBanner } from "@/components/layout/TestModeBanner";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { PullToRefresh } from "@/components/pwa/PullToRefresh";
import { VisibleViewportVars } from "@/components/layout/VisibleViewportVars";
import { NativeAppBridge } from "@/components/native/NativeAppBridge";
import { APP_HTML_ATTRIBUTE } from "@/lib/native-app";
import { isAppRequest } from "@/lib/native-app-server";
import { AppSplash } from "@/components/pwa/AppSplash";
import { IOS_STARTUP_IMAGES } from "@/lib/ios-startup";
import { getSessionProfile, getStudentAccess } from "@/lib/auth";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.fullName,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  keywords: [...site.keywords],
  applicationName: site.name,
  // startupImage: 홈 화면 앱을 켤 때 iOS 가 보여 주는 첫 화면 (핑크 + 흰 화살표, 스플래시 영상 첫 장면과 동일)
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default", startupImage: [...IOS_STARTUP_IMAGES] },
  authors: [{ name: site.name }],
  creator: site.name,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: site.name,
    title: site.fullName,
    description: site.description,
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "역전토익" }],
  },
  twitter: {
    card: "summary_large_image",
    title: site.fullName,
    description: site.description,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  /**
   * 검색엔진 소유 확인 (2026-09-20 Alan). **코드가 아니라 Vercel 환경변수로 넣는다** — 값이 비면
   * 태그를 아예 그리지 않는다 (**빈 `content` 를 남기면 확인이 실패한다**). 환경변수를 바꾸면 다시 배포해야 반영된다.
   *
   * - `GOOGLE_SITE_VERIFICATION` — 구글 서치 콘솔. **DNS TXT 로 확인했으면 필요 없다** (2026-09-20 그 길로 갔다).
   * - `NAVER_SITE_VERIFICATION` — 네이버 서치어드바이저. 네이버는 DNS 방식이 없어 **이 태그가 유일한 길**이다
   *   (다른 하나는 `public/` 에 확인용 HTML 파일을 두는 것인데, 코드에 남는 파일보다 환경변수가 깔끔하다).
   *
   * 자세한 절차는 CLAUDE.md 미확정 7.
   */
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    // `other` 는 값이 있을 때만 키를 만든다 — 빈 값으로 키를 남기면 `content=""` 가 나갈 수 있다
    ...(process.env.NAVER_SITE_VERIFICATION
      ? { other: { "naver-site-verification": process.env.NAVER_SITE_VERIFICATION } }
      : {}),
  },
  formatDetection: { telephone: true },
};

// 상태 표시줄 · 브라우저 색은 모드마다 다르다 — 관리자 레이아웃이 ADMIN_VIEWPORT 로 덮는다 (src/lib/theme-color.ts)
export const viewport: Viewport = BASE_VIEWPORT;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ user, profile }, access, inApp] = await Promise.all([getSessionProfile(), getStudentAccess(), isAppRequest()]);

  return (
    // 아이폰 앱(mobile/)에서 열렸으면 표시를 단다 — CSS `.hide-in-app` 이 앱에서만 숨긴다 (src/lib/native-app.ts).
    // 이 레이아웃은 로그인 쿠키를 읽어 원래 요청마다 그리므로 사용자 에이전트를 읽어도 미리 만들던 화면이 바뀌지 않는다
    <html lang="ko" {...(inApp ? { [APP_HTML_ATTRIBUTE]: "ios" } : {})}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-dvh">
        {/* 홈 화면 앱으로 켤 때만 보이는 첫 화면. DOM 맨 앞에 두어 하이드레이션 전에도 먼저 그려진다 */}
        <AppSplash />
        {/* 홈 화면 앱에는 주소창이 없다 — 맨 위에서 당기면 새로고침 (2026-09-16 Alan) */}
        <PullToRefresh />
        <TestModeBanner profile={profile} />
        <SiteHeader profile={profile} signedIn={!!user} access={access} />
        <main className="has-bottom-nav min-h-[70vh]">{children}</main>
        <Footer />
        <BottomNav access={{ active: access.active, enrollee: access.enrollee }} />
        <PwaRegister />
        {/* 아이폰 홈 화면 앱에서 키보드를 닫은 뒤 화면이 짧게 남을 때 막대 · 머리줄 · 팝업을 보이는 화면에 맞춘다 (2026-10-22, src/lib/bottom-nav.ts) */}
        <VisibleViewportVars />
        {/* 아이폰 앱에서만 — 시작 화면 걷기 · 상태 표시줄 색 · 알림을 누르면 그 화면으로 (웹에서는 아무것도 하지 않는다) */}
        <NativeAppBridge />
      </body>
    </html>
  );
}
