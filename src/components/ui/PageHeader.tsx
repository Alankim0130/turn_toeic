import { Icon, type IconName } from "./Icon";

export function PageHeader({
  icon,
  title,
  description,
  children,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100">
            <Icon name={icon} size={30} />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate sm:text-base">{description}</p>}
        </div>
      </div>
      {children && <div className="flex shrink-0 gap-2">{children}</div>}
    </header>
  );
}
