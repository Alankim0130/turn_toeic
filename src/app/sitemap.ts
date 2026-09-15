import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * 공개 라우트만 등록한다. 새 공개 페이지를 추가하면 여기에도 추가할 것.
 * (/my, /admin 은 로그인 전용이라 제외)
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${site.url}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${site.url}/study`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${site.url}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${site.url}/signup`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${site.url}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
