"use client";

import { useActionState } from "react";
import { submitContact, type FormState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function ContactForm({ defaults }: { defaults: { name: string; phone: string; email: string } }) {
  const [state, action] = useActionState<FormState, FormData>(submitContact, {});
  const v: Record<string, string> = { ...defaults, ...(state.values ?? {}) };

  if (state.ok) {
    return (
      <Alert kind="success" title="문의가 접수됐어요">
        확인 후 남겨주신 연락처로 답변드립니다.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      <div>
        <label htmlFor="name" className="label">이름</label>
        <input id="name" name="name" required className="input" defaultValue={v.name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="label">휴대폰 번호</label>
          <input id="phone" name="phone" type="tel" inputMode="numeric" className="input" placeholder="01012345678" defaultValue={v.phone} />
        </div>
        <div>
          <label htmlFor="email" className="label">이메일</label>
          <input id="email" name="email" type="email" className="input" defaultValue={v.email} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-mist">휴대폰 번호와 이메일 중 하나는 꼭 남겨 주세요.</p>
      <div>
        <label htmlFor="message" className="label">문의 내용</label>
        <textarea id="message" name="message" rows={6} required maxLength={2000} className="input resize-y" defaultValue={v.message} />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate">
        <input type="checkbox" name="agree" required className="mt-1 h-4 w-4 accent-brand-500" />
        <span>답변을 위해 이름과 연락처를 수집·이용하는 데 동의합니다.</span>
      </label>
      <SubmitButton pendingText="접수 중…">문의 보내기</SubmitButton>
    </form>
  );
}
