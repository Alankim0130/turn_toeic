"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingText = "처리 중…",
  className,
  variant = "primary",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  variant?: "primary" | "secondary" | "dark";
  /** 누를 수 없는 상태 (정원 마감 등). 보내는 중에는 어차피 잠긴다 */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const base = variant === "primary" ? "btn-primary" : variant === "dark" ? "btn-dark" : "btn-secondary";
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(base, "w-full sm:w-auto", disabled && "!cursor-not-allowed opacity-50", className)}
      aria-busy={pending}
    >
      {pending ? pendingText : children}
    </button>
  );
}
