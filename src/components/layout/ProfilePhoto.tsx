"use client";

import { useState } from "react";
import { EmptyAvatar } from "@/components/layout/EmptyAvatar";
import { cn } from "@/lib/utils";

/**
 * 프로필 사진 — **카카오·구글 로그인이면 그쪽 사진이 저절로 들어온다** (2026-09-22 Alan 요청).
 * 주소는 `profilePhotoUrl`(`src/lib/avatar.ts`) 한곳이 고르고,
 * 없으면 **빈 프로필 이미지**(`EmptyAvatar` — 회색 동그라미에 사람 실루엣)다.
 *
 * **지킬 것**
 * - 사진이 없을 때 **이름 첫 글자를 쓰지 않는다** (2026-09-22 Alan "첫글자 하지말고 비어있는 프로필 이미지").
 *   그래서 이 컴포넌트는 이름을 받지 않는다 — 받으면 언젠가 다시 글자로 되돌아간다.
 * - 받아 오지 못하면(카카오 CDN 404 · 주소 만료) `onError` 로 **빈 프로필 이미지로 되돌린다** —
 *   안 그러면 깨진 그림 아이콘이 남는다 (랜딩 유튜브 썸네일과 같은 규칙). 그래서 클라이언트 컴포넌트다.
 * - `next/image` 를 쓰지 않는다 — 외부 도메인을 태우면 Vercel 이미지 최적화에 과금되는데
 *   이미 작은 프로필 사진 한 장이라 얻을 게 없다 (수강후기 캡쳐와 같은 이유).
 * - **가로·세로를 CSS 로 못박는다** — Tailwind preflight 의 `img { height: auto }` 때문에
 *   flex 안에서 세로로 늘어난다 (`Icon`·`Symbol` 과 같은 처리).
 * - `referrerPolicy="no-referrer"` — 우리 주소를 카카오 CDN 에 흘리지 않는다.
 */
export function ProfilePhoto({ src, size = 56, className }: { src: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) return <EmptyAvatar size={size} className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-full border border-line bg-surface object-cover", className)}
    />
  );
}
