"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PhotoViewer, type ViewerPhoto } from "@/components/admin/PhotoViewer";
import { CheckinCheckForm } from "@/components/admin/study-checkins/CheckinCheckForm";
import { cn } from "@/lib/utils";

/** 게시판 한 줄 — **글자는 서버가 다 만들어서 넘긴다** (날짜·건수 문구를 클라이언트에서 다시 짓지 않는다) */
export type CheckinRow = {
  id: number;
  name: string;
  /** 그 달에 듣는 반 — 주5일은 한 줄, 달은 뺀다 (스터디 신청자 인증 표와 같은 값) */
  classes: string[];
  /** 줄 둘째 칸: `650+ · 주5일 10:00~12:10 · 사진 3장 · 메모` */
  sub: string;
  /** 줄 오른쪽: 인증한 시각 `10/12 21:04` */
  at: string;
  /** 팝업 머리글 한 줄 (회차 · 날짜 · 인증 시각 · 확인 정보까지) */
  meta: string;
  checked: boolean;
  /** 학생이 인증하며 남긴 메모 (300자) */
  note: string | null;
  feedback: string | null;
  photos: ViewerPhoto[];
};

/** 자료(회차 · 날짜) 하나의 묶음 — 최근 날짜가 위 */
export type CheckinGroup = { key: number; title: string; counts: string; rows: CheckinRow[] };

/**
 * **비대면스터디 인증 게시판** (2026-10-08 Alan — "비대면 스터디도 숙제 점검 처럼 게시판이 필요합니당~ "비대면스터디 인증" 카테고리 하나 만들어줘.
 * 별도의 페이지가 있으면 좋겠어"). 숙제점검(`HomeworkList`)처럼 **한 건이 한 줄이고 누르면 상세 팝업**이 열린다 —
 * 사진을 넘겨 보고 학생 메모를 읽고 확인 완료(+ 코멘트)한다. 숙제와는 표 · 화면 · 알림이 따로다 (2026-09-19 Alan "철저하게 분리").
 *
 * 숙제점검과 다른 점 하나 — **자료 날짜(회차)로 묶는다**. 비대면 인증은 수업일마다 하루 한 건이라, 날짜를 빼고 쌓으면 어느 날 것인지 줄마다 읽어야 한다.
 * 모양은 학생명단 카드 · 숙제점검 줄과 같다 — 둥근 네모 아바타 · 이름 + 작은 배지 · 회색 한 줄 · 오른쪽 꺾쇠.
 * **정보를 알약(테두리 있는 상자)에 담지 말 것** — 줄이 쌓이면 상자만 보이고 값이 안 읽힌다.
 */
export function CheckinBoard({ groups }: { groups: CheckinGroup[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = groups.flatMap((g) => g.rows).find((r) => r.id === openId) ?? null;

  return (
    <>
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`ck-group-${g.key}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 id={`ck-group-${g.key}`} className="text-base font-black text-ink">
                {g.title}
              </h2>
              <p className="text-xs font-bold text-slate tabular-nums">{g.counts}</p>
            </div>
            <ul className="grid gap-2 lg:grid-cols-2">
              {g.rows.map((r) => (
                <li key={r.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setOpenId(r.id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-3 rounded-2xl border bg-paper p-3 text-left transition hover:border-brand-200 hover:bg-brand-50/30",
                      r.checked ? "border-brand-200" : "border-line",
                    )}
                  >
                    <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-lg font-black leading-none text-brand-700">
                      {r.name.trim().charAt(0) || "·"}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <b className="text-[15px] font-black text-ink">{r.name}</b>
                        {r.checked && <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">확인 완료</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-mist">{r.sub}</span>
                    </span>

                    <span className="shrink-0 text-xs font-bold text-mist tabular-nums">{r.at}</span>
                    <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-none stroke-mist stroke-[2.5]">
                      <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {open && <CheckinDetail row={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

/**
 * 인증 한 건 — 줄을 누르면 열리는 상세 팝업. **사진 → 학생 메모 → 코멘트 · 확인 완료**를 한 자리에서 끝낸다 (숙제점검 `HomeworkDetail` 과 같은 순서).
 * 확인을 보내면 팝업을 닫는다 — 목록에서 그 줄이 빠지는 것이 곧 확인이고 다음 건으로 바로 넘어간다. 확인 취소는 닫지 않는다.
 * ESC · 배경 · 닫기로 닫고, 열려 있는 동안 뒤 화면 스크롤을 막는다.
 */
function CheckinDetail({ row, onClose }: { row: CheckinRow; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // createPortal 은 document 가 있어야 한다 (HomeworkDetail 과 같은 방법)
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
        aria-label={`${row.name} 비대면 스터디 인증`}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-paper shadow-pink sm:max-h-[90vh] sm:rounded-xl2"
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <b className="text-base font-black text-ink">{row.name}</b>
              {row.checked && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">확인 완료</span>}
            </p>
            {row.classes.length > 0 && <p className="mt-0.5 text-xs font-semibold text-slate">{row.classes.join(" · ")}</p>}
            <p className="mt-0.5 text-xs text-mist">{row.meta}</p>
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
          {row.photos.length > 0 ? (
            <PhotoViewer photos={row.photos} student={row.name} fileBase="/files/checkin" />
          ) : (
            <p className="rounded-xl2 bg-surface px-4 py-6 text-center text-sm text-mist">올린 사진이 없어요.</p>
          )}

          {row.note && (
            <div className="mt-4 rounded-xl2 border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm">
              <p className="text-xs font-bold text-brand-700">학생 메모</p>
              <p className="whitespace-pre-line text-ink">{row.note}</p>
            </div>
          )}

          {/* 코멘트를 적고 확인 완료하면 학생 알림함으로 간다 */}
          <CheckinCheckForm id={row.id} checked={row.checked} feedback={row.feedback} onChecked={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
