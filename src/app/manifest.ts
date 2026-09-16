import type { MetadataRoute } from "next";
import { STUDENT_FEATURES } from "@/lib/site";

/** 앱 아이콘을 길게 눌렀을 때 뜨는 바로가기 (안드로이드는 앞의 4개 정도만 보여 준다) */
const SHORTCUT_KEYS = ["live", "replay", "homework", "lc-audio"] as const;

/**
 * 홈 화면에 추가하면 주소창 없는 앱(standalone)으로 열린다.
 * 설치한 사람은 대부분 수강생이라 마이페이지에서 시작한다 — 로그인 전이면 proxy 가 로그인 화면으로 보냈다가 돌아온다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "역전토익",
    short_name: "역전토익",
    description: "부산 서면 YBM어학원 역전토익 수강생 페이지. 불라방·다시보기·숙제업로드·LC음원을 앱처럼.",
    start_url: "/my",
    scope: "/",
    display: "standalone",
    background_color: "#fff8fb",
    theme_color: "#ff2e88",
    lang: "ko",
    dir: "ltr",
    categories: ["education"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: SHORTCUT_KEYS.flatMap((key) => {
      const f = STUDENT_FEATURES.find((x) => x.key === key);
      return f ? [{ name: f.label, short_name: f.label, url: f.href, icons: [{ src: `/icons/${f.icon}.png`, sizes: "256x256", type: "image/png" }] }] : [];
    }),
  };
}
