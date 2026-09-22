import { cn } from "@/lib/utils";

/**
 * 빈 프로필 이미지 — 사진이 없을 때의 기본 그림 (2026-09-22 Alan
 * "만약 프로필이 없다면 첫글자 하지말고 비어있는 프로필 이미지를 새로 하나 만들자!
 *  카톡은 등록안하면 회색의 뭔가가 있잖아. 그런느낌으로").
 *
 * 회색 동그라미 안에 사람 실루엣 하나다. **이름 첫 글자를 쓰지 않는다** —
 * 사진이 들어갈 자리에 글자를 넣으면 "사진을 안 올렸다" 가 아니라 "이게 내 사진이다" 로 읽힌다.
 * 헤더 오른쪽 로그인 표시와 서랍 내 정보의 **분홍 글자 동그라미(`Avatar`)는 그대로다** —
 * 그쪽은 사진 자리가 아니라 "지금 누구로 로그인했나" 를 알려 주는 표시다.
 *
 * **지킬 것**
 * - 실루엣은 **도형(인라인 SVG)** 이다 — `public/icons/*.png` 는 힉스필드 컬러 아이콘이라
 *   32px 로 줄이면 뭉개지고 글자 색을 따라오지 못한다 (줄 아이콘·재생 버튼과 같은 예외). 이모지는 쓰지 않는다.
 * - **가로·세로를 CSS 로 못박는다** — Tailwind preflight 의 `img`·`svg` 규칙 때문에 flex 안에서 늘어난다.
 * - 어깨는 **동그라미가 잘라 준다**(`overflow-hidden`) — 실루엣 아래쪽이 테두리에 닿아야 카톡처럼 보인다.
 */
export function EmptyAvatar({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-line text-mist", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" fill="currentColor" className="h-full w-full">
        <circle cx="24" cy="18" r="7.6" />
        <path d="M24 28.4c-8.9 0-16.1 6-16.1 13.4V48h32.2v-6.2c0-7.4-7.2-13.4-16.1-13.4Z" />
      </svg>
    </span>
  );
}
