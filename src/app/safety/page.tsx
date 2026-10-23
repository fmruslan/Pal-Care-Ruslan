import Link from "next/link";
import { getDemoData } from "@/lib/demo/repository";
import { getSafety } from "@/lib/safety/runtime";
import { assess } from "@/lib/safety/service";
import { fictionalOwnership } from "@/lib/safety/reference";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SafetyCard } from "@/components/safety-card";
import { notFound } from "next/navigation";
import { journeyContext, type JourneyQuery } from "@/lib/careos/journey";
import { findTwin, recordIdSchema } from "@/lib/demo/presentation";
import { CareContextRegistration } from "@/components/careos/provider";
export const metadata = { title: "Recall Guardian" };
export default async function SafetyPage({
  searchParams,
}: {
  searchParams: Promise<JourneyQuery>;
}) {
  const query = await searchParams;
  if (query.twinId && !recordIdSchema.safeParse(query.twinId).success)
    notFound();
  const [data, safety] = await Promise.all([
    getDemoData(query.twinId),
    getSafety(),
  ]);
  const journey = journeyContext(data, query);
  if (!journey) notFound();
  const record = query.twinId ? findTwin(data, query.twinId) : undefined;
  const example = query.example === "insignia",
    { source, hash, retrievedAt } = safety.snapshot;
  return (
    <Shell active="/vault" source={data.source}>
      <CareContextRegistration context={journey.context} />
      {journey.context && (
        <p className="mb-5 text-sm" role="note">
          Discussing {journey.context.name} · {journey.context.model}.{" "}
          <Link
            href={journey.back}
            className="inline-flex min-h-11 items-center font-semibold text-primary"
          >
            Return to source product →
          </Link>
        </p>
      )}
      <PageHeading
        eyebrow="CareOS · Recall Guardian"
        title="Safety starts with evidence."
        description="Official notices. Exact product identifiers. Clear uncertainty—never a blanket promise that a product is safe."
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <Badge tone="blue">Official CPSC notice · 24-159</Badge>
        <Badge>
          {safety.mode === "bundled_official_snapshot"
            ? "Bundled official snapshot · not a live check"
            : "Saved official API retrieval"}
        </Badge>
        <Badge tone="warning">Limited coverage · one reviewed notice</Badge>
      </div>
      {safety.unavailable && (
        <p
          role="alert"
          className="mb-5 rounded-xl border p-4 text-sm text-warning"
        >
          The latest source check failed. Saved evidence remains available; no
          current all-clear is established.
        </p>
      )}
      {record ? (
        <div className="mb-6">
          <SafetyCard
            decision={assess(
              { ...record.product, identifiersVerified: false },
              hash,
            )}
            twinId={record.twin.id}
          />
        </div>
      ) : example ? (
        <div className="mb-6">
          <SafetyCard decision={assess(fictionalOwnership, hash)} example />
          <p className="mt-3 text-sm text-muted-foreground">
            This ownership example is fictional and has no PayPal transaction.
            It demonstrates a real official notice; it is not attached to your
            existing purchases.
          </p>
        </div>
      ) : (
        <Card className="mb-6">
          <h2 className="section-title">
            Your existing purchases are unchanged.
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Forma and Hearth products are fictional. No recall is asserted for
            them. This release checks one reviewed CPSC notice, not the entire
            recall database, and absence of a match is not proof of safety.
          </p>
          <Link
            href="/safety?example=insignia"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            Explore fictional ownership with real recall evidence →
          </Link>
        </Card>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="section-title">{source.Title}</h2>
          <p className="mt-4 text-sm leading-7">{source.Description}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            Published {source.RecallDate.slice(0, 10)} · Official API recall ID{" "}
            {source.RecallID}
          </p>
          <a
            href={new URL(source.URL).href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            Read the official CPSC notice ↗
          </a>
        </Card>
        <Card className="intelligence-wash">
          <h2 className="section-title">What the official notice says</h2>
          <h3 className="mt-4 text-sm font-semibold">
            Hazard · official source text
          </h3>
          {source.Hazards.map((h, i) => (
            <p key={i} className="mt-2 text-sm leading-7">
              {h.Name}
            </p>
          ))}
          <p className="mt-4 text-sm font-semibold">
            For the recalled models, CPSC says to stop using the product. Follow
            the official notice and recall administrator for next steps; Pal
            Care does not authorize a refund or supply disposal/repair
            instructions.
          </p>
          <details className="mt-4">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              Read the attributed official remedy
            </summary>
            {source.Remedies.map((r, i) => (
              <blockquote
                key={i}
                className="mt-3 border-l-2 pl-4 text-sm leading-7 text-muted-foreground"
              >
                {r.Name}
              </blockquote>
            ))}
          </details>
          <Link
            href={
              journey.context && !journey.category
                ? `${journey.back}#documents-heading`
                : `/replacements?${journey.context ? journey.query : "category=air-fryer"}`
            }
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            {journey.context && !journey.category
              ? "Review this product’s documents →"
              : "Consider care and replacement options →"}
          </Link>
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="section-title">Evidence passport</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Retrieved</dt>
            <dd>{retrievedAt}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Scope</dt>
            <dd>
              One official historical notice. No continuous monitoring or
              physical identity verification.
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Revision fingerprint · SHA-256
            </dt>
            <dd className="mt-1 break-all font-mono text-xs">{hash}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Matching engine</dt>
            <dd>
              cpsc-exact-v1 · a changed source requires applicability review.
            </dd>
          </div>
        </dl>
      </Card>
    </Shell>
  );
}
