import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function EmptyState({
  icon = "warning",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <Icon name={icon} size={56} />
      <p className="mt-4 text-lg font-bold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate">{description}</p>}
      {action && (
        <Link href={action.href} className="btn-primary mt-6">
          {action.label}
        </Link>
      )}
    </div>
  );
}
