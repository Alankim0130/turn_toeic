"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingText = "처리 중…",
  className,
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  variant?: "primary" | "secondary" | "dark";
}) {
  const { pending } = useFormStatus();
  const base = variant === "primary" ? "btn-primary" : variant === "dark" ? "btn-dark" : "btn-secondary";
  return (
    <button type="submit" disabled={pending} className={cn(base, "w-full sm:w-auto", className)} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
