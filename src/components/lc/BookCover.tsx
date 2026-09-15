import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * 교재 표지. 책처럼 보이도록 그림자·책등 음영·은은한 광택을 얹는다.
 * src 는 /files/textbook/{id} (비공개 서명 URL 로 리다이렉트) 라 next/image 최적화를 쓰지 않는다.
 */
export function BookCover({
  src,
  alt,
  size = "lg",
  selected = false,
  className,
}: {
  src: string | null;
  alt: string;
  size?: "sm" | "lg";
  selected?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[3/4] w-full overflow-hidden bg-surface ring-1 ring-black/5 transition duration-300",
        size === "lg" ? "rounded-lg shadow-[0_24px_48px_-22px_rgba(23,18,31,0.55)]" : "rounded shadow-[0_6px_14px_-8px_rgba(23,18,31,0.5)]",
        selected && "ring-4 ring-brand-400",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand-50 via-paper to-surface px-2 text-center">
          <Icon name="textbook" size={size === "lg" ? 44 : 20} className="opacity-70" />
          {size === "lg" && <span className="text-xs font-bold text-mist">표지 준비 중</span>}
        </div>
      )}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/25 via-black/5 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/25" />
    </div>
  );
}
