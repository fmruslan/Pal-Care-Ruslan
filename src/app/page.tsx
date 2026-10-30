import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  Layers2,
  ShieldCheck,
  Sparkles,
  HeartHandshake,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CareIllustration } from "@/components/care-illustration";
import { ThemeSelector } from "@/components/theme-selector";

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <Brand />
        <nav
          aria-label="Website navigation"
          className="flex max-w-full flex-wrap items-center gap-2 sm:gap-4"
        >
          <Link
            href="/insights"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-intelligence-foreground"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Insights
          </Link>
          <ThemeSelector />
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">
              Explore demo
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </nav>
      </header>
      <main id="main-content">
        <section
          className="hero-wash relative grid items-center gap-7 overflow-hidden rounded-[32px] border px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.15fr_1fr] lg:px-12 lg:py-16"
          aria-labelledby="hero-title"
        >
          <div className="relative z-10 min-w-0">
            <Badge tone="blue">
              <HeartHandshake className="size-3.5" aria-hidden="true" />A better
              after checkout
            </Badge>
            <h1
              id="hero-title"
              className="mt-6 text-[clamp(2.75rem,5.8vw,5.25rem)] leading-[1.06] font-semibold tracking-[-.065em] break-words"
            >
              Everything you own.
              <span className="mt-1 block text-primary">All cared for.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
              Your purchases, paperwork, and useful next steps—together. Meet a
              purchase companion designed for life after checkout.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild className="min-w-0 max-w-full">
                <Link href="/dashboard">
                  <span className="min-w-0 break-words">Explore Pal Care</span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-w-0 max-w-full">
                <Link href="/vault/00000000-0000-4000-8000-000000000201">
                  <span className="min-w-0 break-words">
                    Meet a Purchase Twin
                  </span>
                  <Layers2 aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
              No sign-up. Labeled sample and Sandbox records. No real money.
            </p>
          </div>
          <CareIllustration />
        </section>
        <section aria-labelledby="passport-story" className="py-16 sm:py-20">
          <div className="mx-auto mb-9 max-w-2xl text-center">
            <p className="section-label">A little less to keep track of.</p>
            <h2
              id="passport-story"
              className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Your product has a story.
              <br />
              Give it a home.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              A Purchase Twin brings a product’s details, paperwork, and history
              together. One thoughtful place to start, every time you need it.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: Layers2,
                number: "01",
                title: "The things you own",
                text: "Open a Purchase Twin for product details, saved paperwork, and history. Sample ownership and verified Sandbox purchases stay clearly distinct.",
                href: "/vault",
                action: "Explore purchases",
              },
              {
                icon: FileText,
                number: "02",
                title: "The details you need",
                text: "Find sample receipts and available documents without digging through email. Real manufacturer manuals are never invented.",
                href: "/documents",
                action: "Find documents",
              },
              {
                icon: Sparkles,
                number: "03",
                title: "A clearer next step",
                text: "Read purchase Insights built from saved records and available evidence. See the source and its limits before deciding what to explore next.",
                href: "/insights",
                action: "Explore Insights",
              },
            ].map(({ icon: Icon, number, title, text, href, action }) => (
              <Card key={number} className="motion-card flex flex-col">
                <div className="flex items-center justify-between">
                  <span
                    className={`flex size-12 items-center justify-center rounded-2xl ${number === "03" ? "bg-intelligence text-intelligence-foreground" : "bg-secondary text-primary"}`}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {number}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {text}
                </p>
                <Link
                  href={href}
                  className={`mt-auto inline-flex min-h-11 items-center gap-2 pt-5 text-sm font-semibold ${number === "03" ? "text-intelligence-foreground" : "text-primary"}`}
                >
                  <span className="min-w-0 break-words">{action}</span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              </Card>
            ))}
          </div>
        </section>
        <section
          className="mb-12 flex flex-wrap items-center justify-between gap-6 border-t pt-8"
          aria-labelledby="careos-story"
        >
          <div className="max-w-xl">
            <h2
              id="careos-story"
              className="text-xl font-semibold tracking-tight"
            >
              Clear sources. Clear limits.
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Insights is read-only. Sample records are fictional, available
              guidance is source-labeled, and a verified Sandbox payment does
              not establish warranty coverage or product safety.
            </p>
          </div>
          <Button asChild variant="outline" className="min-w-0 max-w-full">
            <Link href="/shop">
              <span className="min-w-0 break-words">
                Visit the Sandbox shop
              </span>
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </main>
      <footer className="flex flex-wrap items-start justify-between gap-5 border-t py-8 text-sm text-muted-foreground">
        <div>
          <Brand />
          <p className="mt-3">Everything you own. All cared for.</p>
        </div>
        <p className="max-w-md text-sm leading-7">
          Independent PayPal AI Hackathon project. Not an official PayPal
          product, warranty, insurance, or coverage promise. CareOS fixture
          answers are labeled demonstrations; real AI is available only in the
          authorized private preview. Live monitoring and financial activation
          remain separate.
        </p>
      </footer>
    </div>
  );
}
