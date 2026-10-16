"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLectureOpen } from "@/app/admin/lectures/actions";
import { cn } from "@/lib/utils";

/**
 * **신청 받기 ↔ 신청 받기 취소** 버튼 (2026-10-16 Alan — "강사가 직접 '신청받기' 버튼을 누르면 바로 오픈되면서 신청을 받을 수 있도록" →
 * 같은 날 "신청 받는 중 이라고 나와있는데, 취소하는버튼이 없어 … '신청 받기' 버튼을 누르면 학생들이 특강신청페이지에 노출되면서 신청할 수 있도록 …
 * 신청받기를 안 누른다면 학생들 특강신청페이지에 안보이는거지").
 * - 닫혀 있으면 `신청 받기` — 누르는 순간 학생 특강 신청 화면에 선다. 열려 있으면 `신청 받기 취소` — 한 번 더 묻고 학생 화면에서 바로 빠진다.
 *   (처음 몇 시간은 이름이 `신청 마감` 이었다 — 날짜가 지난 특강의 상태 이름과 같아 되돌리는 버튼으로 읽히지 않았다. **되돌리지 말 것.**)
 * - 이미 신청한 학생의 신청은 그대로 남는다 (학생 화면에는 내 신청 기록으로만 선다) — 확인 단계가 그렇게 말한다. 한 사람씩 지우는 것은 명단의 `취소`.
 * - 특강 신청 화면과 특강 설정 화면이 같이 쓴다. 지난 특강은 열지 않는다.
 */
export function LectureOpenButton({
  lectureId,
  open,
  past,
  signups = 0,
  className,
}: {
  lectureId: number;
  open: boolean;
  past: boolean;
  /** 이 특강에 들어온 신청 수 — 취소할 때 "이미 신청한 N명은 그대로" 를 말한다 */
  signups?: number;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ error?: string; message?: string }>({});

  if (past) return <span className={cn("text-xs font-semibold text-mist", className)}>지난 특강</span>;

  const run = (next: boolean) =>
    startTransition(async () => {
      const res = await setLectureOpen(lectureId, next);
      setResult(res);
      setConfirming(false);
      if (res.ok) router.refresh();
    });

  return (
    <span className={cn("inline-flex flex-wrap items-center justify-end gap-1.5", className)}>
      {!open ? (
        <button type="button" disabled={pending} onClick={() => run(true)} className="btn-primary !w-auto !px-4 !py-1.5 text-xs">
          {pending ? "여는 중…" : "신청 받기"}
        </button>
      ) : confirming ? (
        <>
          <span className="w-full text-right text-xs font-semibold text-ink">
            신청 받기를 취소할까요? 학생 특강 신청 화면에서 바로 빠져요.
            {signups > 0 && ` 이미 신청한 ${signups}명의 신청은 그대로 남아요.`}
          </span>
          <button type="button" disabled={pending} onClick={() => run(false)} className="btn-dark !w-auto !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700">
            {pending ? "취소하는 중…" : "네, 취소"}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
            아니요
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-secondary !w-auto !px-4 !py-1.5 text-xs">
          신청 받기 취소
        </button>
      )}
      {result.error && <span className="w-full text-right text-xs font-semibold text-red-600">{result.error}</span>}
      {result.message && !result.error && <span className="w-full text-right text-xs font-semibold text-brand-600">{result.message}</span>}
    </span>
  );
}
