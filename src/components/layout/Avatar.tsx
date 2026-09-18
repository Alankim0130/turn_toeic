import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * 로그인한 사람 표시 — 이름 첫 글자를 담은 분홍 동그라미 (2026-09-18 Alan "우측에는 로그인 표시").
 * 사진은 받지 않으므로 글자로 만든다. 이름이 비어 있으면(간편 로그인 미완성) 프로필 아이콘.
 * 헤더 오른쪽과 햄버거 메뉴 머리가 같은 모양을 쓴다.
 */
export function Avatar({ name, size = 36, className }: { name: string | null; size?: number; className?: string }) {
  const initial = (name ?? "").trim().charAt(0);
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 select-none items-center justify-center rounded-full bg-brand-500 font-black leading-none text-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initial || <Icon name="profile" size={Math.round(size * 0.58)} className="brightness-0 invert" />}
    </span>
  );
}
