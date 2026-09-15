"use client";

import { useActionState } from "react";
import { submitStudyApplication, type FormState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function StudyForm({ signedIn, defaults }: { signedIn: boolean; defaults: { name: string; phone: string } }) {
  const [state, action] = useActionState<FormState, FormData>(submitStudyApplication, {});
  const v: Record<string, string> = { ...defaults, ...(state.values ?? {}) };

  if (state.ok) {
    return (
      <Alert kind="success" title="스터디 신청이 접수됐어요">
        담당자가 확인 후 남겨주신 번호로 연락드립니다. 보통 1~2일 안에 안내해 드려요.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {!signedIn && (
        <p className="text-xs text-mist">회원이 아니어도 신청할 수 있어요. 로그인하면 이름과 연락처가 자동으로 채워집니다.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">이름</label>
          <input id="name" name="name" required className="input" defaultValue={v.name} />
        </div>
        <div>
          <label htmlFor="phone" className="label">휴대폰 번호</label>
          <input id="phone" name="phone" type="tel" inputMode="numeric" required className="input" placeholder="01012345678" defaultValue={v.phone} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="target_score" className="label">목표 점수 <span className="font-normal text-mist">(선택)</span></label>
          <input id="target_score" name="target_score" type="number" min={10} max={990} step={5} className="input" placeholder="예: 750" defaultValue={v.target_score} />
        </div>
        <div>
          <label htmlFor="preferred_time" className="label">가능한 시간 <span className="font-normal text-mist">(선택)</span></label>
          <input id="preferred_time" name="preferred_time" className="input" placeholder="예: 평일 저녁, 주말 오전" defaultValue={v.preferred_time} />
        </div>
      </div>
      <div>
        <label htmlFor="message" className="label">하고 싶은 말 <span className="font-normal text-mist">(선택)</span></label>
        <textarea id="message" name="message" rows={4} maxLength={1000} className="input resize-y" placeholder="현재 점수, 원하는 스터디 방식 등을 자유롭게 적어 주세요" defaultValue={v.message} />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate">
        <input type="checkbox" name="agree" required className="mt-1 h-4 w-4 accent-brand-500" />
        <span>스터디 안내 연락을 위해 이름과 연락처를 수집·이용하는 데 동의합니다.</span>
      </label>
      <SubmitButton pendingText="접수 중…">스터디 신청하기</SubmitButton>
    </form>
  );
}
