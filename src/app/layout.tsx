import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import { TestModeBanner } from "@/components/layout/TestModeBanner";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { PullToRefresh } from "@/components/pwa/PullToRefresh";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ff2e88",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ user, profile }, access] = await Promise.all([getSessionProfile(), getStudentAccess()]);

  return (
    <html lang="ko">
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
      </body>
    </html>
  );
}
