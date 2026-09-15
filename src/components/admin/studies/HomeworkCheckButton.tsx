"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHomeworkChecked } from "@/app/admin/homework/actions";
import { Icon } from "@/components/ui/Icon";

export function HomeworkCheckButton({ id, checked }: { id: number; checked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      const res = await setHomeworkChecked(id, !checked);
      if (res.ok) router.refresh();
      else setError(res.error ?? "저장하지 못했어요.");
    });

  return (
    <div className="flex flex-col items-end gap-1">
      {checked ? (
        <button type="button" onClick={toggle} disabled={pending} className="btn-ghost !px-3 !py-1.5 text-xs">
          {pending ? "되돌리는 중…" : "점검 취소"}
        </button>
      ) : (
        <button type="button" onClick={toggle} disabled={pending} className="btn-primary !px-4 !py-2 text-sm">
          <Icon name="success" size={18} className="brightness-0 invert" />
          {pending ? "저장 중…" : "점검완료"}
        </button>
      )}
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
