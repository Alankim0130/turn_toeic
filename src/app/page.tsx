import type { Metadata } from "next";
import { Suspense } from "react";
import { Hero } from "@/components/landing/Hero";
import { Marquee } from "@/components/landing/Marquee";
import { Stats } from "@/components/landing/Stats";
import { Features } from "@/components/landing/Features";
import { Curriculum } from "@/components/landing/Curriculum";
import { Mode } from "@/components/landing/Mode";
import { Instructors } from "@/components/landing/Instructors";
import { Schedule } from "@/components/landing/Schedule";
import { CTA } from "@/components/landing/CTA";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: site.fullName,
  description: site.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: site.fullName,
    description: site.description,
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "역전토익" }],
  },
};

function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "역전토익",
    alternateName: "역전토익 부산 서면 YBM어학원",
    url: site.url,
    logo: `${site.url}/brand/logo.png`,
    image: `${site.url}/og.png`,
    description: site.description,
    parentOrganization: { "@type": "Organization", name: site.academy.name, url: site.academy.ybmUrl },
    address: { "@type": "PostalAddress", addressLocality: "부산진구", addressRegion: "부산광역시", addressCountry: "KR" },
    employee: site.instructors.map((t) => ({ "@type": "Person", name: t.name, jobTitle: `토익 ${t.part} 강사` })),
    offers: [650, 750, 850].map((score) => ({
      "@type": "Course",
      name: `역전토익 ${score} 목표반`,
      description: `토익 ${score}점 목표 종합반. 현장 강의 및 불라방 실시간 라이브.`,
      provider: { "@type": "Organization", name: "역전토익" },
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export default function HomePage() {
  return (
    <>
      <JsonLd />
      <Hero />
      <Marquee />
      <Stats />
      <Features />
      <Curriculum />
      <Mode />
      <Instructors />
      <Suspense fallback={<div className="container-x py-20"><div className="h-40 rounded-xl2 bg-brand-50 shimmer-bar" /></div>}>
        <Schedule />
      </Suspense>
      <CTA />
    </>
  );
}
