import Link from "next/link";
import { Archive, ArrowRight, FileText, HeartHandshake } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CareIllustration } from "@/components/care-illustration";
import { TwinList } from "@/components/vault";
import { Events } from "@/components/events";

export const metadata = { title: "Your care space" };

export default async function Dashboard() {
  const data = await getDemoData();
  return (
    <Shell active="/dashboard" source={data.source}>
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">
          A LITTLE LESS TO THINK ABOUT
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
          Welcome to your care space, {data.customer.name}.
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          The things you love. The details that matter. All together.
        </p>
      </div>
      <section
        aria-labelledby="hero-title"
        className="grid overflow-hidden rounded-3xl bg-primary px-7 py-7 text-white sm:px-9 md:grid-cols-[1.3fr_1fr] md:items-center"
      >
        <div>
          <span className="inline-flex rounded-full border border-white/25 px-3 py-1.5 text-[10px] font-semibold tracking-[.15em]">
            YOUR PURCHASE, JUST THE BEGINNING
          </span>
          <h2
            id="hero-title"
            className="mt-5 max-w-lg font-display text-3xl leading-tight sm:text-4xl"
          >
            Good things deserve
            <br />
            <span className="text-[#dce9c8]">a little extra care.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/80">
            Explore a Purchase Twin: one home for a product’s story, paperwork,
            and what comes next.
          </p>
          <Button
            asChild
            className="mt-6 bg-[#e4edce] text-primary hover:bg-white"
          >
            <Link href="/vault">
              Open purchase vault
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="hidden sm:block">
          <CareIllustration />
        </div>
      </section>
      <div className="my-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            icon: Archive,
            value: data.twins.length,
            label: "Purchase Twins · samples + sandbox",
          },
          {
            icon: FileText,
            value: data.documents.length,
            label: "Documents · source labeled",
          },
          {
            icon: HeartHandshake,
            value: data.twins.filter((twin) => twin.origin === "sandbox")
              .length,
            label: "Verified sandbox purchases",
          },
        ].map(({ icon: Icon, value, label }) => (
          <Card key={label} className="flex items-center gap-4 py-5">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary">
              <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-semibold tracking-tight">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          </Card>
        ))}
      </div>
      <section aria-labelledby="purchases-title">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="purchases-title" className="font-display text-2xl">
            Your purchase vault
          </h2>
          <Link
            href="/vault"
            className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold"
          >
            View all
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <TwinList data={data} />
      </section>
      <section aria-labelledby="care-title" className="mt-9">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 id="care-title" className="font-display text-2xl">
            A little care, along the way.
          </h2>
          <span className="text-xs text-muted-foreground">
            Source-labeled history · no live care monitoring
          </span>
        </div>
        <Events events={data.events} />
      </section>
    </Shell>
  );
}
