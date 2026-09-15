import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const SRC = {
  default: "/brand/logo.png",
  pink: "/brand/logo-pink.png",
  alt: "/brand/logo-alt.png",
} as const;

export function Logo({
  variant = "default",
  height = 34,
  className,
  link = true,
  priority,
}: {
  variant?: keyof typeof SRC;
  height?: number;
  className?: string;
  link?: boolean;
  priority?: boolean;
}) {
  // 로고 원본 비율 ≈ 3.1 : 1 (trim 후)
  const width = Math.round(height * 3.1);
  const img = (
    <Image
      src={SRC[variant]}
      alt="역전토익"
      width={width}
      height={height}
      priority={priority}
      className={cn("h-auto select-none", className)}
      style={{ width, height: "auto" }}
    />
  );
  return link ? (
    <Link href="/" aria-label="역전토익 홈" className="inline-flex items-center">
      {img}
    </Link>
  ) : (
    img
  );
}

export function Symbol({ size = 28, className }: { size?: number; className?: string }) {
  // 심볼 원본은 정사각형. flex 안에서 세로로 늘어나지 않도록 크기를 CSS 로 못박는다
  return (
    <Image
      src="/brand/symbol.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("select-none", className)}
      style={{ width: size, height: size }}
    />
  );
}
