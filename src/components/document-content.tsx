import type { DocumentView } from "@/lib/document-view";
import Link from "next/link";

export function DocumentContent({
  view,
  headingLevel = 2,
}: {
  view: DocumentView;
  headingLevel?: 2 | 3 | 4;
}) {
  const StatusHeading =
    headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "h4";
  const SectionHeading =
    headingLevel === 2 ? "h3" : headingLevel === 3 ? "h4" : "h5";
  return (
    <div
      className="space-y-5 text-sm leading-7"
      data-document-presentation={
        view.recognized ? "validated" : "unrecognized"
      }
    >
      <StatusHeading className="text-base font-semibold">
        {view.status}
      </StatusHeading>
      {view.facts.length > 0 && (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {view.facts.map((f) => (
            <div key={f.label}>
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {view.sections.map((s) => (
        <section key={s.title}>
          <SectionHeading className="font-semibold">{s.title}</SectionHeading>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {s.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      {view.next && (
        <p>
          <strong>What you can do: </strong>
          {view.next}
        </p>
      )}
      {view.actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline"
        >
          {action.label}
        </Link>
      ))}
      <p className="text-xs leading-6 text-muted-foreground">
        {view.limitation}
      </p>
    </div>
  );
}
