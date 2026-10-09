import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * LC 교재 표지 — **같은 서명 주소를 하루 동안 다시 쓴다** (2026-10-09 Alan "Lc음원듣기에서도 교재 이미지 불러오는게 시간이 쫌 걸려").
 *
 * 표지는 비공개 버킷(lc-textbooks)이라 서명 주소로 보낸다. 그런데 Supabase 의 CDN(Smart CDN)은 **서명 토큰마다 캐시를 따로 둔다** —
 * "Smart CDN treats each unique token as a separate cache key … If you generate a new signed URL on every request, the cache will never be warm"
 * (Supabase 문서 Storage › CDN › Smart CDN). 예전에는 표지를 열 때마다 새 서명 주소를 만들어서 CDN 이 한 번도 먹지 않았고,
 * **볼 때마다 원본 사진을 처음부터 다시 줄였다**(이미지 변환). 302 도 no-store 라 브라우저도 기억하지 못했다.
 *
 * 그래서 (표지 경로 · 크기 · 하루 칸)마다 서명 주소 하나를 Next 데이터 캐시에 두고 모두가 그 주소를 쓴다 —
 * 원본을 줄이는 일은 하루에 한 번이고 나머지는 CDN 이 바로 준다. 같은 주소라 브라우저도 다시 받지 않는다.
 *  - 하루 칸은 **04:00 KST** 에 바뀐다 (사람이 거의 안 볼 때 새 주소로 넘어간다).
 *  - 서명은 48시간 — 칸 안 어느 때 건넨 주소도 24시간 넘게 산다. 브라우저는 302 를 12시간 기억한다 (`COVER_REDIRECT_MAX_AGE`).
 *  - **서비스 롤로 서명한다** — 캐시 안에서는 로그인 정보를 쓸 수 없다. 그래서 **부르는 쪽이 먼저 로그인한 사람의 세션으로 표지 행을 읽어(RLS)
 *    볼 수 있는지 확인**해야 한다 (`/files/textbook/{id}` 가 그렇게 한다). 경로는 그 행에서 읽은 값만 넘긴다 — 화면이 보낸 값을 넣지 말 것.
 *  - **표지만이다.** 숙제 사진 · 인증 사진처럼 학생 개인의 파일에 쓰지 말 것 — 오래 사는 주소를 개인 파일에 쓸지는 Alan 이 정할 일이다.
 *  - 변환 값(크기 맞춤 · 화질)을 바꾸면 캐시 키의 `v1` 을 올린다 — 안 올리면 하루 동안 옛 값의 주소가 나간다.
 */
const BUCKET = "lc-textbooks";
const HOUR = 60 * 60;

/** 하루 칸 길이(초) */
export const COVER_WINDOW_SECONDS = 24 * HOUR;
/** 칸이 바뀌는 때 — 04:00 KST = 19:00 UTC */
const WINDOW_START_UTC_HOUR = 19;
/** 서명 주소가 사는 시간(초) — 하루 칸 + 브라우저가 302 를 기억하는 시간보다 길어야 한다 (칸 처음에 만든 주소를 칸 끝에 건네도 산다) */
export const COVER_SIGNED_SECONDS = 48 * HOUR;
/** 브라우저가 표지 302 를 기억하는 시간(초) — 그동안은 같은 화면을 다시 열어도 표지를 받으러 가지 않는다 */
export const COVER_REDIRECT_MAX_AGE = 12 * HOUR;

/** 지금이 몇 번째 하루 칸인지 — 04:00 KST 마다 1 오른다 */
export function coverWindow(nowMs: number): number {
  return Math.floor((nowMs / 1000 - WINDOW_START_UTC_HOUR * HOUR) / COVER_WINDOW_SECONDS);
}

/** 표지 변환 값 — 예전 /files 라우트의 썸네일과 같다 */
export const coverTransform = (width: number) => ({ width, resize: "contain" as const, quality: 70 });

/**
 * 표지 서명 주소 — 같은 하루 칸 안에서는 누구에게나 같은 주소다.
 * **부르기 전에 그 표지 행이 보이는지(RLS) 확인했어야 한다** (머리말).
 * 서명에 실패하면 던진다 — 실패는 캐시에 남지 않는다 (남으면 하루 동안 표지가 깨진다).
 */
export async function stableCoverUrl(path: string, width: number): Promise<string> {
  const window = coverWindow(Date.now());
  return unstable_cache(
    async () => {
      const { data, error } = await createAdminClient()
        .storage.from(BUCKET)
        .createSignedUrl(path, COVER_SIGNED_SECONDS, { transform: coverTransform(width) });
      if (error || !data?.signedUrl) throw new Error(`표지 서명 실패: ${error?.message ?? "주소 없음"}`);
      return data.signedUrl;
    },
    ["lc-cover-url", "v1", BUCKET, path, String(width), String(window)],
    // 칸 안에서는 늘 새것으로 읽힌다 (칸보다 길게) — 칸이 바뀌면 키가 달라져 다시 읽지 않는다
    { revalidate: COVER_WINDOW_SECONDS + HOUR },
  )();
}
