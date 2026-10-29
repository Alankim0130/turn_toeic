import { startTransition, type FormEvent } from "react";

/**
 * `<form action={action}>` 은 그대로 두고 **보내기만 직접 한다** — `onSubmit={submitWithoutReset(action)}`.
 *
 * React 19 는 `<form action>` 이 끝나면(성공이든 오류든) 폼을 초기화(`form.reset()`)한다. 그러면
 *   - 상태로 쥔 라디오 · 체크 · 고르기 칸은 **화면 상태는 그대로인데 DOM 은 처음 그린 모양**으로 돌아가, 다음에 보낼 때 처음 값이 실린다
 *     (화면에는 '불라방' 이 골라져 있는데 '현장' 으로 저장된다)
 *   - 처음 값(`defaultValue`)을 준 고르는 칸(select)은 늘 처음 값으로 돌아가고, 적던 글 칸은 오류 뒤 처음 값으로 지워진다
 * (2026-10-07 교재주문에서 처음 겪었다 → 2026-10-29 전체 점검에서 같은 꼴을 여러 폼에서 찾았다 — jsdom 으로 확인: `form-submit.test.ts`).
 * 같은 이벤트 안에서 전환을 열어 보내면 React 가 초기화하지 않고, 버튼의 '…하는 중'(`useFormStatus`)도 그대로 켜진다.
 * 자바스크립트가 아직 안 올라왔을 때는 `action` 으로 보낸다 (그대로 둔다).
 *
 * 누른 버튼에 name 이 있으면 그 값도 싣는다 (`new FormData(form)` 은 누른 버튼을 넣지 않는다).
 * **버튼마다 다른 서버 액션(`formAction`)을 단 폼에는 쓰지 않는다** — 폼의 action 으로 보내 버린다.
 */
export function submitWithoutReset(action: (formData: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
      if (submitter.name) formData.append(submitter.name, submitter.value);
    }
    startTransition(() => action(formData));
  };
}
