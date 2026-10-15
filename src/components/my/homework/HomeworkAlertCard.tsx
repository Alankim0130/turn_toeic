"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHomeworkMissingAlert } from "@/app/my/homework/actions";
import { Icon } from "@/components/ui/Icon";
import { HOMEWORK_DUE_LABEL } from "@/lib/homework-missing";

/**
 * **숙제 미제출 알림 — 기본으로 받고, 원하면 '알림 안 받기'** (2026-10-15 Alan — "숙제 미제출알림 신청하는거 반대로 부탁해!
 * 알림 안받기를 신청하는걸로 하자"). 2026-10-14 하루는 거꾸로였다 — '신청하기' 를 누른 학생만 받았다.
 * 끈 학생은 선생님의 미제출 알림 명단에서 빠지고 알림을 받지 않는다 — 숙제 점검완료 알림(선생님 코멘트)은 끄든 말든 그대로 간다.
 * 이름은 `숙제 미제출 알림` 이다 — "숙제 검사" 라고 적으면 점검완료 알림과 헷갈린다.
 * 받는 중이든 끈 뒤든 **한 줄**이다 — 매번 여는 화면이라 달력을 아래로 밀지 않게. '알림 안 받기' 는 작은 글자 버튼이다 (권하는 일이 아니다).
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
          <p className="text-xs text-slate">다음 수업일 {HOMEWORK_DUE_LABEL}까지 안 낸 숙제가 있으면 선생님이 알림함으로 알려 드려요</p>
        </div>
        <button type="button" onClick={toggle} disabled={pending} className="ml-auto shrink-0 text-xs font-bold text-slate underline decoration-line underline-offset-2 transition hover:text-brand-600">
          {pending ? "바꾸는 중…" : "알림 안 받기"}
        </button>
        {errorLine}
      </section>
    );
  }

  return (
    <section aria-labelledby="homework-alert-title" className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl2 border border-line bg-surface px-3.5 py-2.5">
      <Icon name="bell" size={20} className="opacity-50 grayscale" />
      <div className="min-w-0 flex-1 basis-48">
        <p id="homework-alert-title" className="text-sm font-black text-ink-soft">
          숙제 미제출 알림을 받지 않아요
        </p>
        <p className="text-xs text-slate">기한이 지난 숙제가 있어도 알림이 가지 않아요. 숙제는 다음 수업일 {HOMEWORK_DUE_LABEL}까지 내요.</p>
      </div>
      <button type="button" onClick={toggle} disabled={pending} className="btn-secondary ml-auto shrink-0 !px-3.5 !py-1.5 text-xs">
        {pending ? "바꾸는 중…" : "다시 받기"}
      </button>
      {errorLine}
    </section>
  );
}
