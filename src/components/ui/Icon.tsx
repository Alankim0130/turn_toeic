import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * 힉스필드로 제작한 아이콘 (public/icons/*.png). 이모지 대신 항상 이 컴포넌트를 쓴다.
 * 새 아이콘이 필요하면 같은 스타일로 생성해 public/icons 에 추가한다.
 */
export type IconName =
  | "home" | "verify" | "live" | "textbook" | "replay" | "study" | "contact" | "admin"
  | "students" | "orders" | "analytics" | "timeslot" | "profile" | "calendar" | "upload"
  | "success" | "warning" | "logout" | "login" | "location" | "rank1" | "target" | "bolt"
  | "offline" | "online" | "vocab" | "homework" | "headphones" | "download"
  | "lock" | "exclusive" | "bell";

export function Icon({
  name,
  size = 24,
  className,
  priority,
}: {
  name: IconName | string;
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={`/icons/${name}.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority={priority}
      className={cn("inline-block shrink-0 select-none", className)}
      /**
       * 아이콘 원본은 정사각형이다. Tailwind preflight 가 img 에 height:auto 를 주기 때문에
       * flex 컨테이너(기본 align-items:stretch) 안에서는 세로로 늘어나 찌그러진다.
       * 가로·세로를 CSS 로 못박아 어디에 놓아도 비율이 그대로 유지되게 한다.
       */
      style={{ width: size, height: size }}
    />
  );
}
