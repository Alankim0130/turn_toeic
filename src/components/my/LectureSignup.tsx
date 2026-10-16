"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";
import { cancelLectureSignup, signupLecture, type LectureSignupState } from "@/app/my/class/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LECTURE_CONDITION_NOTICE, SNS_FOLLOWS, type LectureCondition, type SnsFollow } from "@/lib/lecture";
import { cn } from "@/lib/utils";

/** 학생이 고를 수 있는 신청 방식 하나 — 서버가 받는 방식(enabled)만 넘긴다 */
export type WayChoice = {
  way: string;
  label: string;
  condition: LectureCondition;
  conditionLabel: string;
  full: boolean;
  /** 남은 자리 (정원이 없으면 null) */
  left: number | null;
  applied: number;
};

/**
 * 특강 신청 — **신청하기 → 신청 방식 → 신청 조건 → 신청하기** (2026-10-16 Alan — "모의고사 신청을 클릭하면, 신청방식을 고를 수 있게 해줘.
 * 버튼형식으로 현장 / 시험지수령 / pdf수령 그리고 신청조건을 보여주고, 신청하기까지 들어가면 돼. (단, 조건을 이수완료하고 신청하기를 눌러달라는 안내문)" ·
 * RC · LC특강은 현장 / 수업영상 받기).
 *
 * - 방식은 강사가 특강 설정에서 켠 것만 온다. 정원이 찬 방식은 누를 수 없다. 방식이 하나뿐이면 미리 골라 둔다.
 * - 방식을 고르면 **그 방식의** 조건 상자(`conditionBoxes` — 서버가 그린 안내)와, 조건이 있으면 "다 마친 뒤에 신청하기" 안내가 선다.
 * - 조건 칸: review — YBM 수강후기 링크 · sns — 유튜브 구독 체크 + 인스타그램 새로 · 기존 팔로우 · none — 버튼만.
 *   링크가 맞는지는 서버 액션(`parseReviewLink`)이 보고 DB 트리거가 한 번 더 막는다.
 * 칸은 상태로 쥐고 **보내기는 직접 한다** — React 19 는 `<form action>` 이 끝나면 폼을 초기화해서, 그냥 두면 오류와 함께 붙여 넣은 주소가 사라지고
 * 체크 · 고르기 칸은 처음 모양으로 돌아가 보내는 값이 비었다 (교재주문 폼과 같은 함정 — 같은 이벤트 안에서 전환을 연다).
 */
export function LectureSignupFlow({
  lectureId,
  ways,
  conditionBoxes,
}: {
  lectureId: number;
  ways: WayChoice[];
  conditionBoxes: Partial<Record<LectureCondition, ReactNode>>;
}) {
  const [state, action] = useActionState<LectureSignupState, FormData>(signupLecture, {});
  const [open, setOpen] = useState(false);
  const only = ways.length === 1 && !ways[0].full ? ways[0].way : null;
  const [picked, setPicked] = useState<string | null>(only);
  const [link, setLink] = useState("");
  const [youtube, setYoutube] = useState(false);
  const [follow, setFollow] = useState<SnsFollow | null>(null);
  const chosen = ways.find((w) => w.way === picked && !w.full) ?? null;
  const allFull = ways.every((w) => w.full);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={allFull} className="btn-primary !w-full !py-2.5">
        {allFull ? "정원이 찼어요" : "신청하기"}
      </button>
    );
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => action(formData));
  };
  const ready = !!chosen && (chosen.condition === "review" ? !!link.trim() : chosen.condition === "sns" ? youtube && !!follow : true);

  return (
    <div className="@container w-full space-y-3 rounded-2xl border border-brand-200 bg-paper p-3">
      <div>
        <p className="text-xs font-black text-brand-700">신청 방식을 골라 주세요</p>
        <div
          role="radiogroup"
          aria-label="신청 방식"
          className={cn("mt-2 grid gap-2", ways.length >= 3 ? "@[21rem]:grid-cols-3" : ways.length === 2 ? "@[14rem]:grid-cols-2" : "")}
        >
          {ways.map((w) => {
            const on = picked === w.way && !w.full;
            return (
              <button
                key={w.way}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={w.full}
                onClick={() => setPicked(w.way)}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center rounded-xl border-2 px-2 py-2.5 text-center transition",
                  on ? "border-brand-500 bg-brand-500 text-white shadow-pink" : "border-line bg-paper text-ink hover:border-brand-300",
                  w.full && "cursor-not-allowed opacity-50 hover:border-line",
                )}
              >
                <span className="text-sm font-black">{w.label}</span>
                <span className={cn("mt-0.5 text-[11px] font-semibold", on ? "text-white/85" : "text-slate")}>
                  {w.full ? "정원 마감" : w.left !== null ? `${w.left}자리 남음` : `${w.applied}명 신청`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {chosen && (
        <>
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs">
            <p className="font-black text-brand-700">
              신청 조건 <span className="text-ink">· {chosen.conditionLabel}</span>
            </p>
            <div className="mt-1 text-slate">{conditionBoxes[chosen.condition]}</div>
          </div>
          {chosen.condition !== "none" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{LECTURE_CONDITION_NOTICE}</p>
          )}

          <form action={action} onSubmit={submit} className="space-y-2">
            <input type="hidden" name="lecture_id" value={lectureId} />
            <input type="hidden" name="way" value={chosen.way} />
            {chosen.condition === "review" && (
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
            )}
            {chosen.condition === "sns" && (
              <>
                <label className="flex items-start gap-2 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm font-bold text-ink">
                  <input
                    type="checkbox"
                    name="youtube"
                    checked={youtube}
                    onChange={(e) => setYoutube(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                  />
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
              </>
            )}
            <SubmitButton variant="primary" className="!w-full !py-2.5" pendingText="신청 중…" disabled={!ready}>
              신청하기
            </SubmitButton>
            {/* 오류에 주소 꼴이 들어 있다 — 좁은 화면에서 카드를 넘지 않게 필요할 때만 끊는다 */}
            {state.error && <p className="break-words text-xs font-semibold text-red-600">{state.error}</p>}
          </form>
        </>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
          닫기
        </button>
      </div>
    </div>
  );
}

/** 신청 취소 — 그 방식 하나 (2026-10-16 전에 방식 둘을 따로 신청해 둔 학생은 방식마다 취소한다) */
export function LectureCancelButton({ lectureId, way }: { lectureId: number; way: string }) {
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
    <form action={action} className="flex flex-wrap items-center justify-end gap-1">
      <input type="hidden" name="lecture_id" value={lectureId} />
      <input type="hidden" name="way" value={way} />
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
