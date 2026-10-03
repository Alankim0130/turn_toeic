"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ProfilePhoto } from "@/components/layout/ProfilePhoto";
import { cn } from "@/lib/utils";

/**
 * 프로필 사진 — 누르면 크게 (2026-10-02 Alan — "강사는 프로필 사진을 클릭했을 때 큰 화면으로").
 * **강사·관리자 화면에서만 쓴다.** 학생(/my)은 `ProfilePhoto` 그대로 — 눌리지 않는다 (조교는 2026-10-03 부터 명단 자체를 못 본다).
 * 사진이 없으면 버튼도 없다 (빈 프로필 이미지만).
 */
export function PhotoLightbox({ src, size = 56, name, className }: { src: string | null; size?: number; name?: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return <ProfilePhoto src={null} size={size} className={className} />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="프로필 사진 크게 보기"
        // 명단 카드는 링크가 카드 전체를 덮는다 — 그 위에 올려야 눌린다
        className="relative z-10 shrink-0 rounded-full transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
      >
        <ProfilePhoto src={src} size={size} className={cn("cursor-zoom-in", className)} />
      </button>
      {open && (
        <Dialog open title={name ? `${name} 님 프로필 사진` : "프로필 사진"} onClose={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" referrerPolicy="no-referrer" className="mx-auto max-h-[70vh] w-auto max-w-full rounded-2xl object-contain" />
          <div className="mt-4 text-right">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary !py-2 text-sm">닫기</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
