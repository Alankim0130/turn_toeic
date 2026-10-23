"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHomeworkMissingAlert } from "@/app/my/homework/actions";
import { Icon } from "@/components/ui/Icon";
import { HOMEWORK_DUE_LABEL } from "@/lib/homework-missing";
import { cn } from "@/lib/utils";

/**
 * **숙제 미제출 알림 켜기 · 끄기** — 기본은 켜져 있고(모두 받는다), 끈 학생만 선생님의 미제출 알림 명단에서 빠진다
 * (2026-10-15 Alan — "숙제 미제출알림 신청하는거 반대로 부탁해! 알림 안받기를 신청하는걸로 하자". 10-14 하루는 '신청하기' 를 누른 학생만 받았다).
 * 숙제 점검완료 알림(선생님 코멘트)은 끄든 말든 그대로 간다. 이름은 `숙제 미제출 알림` — "숙제 검사" 라고 적으면 점검완료 알림과 헷갈린다.
 *
 * **켜고 끄는 스위치 하나다** (2026-10-23 Alan — 끈 화면의 회색 줄과 '다시 받기' 를 짚으며 "숙제 미제출 알림이 잘 안보이는데 쫌 더 직관적으로 보이도록 부탁해").
 * 그전(10-15 ~ 10-23)에는 받는 중이면 작은 밑줄 글자 '알림 안 받기', 끄면 회색 줄 + '다시 받기' 였다 — 끈 줄은 화면 바탕과 같은 색이라 눈에 안 띄었고
 * '다시 받기' 는 무엇을 다시 받는지 읽히지 않았다. 지금은 휴대폰 설정처럼 **스위치 · `켜져 있어요` / `꺼져 있어요` 글자 · 종(끄면 회색 종에 빗금)** 이
 * 같은 것을 말하고, 카드는 켜지면 분홍 · 꺼지면 흰 카드라 바탕에 묻히지 않는다. **글자 버튼으로 되돌리지 말 것.**
 * - 누르면 그 자리에서 바뀌어 보인다(`useOptimistic`) — 저장에 실패하면 원래대로 돌아가고 까닭을 적는다. 확인 단계는 없다 (다시 누르면 된다).
 * - 문서 · 코드 주석의 '알림 안 받기' 는 이 스위치를 끈 것이다 (`homework_missing_optouts` 에 내 줄이 있다).
 * - 종은 힉스필드 아이콘(`bell`)이고 빗금 · 스위치는 CSS 도형이다 — 이모지를 쓰지 않는다.
 */
export function HomeworkAlertCard({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 저장이 끝날 때까지 누른 쪽을 보여 준다 — 실패하면 `on`(서버의 값)으로 돌아간다
  const [shown, setShown] = useOptimistic(on);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    // 저장하는 동안은 다시 받지 않는다 — disabled 로 막으면 키보드 포커스가 스위치에서 빠진다
    if (pending) return;
    // 지난 까닭은 누르는 순간 지운다 — 전환 안에서 지우면 저장이 끝날 때까지 남는다
    setError(null);
    startTransition(async () => {
      setShown(!on);
      const res = await setHomeworkMissingAlert(!on);
      if (res.ok) router.refresh();
      else setError(res.error ?? "잠시 후 다시 시도해 주세요.");
    });
  };

  return (
    <section
      aria-labelledby="homework-alert-title"
      className={cn(
        "rounded-xl2 border p-3.5 shadow-soft transition-colors sm:p-4",
        shown ? "border-brand-200 bg-brand-50" : "border-line bg-paper",
      )}
    >
      {/* 휴대폰은 [종 · 제목 · 스위치] 아래에 설명이 카드 폭 그대로, 넓은 화면은 설명이 제목 아래로 들어가 한 칸짜리 설정 줄이 된다 */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
        <BellMark on={shown} className="sm:row-span-2" />
        <div className="min-w-0">
          <h2 id="homework-alert-title" className="text-[15px] font-black leading-snug text-ink sm:text-base">
            숙제 미제출 알림
          </h2>
          <p className={cn("text-[13px] font-black leading-snug", shown ? "text-brand-600" : "text-slate")}>
            {shown ? "켜져 있어요" : "꺼져 있어요"}
          </p>
        </div>
        <AlertSwitch on={shown} busy={pending} onClick={toggle} className="sm:row-span-2" />
        <p
          id="homework-alert-desc"
          className="col-span-3 mt-2.5 text-balance text-[13px] leading-relaxed text-slate sm:col-span-1 sm:col-start-2 sm:mt-1"
        >
          {shown
            ? `다음 수업일 ${HOMEWORK_DUE_LABEL}까지 안 낸 숙제가 있으면 선생님이 알려 드려요.`
            : `숙제를 다음 수업일 ${HOMEWORK_DUE_LABEL}까지 안 내도 알림이 오지 않아요. 다시 받으려면 스위치를 켜 주세요.`}
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

/** 종 — 켜지면 색 종, 꺼지면 회색 종에 빗금 */
function BellMark({ on, className }: { on: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("relative grid size-11 shrink-0 place-items-center rounded-xl", on ? "bg-paper" : "bg-line", className)}>
      <Icon name="bell" size={26} className={on ? undefined : "opacity-60 grayscale"} />
      {!on && <span className="absolute h-[3px] w-8 -rotate-45 rounded-full bg-slate ring-2 ring-line" />}
    </span>
  );
}

/**
 * 휴대폰 설정과 같은 켜기 · 끄기 스위치. 누르는 자리는 보이는 스위치보다 넓다 (`p-1.5` · `-m-1.5` — 손가락 44px).
 * 이름은 카드 제목(`숙제 미제출 알림`), 켜짐 · 꺼짐은 `aria-checked` 가 읽어 준다.
 */
function AlertSwitch({ on, busy, onClick, className }: { on: boolean; busy: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby="homework-alert-title"
      aria-describedby="homework-alert-desc"
      aria-busy={busy || undefined}
      onClick={onClick}
      className={cn(
        "-m-1.5 shrink-0 rounded-full p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
        busy ? "cursor-wait" : "cursor-pointer",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-8 w-[3.25rem] items-center rounded-full p-1 transition-colors duration-200 motion-reduce:transition-none",
          on ? "bg-brand-500" : "bg-mist/70",
        )}
      >
        <span
          className={cn(
            "size-6 rounded-full bg-paper shadow-md transition-transform duration-200 motion-reduce:transition-none",
            on && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}
