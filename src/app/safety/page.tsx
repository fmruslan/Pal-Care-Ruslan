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
import { findTwin, recordIdSchema, displayDate } from "@/lib/demo/presentation";
import { CareContextRegistration } from "@/components/careos/provider";
export const metadata = { title: "Recall information" };
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
    <Shell active="/safety" source={data.source}>
      <CareContextRegistration context={journey.context} />
      {journey.context && (
        <p className="mb-5 text-sm" role="note">
          For {journey.context.name} · {journey.context.model}.{" "}
          <Link
            href={journey.back}
            className="inline-flex min-h-11 items-center font-semibold text-primary"
          >
            Back to product →
          </Link>
        </p>
      )}
      <PageHeading
        eyebrow="Pal Care · Recall information"
        title="Check the official recall notice"
        description="This view covers one reviewed CPSC notice. Check the exact model and identifiers before deciding whether it applies to your product. No match does not prove a product is safe."
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <Badge tone="blue">Official CPSC notice · 24-159</Badge>
        <Badge>
          {safety.mode === "bundled_official_snapshot"
            ? "Saved official notice · not a live check"
            : "Saved copy from the official source"}
        </Badge>
        <Badge tone="warning">Limited coverage · one reviewed notice</Badge>
      </div>
      {safety.unavailable && (
        <p
          role="alert"
          className="mb-5 rounded-xl border p-4 text-sm text-warning"
        >
          The latest source check failed. You can still read the saved notice,
          but it does not confirm current recall status or product safety.
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
            A limited recall example, not a full safety check
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Forma and Hearth products are fictional. No recall is asserted for
            them. This view checks one reviewed CPSC notice, not the entire
            recall database, and absence of a match is not proof of safety.
          </p>
          <Link
            href="/safety?example=insignia"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            View a fictional product example with a real notice →
          </Link>
        </Card>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="section-title">{source.Title}</h2>
          <p className="mt-4 text-sm leading-7">{source.Description}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            Published {displayDate(source.RecallDate)} · Official recall ID{" "}
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
              Read CPSC’s remedy instructions
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
      <details className="mt-6 rounded-2xl border bg-card p-5">
        <summary className="min-h-11 cursor-pointer font-semibold">
          View source details
        </summary>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Copy saved</dt>
            <dd>{displayDate(retrievedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">What this check covers</dt>
            <dd>
              One historical official notice. Recalls are not continuously
              monitored, and your physical product’s identifiers have not been
              verified.
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Saved source fingerprint · SHA-256
            </dt>
            <dd className="mt-1 break-all font-mono text-xs">{hash}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Matching method</dt>
            <dd>
              cpsc-exact-v1 · if the source changes, its match to this product
              needs to be reviewed again.
            </dd>
          </div>
        </dl>
      </details>
    </Shell>
  );
}
