"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkHomework, undoHomeworkCheck } from "@/app/admin/homework/actions";
import { Icon } from "@/components/ui/Icon";
import { MAX_FEEDBACK } from "@/lib/homework";

/**
 * 숙제 점검 — **코멘트(질문 답변)를 적고 점검완료**하면 학생 알림함으로 간다 (2026-09-19 Alan).
 * 코멘트는 선택이다. 점검을 취소하면 코멘트도 지우지만 **이미 보낸 알림은 그대로 둔다**.
 *
 * **여기가 점검완료를 누르는 유일한 자리다** — 상세 팝업(`HomeworkDetail`) 안에만 있다.
 * `onChecked` 는 점검을 **보냈을 때만** 부른다 (팝업이 닫힌다). 점검 취소는 부르지 않는다 —
 * 되돌린 결과를 그 자리에서 봐야 한다.
 */
export function HomeworkCheckForm({
  id,
  checked,
  question,
  feedback,
  onChecked,
}: {
  id: number;
  checked: boolean;
  question: string | null;
  feedback: string | null;
  onChecked?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        setText("");
        router.refresh();
        done?.();
      } else setError(res.error ?? "저장하지 못했어요.");
    });

  if (checked) {
    return (
      <div className="mt-3 space-y-2">
        {feedback && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm">
            <p className="text-xs font-bold text-brand-700">보낸 코멘트</p>
            <p className="whitespace-pre-line text-ink">{feedback}</p>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-mist">학생 알림함으로 점검완료를 보냈어요.</p>
          <button type="button" onClick={() => run(() => undoHomeworkCheck(id))} disabled={pending} className="btn-ghost !px-3 !py-1.5 text-xs">
            {pending ? "되돌리는 중…" : "점검 취소"}
          </button>
        </div>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <label htmlFor={`fb-${id}`} className="label !mb-1 text-xs">
        {question ? "질문 답변 · 코멘트" : "코멘트"} <span className="font-normal text-mist">(선택)</span>
      </label>
      <textarea
        id={`fb-${id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_FEEDBACK}
        rows={2}
        disabled={pending}
        placeholder={question ? "질문에 답해 주세요. 학생 알림함으로 그대로 갑니다." : "더 할 말이 있으면 적어 주세요. 비워 두면 점검완료 알림만 갑니다."}
        className="input min-h-16 resize-y text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-mist tabular-nums">
          {text.length} / {MAX_FEEDBACK}
        </span>
        <button type="button" onClick={() => run(() => checkHomework({ id, feedback: text }), onChecked)} disabled={pending} className="btn-primary !px-4 !py-2 text-sm">
          <Icon name="success" size={18} className="brightness-0 invert" />
          {pending ? "보내는 중…" : "점검완료 · 알림 보내기"}
        </button>
      </div>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
