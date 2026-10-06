import Image from "next/image";
import { Icon } from "@/components/ui/Icon";

const STEPS = [
  { title: "마이페이지", body: "YBM 홈페이지(앱)에 로그인하고 아래 메뉴의 마이페이지를 눌러요." },
  { title: "수강증 버튼", body: "마이페이지에서 수강증 버튼을 눌러요." },
  { title: "파란색 수강증 캡처", body: "나오는 파란색 수강증 화면을 캡처해서 여기에 올려요." },
];

/**
 * 어떤 수강증을 올리나 — **파란색 수강증** (2026-09-30 Alan — "예시 수강증을 하나 보여주는 것도 좋을 것 같아" ·
 * "YBM 홈페이지에서 마이페이지에 들어가면 수강증이라는 버튼이 있는데 해당 버튼을 클릭해야지 파란색 수강증이 나온다" ·
 * "중요한건 파란색 수강증을 올리는게 가장 중요해!").
 * 등업신청 맨 위(업로드 폼 앞) 한 줄 전체 카드. 받은 수강증 30장 점검에서 잘못된 5장이 카톡 대화 캡처 · 출석 QR 화면이었다 —
 * 무엇을 올려야 하는지 먼저 보여 준다.
 *
 * 그림 둘은 Alan 이 준 것이다 (`public/guides/`): 수강증 예시는 **이름 · 수강료를 가린** 실물(폭 600 webp),
 * 마이페이지 그림은 YBM 홈페이지 첫 화면에서 아래 `마이페이지` 를 빨간 화살표로 짚은 것. 예시 그림에는 `예시` 표를 얹어
 * 이것을 그대로 올리는 일이 없게 한다 (이름이 가려져 있어 올려도 자동 등업은 안 된다 — G3).
 */
export function ReceiptGuide() {
  return (
    <section aria-labelledby="receipt-guide-title" className="card overflow-hidden border-brand-300 ring-2 ring-brand-100">
      <div className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-4 text-white sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Icon name="verify" size={24} className="brightness-0 invert" />
        </span>
        <div className="min-w-0">
          <h2 id="receipt-guide-title" className="text-lg font-black sm:text-xl">
            {/* "파란색" 은 말 그대로 수강증 카드의 파랑이다 (#3e89e3 — YBM 앱 수강증 카드 색) */}
            꼭 <span className="rounded-md bg-[#3e89e3] px-1.5 text-white ring-2 ring-white/70">파란색 수강증</span>을 올려 주세요
          </h2>
          <p className="mt-0.5 text-sm font-semibold text-white/90">결제 영수증 · 카카오톡 대화 캡처 · 다른 화면은 등업이 안 돼요.</p>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
        <div>
          <h3 className="text-base font-black text-ink">수강증 찾는 법</h3>
          <ol className="mt-3 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-black text-white">{i + 1}</span>
                <p className="text-slate">
                  <b className="text-ink">{s.title}</b> — {s.body}
                </p>
              </li>
            ))}
          </ol>
          <figure className="mt-4">
            <Image
              src="/guides/ybm-mypage.webp"
              alt="YBM 홈페이지 첫 화면 — 아래 메뉴의 마이페이지를 빨간 화살표로 표시"
              width={600}
              height={851}
              unoptimized
              className="mx-auto h-auto w-full max-w-[16rem] rounded-xl border border-line shadow-soft"
            />
            <figcaption className="mt-2 text-center text-xs text-mist">① YBM 홈페이지 첫 화면 → 아래 메뉴의 마이페이지</figcaption>
          </figure>
        </div>

        <figure>
          <h3 className="text-base font-black text-ink">이렇게 생긴 화면이에요</h3>
          <div className="relative mx-auto mt-3 w-full max-w-[17rem]">
            <Image
              src="/guides/receipt-example.webp"
              alt="파란색 수강증 예시 — 과정 · 역전토익 · 목표 점수, 수강생 · 수강센터 · 강사 · 레벨 · 강의실 · 수강요일 · 수강시간 칸이 보인다 (이름 · 수강료는 가림)"
              width={600}
              height={779}
              unoptimized
              className="h-auto w-full rounded-xl border border-line shadow-soft"
            />
            <span className="absolute right-2 top-2 rotate-6 rounded-lg border-2 border-brand-500 bg-white/95 px-2 py-0.5 text-sm font-black text-brand-600 shadow-soft">
              예시
            </span>
          </div>
          <figcaption className="mt-2 text-center text-xs text-slate">
            <b className="text-ink">수강생 · 수강센터 · 수강시간</b>이 모두 보이게 캡처해 주세요. (예시는 이름 · 수강료를 가렸어요)
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
