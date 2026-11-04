"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { attachTextbookTransfer } from "./actions";
import { TRANSFER_BUCKET, TRANSFER_HINT, transferFileProblem, transferPath } from "@/lib/textbook-transfer";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

/**
 * 내 교재주문 카드의 **이체 캡처 올리기 · 다시 올리기** (2026-11-04 Alan — "학생이 이체를 하고 난 뒤에, 해당 화면을 스크린샷찍어서 올려주면
 * 조교들이 바로 확인하고 배송을 시작"). 금액확인 전 주문에만 선다. 고르면 바로 저장소(`textbook-transfers/{내 id}/`)에 올리고 서버 액션이 주문에 붙인다.
 * 붙이지 못하면 방금 올린 파일을 지운다 — 등록을 **보낸 뒤** 끊겼으면 지우지 않는다 (서버가 저장했을 수 있다).
 */
export function TransferUpload({ orderId, userId, has }: { orderId: number; userId: string; has: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(list: FileList | null) {
    const file = list?.[0] ?? null;
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    const problem = transferFileProblem(file);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    let path: string | null = null;
    let sent = false;
    try {
      const uploaded = await uploadFile(TRANSFER_BUCKET, transferPath(userId, file), file);
      path = uploaded.path;
      sent = true;
      const res = await attachTextbookTransfer({ orderId, file: uploaded });
      if (!res.ok) {
        await removeUploaded(TRANSFER_BUCKET, [uploaded.path]);
        setError(res.error ?? "캡처를 올리지 못했어요.");
        return;
      }
      router.refresh();
    } catch (err) {
      if (path && !sent) await removeUploaded(TRANSFER_BUCKET, [path]);
      setError(err instanceof Error ? err.message : "캡처를 올리지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-busy={busy}
        className={cn(has ? "btn-ghost !px-3 !py-1.5 text-xs" : "btn-primary w-full !px-4 !py-2 text-sm sm:w-auto")}
      >
        {busy ? "올리는 중…" : has ? "캡처 다시 올리기" : "이체 캡처 올리기"}
      </button>
      {!has && <p className="mt-1 text-xs text-slate">{TRANSFER_HINT}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files)} disabled={busy} />
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
