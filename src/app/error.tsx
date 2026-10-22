"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="mx-auto max-w-lg px-5 py-24">
      <h1 className="font-display text-4xl">A moment to reconnect.</h1>
      <p className="mt-5 text-sm leading-7 text-muted-foreground">
        We couldn’t load your care space. Please try again. If this continues,
        ask the administrator to check the database connection and migrations.
      </p>
      <Button onClick={reset} className="mt-7">
        Try again
      </Button>
    </main>
  );
}
