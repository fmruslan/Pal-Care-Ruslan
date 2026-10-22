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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-3xl">
        {eyebrow && <p className="section-label mb-3">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
