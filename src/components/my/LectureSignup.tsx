"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { cancelLectureSignup, signupLecture, type LectureSignupState } from "@/app/my/class/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SNS_FOLLOWS, type LectureCondition, type SnsFollow } from "@/lib/lecture";
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

/**
 * 잠긴 특강의 **D-day** + 초 단위 카운트다운 (2026-10-02 Alan "잠겨있는거는 카운트다운 D-day").
 * D-day 는 서버가 한국 날짜로 센 값(`signupDday`)이라 자정에 자연히 하나 줄고, 시:분:초는 브라우저가 센다.
 */
export function SignupOpensIn({ opensAt, label, dday }: { opensAt: string; label: string; dday: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2.5">
      <span className="shrink-0 rounded-lg bg-brand-500 px-2.5 py-1 text-lg font-black tabular-nums text-white shadow-pink">{dday}</span>
      <span className="min-w-0 flex-1 text-xs font-bold text-slate">
        신청 시작까지 <span className="ml-1 text-sm font-black text-brand-600">{<Countdown opensAt={opensAt} />}</span>
        <span className="block text-[11px] font-semibold text-mist">{label} 오픈</span>
      </span>
    </div>
  );
}

/**
 * 신청 버튼 — **특강의 신청 조건(`condition`)에 맞는 칸이 함께 선다** (2026-10-15 Alan — "특강마다 신청조건을 선택할 수 있으면 좋겠어"):
 *  - review — YBM 수강후기 링크 칸 (2026-10-08 Alan — "학생이 후기를 적고 난 뒤에 이미지처럼 링크를 올리면 신청이 되는걸로 해줘").
 *    링크가 맞는지는 서버 액션(`parseReviewLink`)이 보고 DB 트리거가 한 번 더 막는다.
 *  - sns — 유튜브 구독 체크 + 인스타그램 새로 · 기존 팔로우 (Alan 이 보낸 그림 — "기존 팔로우는 기존으로 표기"). 둘 다 해야 버튼이 열린다.
 *  - none — 버튼 하나.
 * 칸은 상태로 쥐고 **보내기는 직접 한다** — React 19 는 `<form action>` 이 끝나면 폼을 초기화해서, 그냥 두면 "링크를 확인해 주세요" 와 함께 붙여 넣은 주소가 사라지고
 * 체크 · 고르기 칸은 처음 모양으로 돌아가 보내는 값이 비었다 (교재주문 폼과 같은 함정 — 같은 이벤트 안에서 전환을 연다).
 */
export function LectureSignupButton({ lectureId, full, condition = "none" }: { lectureId: number; full: boolean; condition?: LectureCondition }) {
  const [state, action] = useActionState<LectureSignupState, FormData>(signupLecture, {});
  const [link, setLink] = useState("");
  const [youtube, setYoutube] = useState(false);
  const [follow, setFollow] = useState<SnsFollow | null>(null);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => action(formData));
  };
  if (condition === "review" && !full) {
    return (
      <form action={action} onSubmit={submit} className="w-full space-y-2">
        <input type="hidden" name="lecture_id" value={lectureId} />
        <label className="block">
          <span className="text-xs font-bold text-ink">내 YBM 수강후기 링크</span>
          <input
            name="review_url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="여기에 후기 링크 붙여 넣기"
            className="input mt-1 !py-2.5"
          />
        </label>
        <SubmitButton variant="primary" className="!w-full !py-2.5" pendingText="신청 중…" disabled={!link.trim()}>
          후기 링크 올리고 신청하기
        </SubmitButton>
        {/* 오류에 주소 꼴이 들어 있다 — 좁은 화면에서 카드를 넘지 않게 필요할 때만 끊는다 */}
        {state.error && <p className="break-words text-xs font-semibold text-red-600">{state.error}</p>}
      </form>
    );
  }
  if (condition === "sns" && !full) {
    return (
      <form action={action} onSubmit={submit} className="w-full space-y-2">
        <input type="hidden" name="lecture_id" value={lectureId} />
        <label className="flex items-start gap-2 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm font-bold text-ink">
          <input type="checkbox" name="youtube" checked={youtube} onChange={(e) => setYoutube(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500" />
          역전토익 유튜브를 구독했어요
        </label>
        <fieldset className="rounded-xl border border-line bg-paper px-3 py-2.5">
          <legend className="sr-only">역전토익 인스타그램 팔로우</legend>
          <p className="text-xs font-bold text-slate">역전토익 인스타그램</p>
          <div className="mt-1.5 space-y-1.5">
            {SNS_FOLLOWS.map((f) => (
              <label key={f.value} className="flex items-start gap-2 text-sm font-bold text-ink">
                <input
                  type="radio"
                  name="sns_follow"
                  value={f.value}
                  checked={follow === f.value}
                  onChange={() => setFollow(f.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
        <SubmitButton variant="primary" className="!w-full !py-2.5" pendingText="신청 중…" disabled={!youtube || !follow}>
          구독 · 팔로우하고 신청하기
        </SubmitButton>
        {state.error && <p className="break-words text-xs font-semibold text-red-600">{state.error}</p>}
      </form>
    );
  }
  return (
    <form action={action} onSubmit={submit} className="space-y-1">
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
