import { Icon } from "@/components/ui/Icon";

const CASES = [
  "AI나 편집 프로그램으로 만든 수강증",
  "이름 · 날짜 · 반 · 시간 같은 글자를 고친 수강증",
  "다른 사람의 수강증을 내 것처럼 올린 경우",
];

/**
 * 한 일 → 처벌 → 근거 조문 순서다. 법정형은 형법 조문 그대로 (2026-10-03 확인):
 * 제231조 · 제232조의2 · 제234조 5년 / 1천만원, 제314조 5년 / 1천500만원, 제347조 · 제347조의2 10년 / 2천만원.
 * 처벌은 두 반쪽, 근거는 조문 하나씩 끊어 그 사이에서만 줄이 바뀌게 한다 — `제234조` 와 `(위조사문서등의 행사)` 가 갈라지지 않게 (320 · 393px 실측).
 */
const LAWS: { when: string; prison: string; fine: string; basis: string[] }[] = [
  {
    when: "수강증을 만들거나 고쳐서 올리면",
    prison: "5년 이하의 징역",
    fine: "1,000만원 이하의 벌금",
    basis: ["형법 제231조(사문서위조)", "제232조의2(사전자기록위작)", "제234조(위조사문서등의 행사)"],
  },
  {
    when: "속여서 등업 확인 업무를 방해하면",
    prison: "5년 이하의 징역",
    fine: "1,500만원 이하의 벌금",
    basis: ["형법 제314조(업무방해)"],
  },
  {
    when: "수강료를 내지 않고 불라방 · 다시보기를 이용하면",
    prison: "10년 이하의 징역",
    fine: "2,000만원 이하의 벌금",
    basis: ["형법 제347조(사기)", "제347조의2(컴퓨터등 사용사기)"],
  },
];

/**
 * 위조 수강증 법적 조치 안내 (2026-10-03 Alan — "위조 수강증을 만들경우 법적조치를 취한다고 명시해줘. 가능하다면 관련법 조항도").
 * 등업신청 왼쪽 열 맨 위 — 예전 "이렇게 진행돼요" 카드 자리다 (같은 날 Alan 이 빼게 했다).
 *
 * **모든 학생에게 같은 글이다.** 한 학생에게 "위조 의심" 을 말하지 않는 규칙(CLAUDE.md 미확정 11)과 다른 일이고,
 * **무엇으로 가려내는지는 적지 않는다** — 적으면 위조하는 쪽에 고칠 곳을 알려 주는 꼴이다.
 */
export function ForgeryNotice() {
  return (
    <section className="card overflow-hidden" aria-labelledby="forgery-title">
      <div className="flex items-center gap-3 bg-ink px-5 py-4 text-white">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
          <Icon name="warning" size={24} />
        </span>
        <div className="min-w-0">
          <h2 id="forgery-title" className="text-base font-black">
            수강증 위조 · 변조 시 <span className="whitespace-nowrap">법적 조치를 취합니다</span>
          </h2>
          <p className="mt-0.5 text-sm text-white/80">확인되면 등업을 취소하고 형사 고소 등 법적 조치를 진행해요.</p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-black text-ink">이런 경우예요</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {CASES.map((c) => (
              <li key={c} className="flex items-start gap-2">
                <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-black text-ink">이런 법으로 처벌받을 수 있어요</h3>
          <ul className="mt-2 space-y-2">
            {LAWS.map((l) => (
              <li key={l.when} className="rounded-xl bg-surface p-3 ring-1 ring-line">
                <p className="text-sm font-bold text-ink">{l.when}</p>
                <p className="mt-0.5 text-sm font-black text-brand-700">
                  <span className="whitespace-nowrap">{l.prison}</span> <span className="whitespace-nowrap">또는 {l.fine}</span>
                </p>
                <p className="mt-1 text-xs text-slate">
                  {l.basis.map((b, i) => (
                    <span key={b}>
                      {i > 0 && " · "}
                      <span className="whitespace-nowrap">{b}</span>
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
