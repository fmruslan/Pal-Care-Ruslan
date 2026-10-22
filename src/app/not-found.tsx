import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto max-w-lg px-5 py-24">
      <p className="text-sm text-muted-foreground">404 · Not found</p>
      <h1 className="mt-4 font-display text-4xl">Nothing to see here.</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        This page or sample purchase isn’t available.
      </p>
      <Button asChild className="mt-7">
        <Link href="/dashboard">Back to your care space</Link>
      </Button>
    </main>
  );
}
