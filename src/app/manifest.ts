import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "역전토익",
    short_name: "역전토익",
    description: "부산 서면 YBM어학원 역전토익 수강생 페이지",
    start_url: "/",
    display: "standalone",
    background_color: "#fff8fb",
    theme_color: "#ff2e88",
    lang: "ko",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
