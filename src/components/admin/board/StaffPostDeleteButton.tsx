"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteStaffPost } from "@/app/admin/board/actions";

/** 직원 게시판 글 지우기 (2026-10-21) — 글쓴이와 강사 · 관리자에게만 보인다. 지우면 사진 · 첨부 파일도 함께 지우고 목록으로 간다 */
export function StaffPostDeleteButton({ id, others }: { id: number; /** 남의 글을 지우는 중인가 (강사 · 관리자) — 확인 글이 다르다 */ others: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`${others ? "다른 직원이 쓴 글이에요. " : ""}이 글을 지울까요? 넣은 사진 · 첨부 파일도 함께 지워져요.`)) return;
    setBusy(true);
    setError(null);
    // 답 없이 끝나도(연결 끊김) '지우는 중…' 에 멈추지 않게 (2026-10-29 점검)
    const res = await deleteStaffPost(id).catch(() => ({ ok: false as const, error: "지우지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요." }));
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "지우지 못했어요.");
    router.push("/admin/board");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={remove} disabled={busy} className="text-sm font-bold text-red-600 hover:text-red-700 disabled:opacity-50">
        {busy ? "지우는 중…" : "글 지우기"}
      </button>
      {error && (
        <p role="alert" className="w-full rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
