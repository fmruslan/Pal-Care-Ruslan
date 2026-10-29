import type { ReactNode } from "react";

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl break-words">
        {eyebrow && <p className="section-label mb-2">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
