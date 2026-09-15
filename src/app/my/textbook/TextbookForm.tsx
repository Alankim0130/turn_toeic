"use client";

import { useActionState } from "react";
import { submitTextbookOrder, type TextbookState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export type EligibleSection = { id: number; label: string };

export function TextbookForm({
  sections,
  defaults,
}: {
  sections: EligibleSection[];
  defaults: { recipient_name: string; phone: string };
}) {
  const [state, action] = useActionState<TextbookState, FormData>(submitTextbookOrder, {});
  const v: Record<string, string | undefined> = { ...defaults, ...(state.values ?? {}) };

  if (state.ok) {
    return (
      <Alert kind="success" title="교재신청이 접수됐어요">
        확인 후 남겨주신 주소로 발송됩니다. 발송되면 아래 내역에 송장번호가 표시돼요.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="warning">{state.error}</Alert>}

      <div>
        <label htmlFor="section_id" className="label">신청할 반</label>
        <select id="section_id" name="section_id" required className="input" defaultValue={v.section_id ?? (sections.length === 1 ? String(sections[0].id) : "")}>
          {sections.length !== 1 && <option value="">반을 선택하세요</option>}
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="recipient_name" className="label">받는 분</label>
          <input id="recipient_name" name="recipient_name" required className="input" defaultValue={v.recipient_name} />
        </div>
        <div>
          <label htmlFor="phone" className="label">휴대폰 번호</label>
          <input id="phone" name="phone" type="tel" inputMode="numeric" required className="input" placeholder="01012345678" defaultValue={v.phone} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <div>
          <label htmlFor="postal_code" className="label">우편번호 <span className="font-normal text-mist">(선택)</span></label>
          <input id="postal_code" name="postal_code" inputMode="numeric" maxLength={5} className="input" placeholder="12345" defaultValue={v.postal_code} />
        </div>
        <div>
          <label htmlFor="address" className="label">주소</label>
          <input id="address" name="address" required className="input" placeholder="도로명 주소" defaultValue={v.address} />
        </div>
      </div>
      <div>
        <label htmlFor="address_detail" className="label">상세 주소 <span className="font-normal text-mist">(선택)</span></label>
        <input id="address_detail" name="address_detail" className="input" placeholder="동·호수, 공동현관 비밀번호 등" defaultValue={v.address_detail} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <div>
          <label htmlFor="quantity" className="label">수량</label>
          <select id="quantity" name="quantity" className="input" defaultValue={v.quantity ?? "1"}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}권
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="memo" className="label">요청사항 <span className="font-normal text-mist">(선택)</span></label>
          <input id="memo" name="memo" maxLength={200} className="input" placeholder="배송 시 요청사항" defaultValue={v.memo} />
        </div>
      </div>

      <p className="text-xs text-mist">교재비는 이 사이트에서 결제하지 않습니다. 안내에 따라 학원에서 처리됩니다.</p>
      <SubmitButton pendingText="접수 중…">교재 배송 신청</SubmitButton>
    </form>
  );
}
