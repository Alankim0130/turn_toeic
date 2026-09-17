"use client";

import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui/Alert";

/**
 * 회원가입 폼과 가입 정보 입력 폼(구글 로그인)이 함께 쓰는 칸들.
 * 두 폼이 같은 항목(실명·휴대폰·대학·학과·성별·동의)을 받으므로 한곳에 둔다 — 문구·검사 규칙이 어긋나지 않게.
 */

export const GENDERS = [
  { value: "female", label: "여성" },
  { value: "male", label: "남성" },
  { value: "other", label: "기타" },
  { value: "undisclosed", label: "응답 안 함" },
];

/** 서버가 거부하면 안내는 폼 맨 위에 뜨는데, 모바일은 버튼까지 내려가 있어 보이지 않는다. 안내로 올려 준다 */
export function FormError({ error, stateKey }: { error?: string; stateKey: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error) return;
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [error, stateKey]);
  if (!error) return null;
  return (
    <div ref={ref} tabIndex={-1} className="scroll-mt-24 outline-none">
      <Alert kind="warning">{error}</Alert>
    </div>
  );
}

export function NameField({ defaultValue, readOnly = false }: { defaultValue?: string; readOnly?: boolean }) {
  return (
    <div>
      <label htmlFor="name" className="label">실명</label>
      <input
        id="name"
        name="name"
        required
        autoComplete="name"
        readOnly={readOnly}
        className={readOnly ? "input bg-paper text-slate" : "input"}
        placeholder="수강증에 적힌 이름과 같아야 해요"
        defaultValue={defaultValue}
      />
      {readOnly && <p className="mt-1 text-xs text-mist">이름은 수강증 대조에 쓰여서 바꿀 수 없어요.</p>}
    </div>
  );
}

export function PhoneField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div>
      <label htmlFor="phone" className="label">휴대폰 번호</label>
      <input id="phone" name="phone" type="tel" required inputMode="numeric" autoComplete="tel" className="input" placeholder="01012345678" defaultValue={defaultValue} />
    </div>
  );
}

export function SchoolFields({ university, department }: { university?: string; department?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="university" className="label">대학교 <span className="font-normal text-mist">(선택)</span></label>
        <input id="university" name="university" className="input" placeholder="예: 부산대학교" defaultValue={university} />
      </div>
      <div>
        <label htmlFor="department" className="label">학과 <span className="font-normal text-mist">(선택)</span></label>
        <input id="department" name="department" className="input" placeholder="예: 경영학과" defaultValue={department} />
      </div>
    </div>
  );
}

export function GenderField({ defaultValue }: { defaultValue?: string }) {
  return (
    <fieldset>
      <legend className="label">성별 <span className="font-normal text-mist">(선택)</span></legend>
      <div className="grid grid-cols-4 gap-2">
        {GENDERS.map((g) => (
          <label key={g.value} className="cursor-pointer">
            <input type="radio" name="gender" value={g.value} defaultChecked={(defaultValue ?? "undisclosed") === g.value} className="peer sr-only" />
            <span className="block rounded-xl border border-line bg-paper px-2 py-2.5 text-center text-sm font-semibold text-slate transition peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
              {g.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AgreeField({ defaultChecked }: { defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate">
      <input type="checkbox" name="agree" className="mt-1 h-4 w-4 accent-brand-500" required defaultChecked={defaultChecked} />
      <span>
        수강 관리와 학습 안내를 위해 실명·연락처·대학·학과·성별을 수집·이용하는 데 동의합니다. 대학·학과·성별은 통계 목적으로만 사용됩니다.
      </span>
    </label>
  );
}
