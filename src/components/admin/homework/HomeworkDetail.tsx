"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { HomeworkCheckForm } from "@/components/admin/homework/HomeworkCheckForm";
import { HomeworkPhotos } from "@/components/admin/homework/HomeworkPhotos";
import type { HomeworkRow } from "@/components/admin/homework/HomeworkList";
import { Icon } from "@/components/ui/Icon";

/**
 * 숙제 한 건 — **목록에서 줄을 누르면 열리는 상세 팝업** (2026-09-22 Alan 요청:
 * "학생제출 내역을 보면, 다 펼쳐져서 나오는데, 이렇게 하지말고 첫토익처럼 저렇게 보이고
 * 학생카드를 클릭하면 숙제이미지가 나와서 확인할 수 있도록 하자").
 *
 * 그전에는 카드마다 사진·질문·점검 칸이 **전부 펼쳐져** 있어 한 화면에 두세 건밖에 안 들어왔다.
 * 지금은 목록이 한 줄짜리 카드이고, 누르면 여기서 **사진 → 질문 → 코멘트 · 점검완료**를 한 번에 끝낸다.
 *
 * **점검완료 버튼은 여기 한곳뿐이다** — 목록 줄에는 없다 (같은 일을 두 군데서 하지 않는다).
 * 점검을 보내면 팝업을 닫는다 — 목록에서 그 줄이 빠지는 것이 곧 확인이고, 다음 건으로 바로 넘어간다.
 * 점검 취소는 닫지 않는다 (되돌린 결과를 그 자리에서 봐야 한다).
 * ESC · 배경 · 닫기로 닫고, 열려 있는 동안 뒤 화면 스크롤을 막는다 (수강후기 팝업과 같은 규칙).
 */
export function HomeworkDetail({ row, onClose }: { row: HomeworkRow; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // createPortal 은 document 가 있어야 한다 (Reviews 의 Lightbox 와 같은 방법)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // 뒤 화면이 같이 움직이면 어지럽다
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-5">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-ink/70 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${row.name} 숙제`}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-paper shadow-pink sm:max-h-[90vh] sm:rounded-xl2"
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <b className="text-base font-black text-ink">{row.name}</b>
              {row.label && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-black text-white">{row.label}</span>}
              {row.checked && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">점검완료</span>}
            </p>
            <p className="mt-0.5 text-xs text-mist">
              {row.meta}
              {row.phone && (
                <>
                  {" · "}
                  <a href={`tel:${row.phone}`} className="text-ink-soft underline decoration-brand-200 hover:text-brand-600">
                    {row.phone}
                  </a>
                </>
              )}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink-soft transition hover:bg-brand-50 hover:text-brand-600"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current stroke-[2.5]">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <HomeworkPhotos photos={row.photos} student={row.name} />

          {row.question && (
            <div className="mt-4 rounded-xl2 border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm">
              <p className="text-xs font-bold text-brand-700">학생 질문</p>
              <p className="whitespace-pre-line text-ink">{row.question}</p>
            </div>
          )}

          {row.files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {row.files.map((f) => (
                <li key={f.id}>
                  <a
                    href={`/files/homework/${f.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:border-brand-300"
                  >
                    <Icon name="camera" size={18} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{f.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {/* 코멘트·질문 답변을 적고 점검완료하면 학생 알림함으로 간다 */}
          <HomeworkCheckForm id={row.id} checked={row.checked} question={row.question} feedback={row.feedback} onChecked={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
