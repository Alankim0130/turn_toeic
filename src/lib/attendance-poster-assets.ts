import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ImageAsset, PosterAssets } from "./attendance-poster-pdf";
import { site } from "./site";

/**
 * 포스터 PDF 에 넣는 글꼴·그림을 읽는다 (2026-09-22). 서버에서만 부른다 — `/admin/attendance/poster/download`.
 *
 * - 그림은 `public/` 의 원본(강사 컷 1.3MB · 힉스필드 webp)을 **인쇄에 맞는 크기로 줄여** 넣는다
 *   (A5 에 50mm 폭이면 300dpi 에 600px 로 충분하다). PDF 는 webp 를 못 담는다.
 *   강사 사진은 **흰 바탕을 채운 JPEG** 다 — 투명 PNG 로 두면 두 장에 2.6MB 인데 JPEG 는 0.2MB 다.
 *   사진 자리는 포스터의 흰 바탕이고 그 위로 겹치는 것(안내 상자·이름표)은 사진 뒤에 그리므로 흰 네모가 드러나지 않는다.
 * - Vercel 함수에는 `public/` 이 따라가지 않는다 — `next.config.ts` 의 `outputFileTracingIncludes` 에 이 파일들을 적어 두었다.
 *   여기서 읽는 파일을 바꾸면 거기도 고친다.
 * - 한 번 읽으면 서버 인스턴스가 살아 있는 동안 다시 쓴다 (새로 만들기마다 줄이지 않게).
 */

/** 추적기가 이 경로를 따라가면 `public/` 을 통째로(스플래시 영상까지) 함수에 싣는다 — 읽는 파일은 next.config 에 따로 적었으므로 무시시킨다 */
const at = (...p: string[]) => path.join(/*turbopackIgnore: true*/ process.cwd(), ...p);

async function image(rel: string, width: number, photo = false): Promise<ImageAsset> {
  const src = sharp(await readFile(at("public", rel))).resize({ width, withoutEnlargement: true });
  const { data, info } = await (photo
    ? src.flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true })
    : src.png({ palette: true, quality: 95, compressionLevel: 9 })
  ).toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), kind: photo ? "jpg" : "png", width: info.width, height: info.height };
}

async function load(): Promise<PosterAssets> {
  const font = (w: string) => readFile(at("assets/poster-fonts", `poster-${w}.ttf`)).then((b) => new Uint8Array(b));
  const [black, bold, semibold, logo, symbol, phone, stamp, people] = await Promise.all([
    font("black"),
    font("bold"),
    font("semibold"),
    image("brand/logo.png", 620),
    image("brand/symbol.png", 256),
    image("posters/attendance-phone.webp", 480),
    image("posters/attendance-stamp.webp", 480),
    Promise.all(
      site.instructors.slice(0, 2).map(async (i) => ({ name: i.name, part: i.part, photo: await image(i.casual[0].src.replace(/^\//, ""), 600, true) })),
    ),
  ]);
  return { fonts: { black, bold, semibold }, logo, symbol, phone, stamp, people };
}

let cached: Promise<PosterAssets> | null = null;

export function loadPosterAssets(): Promise<PosterAssets> {
  cached ??= load().catch((e) => {
    cached = null; // 실패는 붙잡아 두지 않는다 — 다음 요청에서 다시 읽는다
    throw e;
  });
  return cached;
}
