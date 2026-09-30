import type { ReactNode } from "react";
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <h2 className="text-base font-medium">{title}</h2>
      {description && (
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
