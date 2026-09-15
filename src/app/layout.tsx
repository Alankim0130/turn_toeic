import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
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
        <SiteHeader profile={profile} signedIn={!!user} access={access} />
        <main className="has-bottom-nav min-h-[70vh]">{children}</main>
        <Footer />
        <BottomNav access={{ active: access.active, enrollee: access.enrollee }} />
      </body>
    </html>
  );
}
