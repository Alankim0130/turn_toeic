"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHomeworkMissingAlert } from "@/app/my/homework/actions";
import { Icon } from "@/components/ui/Icon";
import { HOMEWORK_DUE_LABEL } from "@/lib/homework-missing";

/**
 * **숙제 미제출 알림 신청** (2026-10-14 Alan — "숙제검사알림을 받고 싶은 사람은 숙제제출하는 곳 페이지에서 신청하기 버튼을 누르면 좋겠어.
 * 그럼 안 누른사람에게는 알림보내기 명단에서 빠지고 누른사람은 추가되어서 진행되면 좋겠어").
 * 신청한 학생만 선생님의 미제출 알림 명단에 나오고 알림을 받는다 — 숙제 점검완료 알림(선생님 코멘트)은 신청과 상관없이 간다.
 * 이름은 `숙제 미제출 알림` 이다 — "숙제 검사" 라고 적으면 점검완료 알림과 헷갈린다.
 * 신청 전에는 설명이 있는 카드, 신청한 뒤에는 **한 줄**로 줄인다 — 매번 여는 화면이라 달력을 아래로 밀지 않게.
 */
export function HomeworkAlertCard({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      const res = await setHomeworkMissingAlert(!on);
      if (res.ok) router.refresh();
      else setError(res.error ?? "잠시 후 다시 시도해 주세요.");
    });

  const errorLine = error && (
    <p role="alert" className="w-full text-sm font-semibold text-red-600">
      {error}
    </p>
  );

  if (on) {
    return (
      <section
        aria-labelledby="homework-alert-title"
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl2 border border-brand-100 bg-brand-50/60 px-3.5 py-2.5"
      >
        <Icon name="bell" size={20} />
        <div className="min-w-0 flex-1">
          <p id="homework-alert-title" className="text-sm font-black text-ink">
            숙제 미제출 알림을 받고 있어요
          </p>
          <p className="text-xs text-slate">다음 수업일 {HOMEWORK_DUE_LABEL}까지 안 낸 숙제가 있으면 알림함으로 알려 드려요</p>
        </div>
        <button type="button" onClick={toggle} disabled={pending} className="ml-auto shrink-0 text-xs font-bold text-slate underline decoration-line underline-offset-2 transition hover:text-brand-600">
          {pending ? "취소하는 중…" : "신청 취소"}
        </button>
        {errorLine}
      </section>
    );
  }

  return (
    <section aria-labelledby="homework-alert-title" className="card flex flex-wrap items-center gap-x-3 gap-y-2.5 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50" aria-hidden>
        <Icon name="bell" size={24} />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p id="homework-alert-title" className="font-black text-ink">
          숙제 미제출 알림
        </p>
        <p className="mt-0.5 text-sm text-slate">
          숙제는 <b className="font-bold text-ink">다음 수업일 {HOMEWORK_DUE_LABEL}</b>까지 내요. 그때까지 안 낸 숙제가 있으면 선생님이 알림함으로 알려 드려요. 받고 싶으면
          신청해 주세요.
        </p>
      </div>
      <button type="button" onClick={toggle} disabled={pending} className="btn-primary ml-auto shrink-0 !px-5 !py-2.5">
        {pending ? "신청하는 중…" : "신청하기"}
      </button>
      {errorLine}
    </section>
  );
}
