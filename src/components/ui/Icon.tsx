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
    />
  );
}
