import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

export function Alert({
  kind = "info",
  title,
  children,
  className,
}: {
  kind?: "success" | "warning" | "info";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    success: "border-brand-200 bg-brand-50 text-ink",
    warning: "border-amber-200 bg-amber-50 text-ink",
    info: "border-line bg-paper text-ink",
  }[kind];
  const icon = kind === "success" ? "success" : kind === "warning" ? "warning" : "bolt";
  return (
    <div role={kind === "warning" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl2 border p-4", styles, className)}>
      <Icon name={icon} size={28} className="mt-0.5" />
      <div className="min-w-0 text-sm leading-relaxed">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-slate" : ""}>{children}</div>}
      </div>
    </div>
  );
}
