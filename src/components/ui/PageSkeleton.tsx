/**
 * 화면을 옮기는 동안 **누르는 순간** 보이는 빈 화면 틀 (2026-10-09 Alan "화면 전환이 좀 느린데" — 예전에는 메뉴를 누르면
 * 서버가 답할 때까지 이전 화면이 그대로 멈춰 있어 눌렸는지조차 알 수 없었다).
 *
 * 구역마다 `loading.tsx` 가 이것을 그린다 — Next 가 링크가 화면에 보일 때 이 틀을 미리 받아 두었다가 누르는 순간 바꾸고,
 * 내용이 오면 갈아 끼운다. 모양은 화면 머리(`PageHeader` — 아이콘 칸 · 제목 · 설명)와 카드 몇 장이라 어느 화면에도 크게 어긋나지 않는다.
 * `aria-busy` 가 "아직 불러오는 중" 을 알린다. 장식이라 낭독기에는 "불러오는 중" 한마디만.
 * 색은 **꽉 찬 색**만 쓴다(`bg-brand-100` · `bg-brand-50`) — 반투명(`/70`)에 깜빡임(animate-pulse)을 겹치니 시험용 브라우저가 하늘색으로 그렸다 (2026-10-09).
 */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div aria-hidden className="mb-8 flex items-center gap-3">
        <span className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-brand-50 ring-1 ring-brand-100" />
        <span className="min-w-0 flex-1 space-y-2">
          <span className="block h-7 w-36 max-w-[60%] animate-pulse rounded-lg bg-brand-100" />
          <span className="block h-4 w-72 max-w-[85%] animate-pulse rounded-md bg-brand-50" />
        </span>
      </div>
      <div aria-hidden className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="block h-32 animate-pulse rounded-xl2 border border-brand-100 bg-brand-50" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}
