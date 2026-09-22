"use client";

import { useState } from "react";
import { HomeworkDetail } from "@/components/admin/homework/HomeworkDetail";
import type { HomeworkPhoto } from "@/components/admin/homework/HomeworkPhotos";
import { cn } from "@/lib/utils";

/** 목록 한 줄 — **글자는 서버가 다 만들어서 넘긴다** (날짜·건수 문구를 클라이언트에서 다시 짓지 않는다) */
export type HomeworkRow = {
  id: number;
  name: string;
  phone: string | null;
  /** `650 RC` — 레벨 + 과목 */
  label: string | null;
  /** 줄 둘째 칸: `9월 15일 수업 · 사진 4장` */
  sub: string;
  /** 줄 오른쪽: 제출 시각 `9/18 07:34` */
  at: string;
  /** 팝업 머리글 한 줄 (제출 시각 · 점검 정보까지) */
  meta: string;
  checked: boolean;
  question: string | null;
  feedback: string | null;
  photos: HomeworkPhoto[];
  /** 사진이 아닌 첨부 */
  files: { id: number; name: string }[];
};

/**
 * 숙제점검 목록 — **한 건이 한 줄이고, 누르면 상세 팝업이 열린다** (2026-09-22 Alan 요청:
 * "학생제출 내역을 보면, 다 펼쳐져서 나오는데, 이렇게 하지말고 첫토익처럼 저렇게 보이고
 * 학생카드를 클릭하면 숙제이미지가 나와서 확인할 수 있도록 하자").
 *
 * 그전에는 카드마다 **사진 썸네일·학생 질문·코멘트 칸이 전부 펼쳐져** 있어 한 화면에 두세 건뿐이었고,
 * "오늘 몇 건 남았나" 를 훑을 수가 없었다. 줄로 접으면 열 건이 한 화면에 들어온다.
 *
 * 모양은 학생명단 카드(`StudentCard`)와 같다 — 둥근 네모 아바타 · 이름 + 작은 배지 · 회색 한 줄 ·
 * 오른쪽 끝에 꺾쇠. **구조만 첫토익이고 색은 우리 핫핑크다.**
 * **정보를 알약(테두리 있는 상자)에 담지 말 것** — 줄이 쌓이면 상자만 보이고 값이 안 읽힌다.
 */
export function HomeworkList({ rows }: { rows: HomeworkRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <ul className="grid gap-2 lg:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id}>
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
                  {r.label && <span className="rounded-full bg-ink px-1.5 py-0.5 text-[11px] font-black text-white">{r.label}</span>}
                  {r.checked && <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">점검완료</span>}
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

      {open && <HomeworkDetail row={open} onClose={() => setOpenId(null)} />}
    </>
  );
}
