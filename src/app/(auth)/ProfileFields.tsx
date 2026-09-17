"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { editPhone, formatPhone } from "@/lib/phone";

/**
 * 회원가입 폼과 가입 정보 입력 폼(구글 로그인)이 함께 쓰는 칸들.
 * 두 폼이 같은 항목(실명·휴대폰·대학·학과·성별·동의)을 받으므로 한곳에 둔다 — 문구·검사 규칙이 어긋나지 않게.
 */

/**
 * 고를 수 있는 성별은 **여성·남성 둘뿐이다** (2026-09-17 Alan 요청).
 *
 * 안 고르면 서버가 `undisclosed` 로 넣으므로 여전히 선택 항목이다 — 칸을 없앤 것이 아니라 버튼만 줄였다.
 * DB check 와 분석 화면의 라벨(`GENDER_LABEL`)에는 `other`·`undisclosed` 가 그대로 남아 있다.
 * **지우지 말 것** — 이미 그 값으로 가입한 회원이 있고, 지우면 분석 차트에서 그 사람들이 사라진다.
 */
export const GENDERS = [
  { value: "female", label: "여성" },
  { value: "male", label: "남성" },
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

/**
 * 휴대폰 번호. **치는 동안 하이픈이 저절로 들어간다** (2026-09-17 Alan 요청).
 * 규칙과 커서 자리는 `src/lib/phone.ts` 한곳에 있다 (`phone.test.ts`).
 * 서버가 숫자만 남겨 저장하므로 **보이는 모양만 달라지고 DB 값은 그대로다.**
 */
export function PhoneField({ defaultValue }: { defaultValue?: string }) {
  const [value, setValue] = useState(() => formatPhone(defaultValue ?? ""));

  return (
    <div>
      <label htmlFor="phone" className="label">휴대폰 번호</label>
      <input
        id="phone"
        name="phone"
        type="tel"
        required
        inputMode="numeric"
        autoComplete="tel"
        maxLength={13}
        className="input"
        placeholder="010-1234-5678"
        value={value}
        onChange={(e) => {
          const el = e.currentTarget;
          const back = (e.nativeEvent as InputEvent).inputType === "deleteContentBackward";
          const next = editPhone(el.value, el.selectionStart ?? el.value.length, value, back);
          // 브라우저가 방금 적어 놓은 글자를 **그 자리에서** 표기로 덮어쓴다. 두 가지를 한꺼번에 막는다:
          // ① 값만 바꾸고 커서를 안 옮기면 브라우저가 커서를 끝으로 보낸다 (가운데를 못 고친다)
          // ② 걸러진 글자(예: 한글·영문)라 표기가 그대로면 React 는 다시 그리지 않는데,
          //    칸에는 그 글자가 남아 있어 상태와 어긋난다
          el.value = next.value;
          el.setSelectionRange(next.caret, next.caret);
          setValue(next.value);
        }}
      />
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
      <div className="grid grid-cols-2 gap-2">
        {GENDERS.map((g) => (
          <label key={g.value} className="cursor-pointer">
            {/* 선택 항목이라 처음에는 아무것도 골라 두지 않는다 — 안 고르면 서버가 `undisclosed` 로 넣는다 */}
            <input type="radio" name="gender" value={g.value} defaultChecked={defaultValue === g.value} className="peer sr-only" />
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
