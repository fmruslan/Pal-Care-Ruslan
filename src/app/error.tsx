"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StandaloneShell } from "@/components/standalone-shell";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <StandaloneShell>
      <Card className="hero-wash py-12">
        <span className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <WifiOff className="size-6" aria-hidden="true" />
        </span>
        <h1 className="page-title">A moment to reconnect.</h1>
        <p className="mt-5 max-w-lg text-base leading-8 text-muted-foreground">
          We couldn’t load your care space. Please try again. If this continues,
          ask the administrator to check the database connection and migrations.
        </p>
        <Button onClick={reset} className="mt-7">
          Try again
        </Button>
      </Card>
    </StandaloneShell>
  );
}
