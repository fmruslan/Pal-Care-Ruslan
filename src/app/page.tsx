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
          className="flex items-center gap-2 sm:gap-4"
        >
          <Link
            href="/merchant"
            className="hidden min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-primary sm:inline-flex"
          >
            For merchants
            <ArrowUpRight className="ml-1 size-4" aria-hidden="true" />
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
          <div className="relative z-10">
            <Badge tone="blue">
              <HeartHandshake className="size-3.5" aria-hidden="true" />A better
              after checkout
            </Badge>
            <h1
              id="hero-title"
              className="mt-6 text-[clamp(2.75rem,5.8vw,5.25rem)] font-semibold leading-[1.06] tracking-[-.065em]"
            >
              Everything you buy.
              <span className="mt-1 block text-primary">Taken care of.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
              Meet your purchase companion. A home for what you own, designed
              for smarter care after checkout.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href="/dashboard">
                  Explore Pal Care
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/vault/00000000-0000-4000-8000-000000000201">
                  Meet a Purchase Twin
                  <Layers2 aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
              No sign-up. Fictional records. No real money.
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
                text: "Explore a digital product passport for each fictional demo purchase. Product identity, purchase details, and source labels stay together.",
              },
              {
                icon: FileText,
                number: "02",
                title: "The details you need",
                text: "Find sample receipts and available documents without digging through email. Real manufacturer manuals are never invented.",
              },
              {
                icon: Sparkles,
                number: "03",
                title: "The care that comes next",
                text: "CareOS is the planned intelligence layer for product guidance, price opportunities and safety awareness. AI and monitoring are not active yet.",
              },
            ].map(({ icon: Icon, number, title, text }) => (
              <Card key={number} className="motion-card">
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
              </Card>
            ))}
          </div>
        </section>
        <section
          className="intelligence-wash mb-16 flex flex-wrap items-center justify-between gap-7 rounded-[28px] border p-7 sm:p-10"
          aria-labelledby="careos-story"
        >
          <div className="max-w-xl">
            <Badge tone="intelligence">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Powered by CareOS · Intelligence planned
            </Badge>
            <h2
              id="careos-story"
              className="mt-5 text-3xl font-semibold tracking-tight"
            >
              Less paperwork.
              <br />
              More peace of mind.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Start with the purchase vault today. Discover our vision for
              meaningful care throughout product ownership—not just another
              checkout.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/shop">
              Visit the Sandbox shop
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </main>
      <footer className="flex flex-wrap items-start justify-between gap-5 border-t py-8 text-sm text-muted-foreground">
        <div>
          <Brand />
          <p className="mt-3">Everything you buy. Taken care of.</p>
        </div>
        <p className="max-w-md text-sm leading-7">
          Independent PayPal AI Hackathon project. Not an official PayPal
          product, warranty, insurance, or coverage promise. AI, refunds, and
          monitoring remain planned.
        </p>
      </footer>
    </div>
  );
}
