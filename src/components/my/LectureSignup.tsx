"use client";

import { useActionState, useEffect, useState } from "react";
import { cancelLectureSignup, signupLecture, type LectureSignupState } from "@/app/my/class/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/lib/utils";

/** 신청 시작까지 남은 시간. 서버에서 받은 오픈 시각으로 1초마다 다시 센다 */
function Countdown({ opensAt }: { opensAt: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(opensAt).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [opensAt]);

  // 서버·클라이언트 첫 렌더를 맞추려고 계산 전에는 자리만 잡는다
  if (left === null) return <span className="tabular-nums">--:--:--</span>;
  if (left === 0) return <span>곧 열려요</span>;

  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className="tabular-nums">
      {d > 0 && `${d}일 `}
      {hh}:{mm}:{ss}
    </span>
  );
}

export function SignupOpensIn({ opensAt, label }: { opensAt: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2.5">
      <span className="text-xs font-bold text-slate">
        신청 시작까지 <span className="ml-1 text-base font-black text-brand-600">{<Countdown opensAt={opensAt} />}</span>
      </span>
      <span className="text-xs font-semibold text-mist">{label} 오픈</span>
    </div>
  );
}

export function LectureSignupButton({ lectureId, full }: { lectureId: number; full: boolean }) {
  const [state, action] = useActionState<LectureSignupState, FormData>(signupLecture, {});
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="lecture_id" value={lectureId} />
      <SubmitButton variant="primary" className="!py-2.5" pendingText="신청 중…" disabled={full}>
        {full ? "정원이 찼어요" : "신청하기"}
      </SubmitButton>
      {state.error && <p className="text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}

export function LectureCancelButton({ lectureId }: { lectureId: number }) {
  const [state, action] = useActionState<LectureSignupState, FormData>(cancelLectureSignup, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn-ghost !px-3 !py-1.5 text-xs text-slate hover:!text-red-600">
        신청 취소
      </button>
    );
  }
  return (
    <form action={action} className={cn("flex flex-wrap items-center justify-end gap-1")}>
      <input type="hidden" name="lecture_id" value={lectureId} />
      <SubmitButton variant="dark" className="!w-auto !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700" pendingText="취소 중…">
        취소 확정
      </SubmitButton>
      <button type="button" onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
        닫기
      </button>
      {state.error && <p className="w-full text-right text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}
