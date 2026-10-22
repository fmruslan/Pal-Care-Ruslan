import Link from "next/link";
import { ArrowRight, Archive, FileText, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { CareIllustration } from "@/components/care-illustration";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <header className="flex items-center justify-between gap-4 py-6">
        <Brand />
        <Button asChild variant="outline">
          <Link href="/merchant">
            Merchant demo
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </header>
      <main id="main-content" className="py-10 sm:py-16">
        <div className="grid overflow-hidden rounded-[2rem] bg-primary p-8 text-white sm:p-14 md:grid-cols-[1.3fr_1fr] md:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[.2em] text-[#dce9c8]">
              MEET YOUR AFTERCARE SPACE
            </p>
            <h1 className="mt-6 font-display text-5xl leading-[1.12] tracking-tight sm:text-6xl">
              Everything you buy.
              <br />
              <span className="text-[#dce9c8]">Taken care of.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-8 text-white/80">
              A calmer home for the things you own. Keep purchase records close,
              and make room for better care after checkout.
            </p>
            <Button
              asChild
              className="mt-8 bg-[#e4edce] text-primary hover:bg-white"
            >
              <Link href="/dashboard">
                Explore customer demo
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <p className="mt-4 text-xs leading-6 text-white/80">
              No sign-up. Fictional sample records. No real money.
              <br />
              Stage 1 foundation · PayPal and AI not connected yet.
            </p>
          </div>
          <CareIllustration />
        </div>
        <div className="grid gap-8 py-12 sm:grid-cols-3">
          {[
            {
              icon: Archive,
              title: "One home for your purchases",
              body: "Explore three fictional products and their sample Purchase Twins.",
            },
            {
              icon: FileText,
              title: "A place for the paperwork",
              body: "Open sample receipts and a care card, together with their products.",
            },
            {
              icon: LockKeyhole,
              title: "Open to explore. Safe by design.",
              body: "Read-only dashboards. No personal data or unrestricted financial actions.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon
                className="mb-4 size-6 text-primary"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t py-7 text-xs leading-6 text-muted-foreground">
        Powered by CareOS. Independent hackathon project; not an official PayPal
        product, warranty, or insurance.
      </footer>
    </div>
  );
}
