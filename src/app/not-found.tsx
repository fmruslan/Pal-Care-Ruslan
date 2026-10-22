import Link from "next/link";
import { Compass, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StandaloneShell } from "@/components/standalone-shell";

export default function NotFound() {
  return (
    <StandaloneShell>
      <Card className="hero-wash py-12">
        <Compass className="mb-6 size-9 text-primary" aria-hidden="true" />
        <p className="mb-4 text-sm font-medium text-muted-foreground">
          404 · Not found
        </p>
        <h1 className="page-title">Nothing to see here.</h1>
        <p className="mt-5 text-base leading-7 text-muted-foreground">
          This page or purchase isn’t available in the current demo view.
        </p>
        <Button asChild className="mt-7">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" />
            Back to your care space
          </Link>
        </Button>
      </Card>
    </StandaloneShell>
  );
}
