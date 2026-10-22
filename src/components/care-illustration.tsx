import { FileText, Layers2, Sparkles, ArrowUpRight } from "lucide-react";
import { ProductArt } from "./product-art";
import { Badge } from "./ui/badge";

export function CareIllustration() {
  return (
    <div
      aria-hidden="true"
      className="relative isolate mx-auto w-full max-w-[490px] px-7 py-10 sm:px-10 sm:py-12"
    >
      <div className="absolute inset-3 -z-10 rounded-full border border-brand/15" />
      <div className="absolute inset-9 -z-10 rounded-full border border-dashed border-lavender/40" />
      <div className="passport-frame -rotate-3 shadow-lift">
        <div className="overflow-hidden rounded-[27px] bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Layers2 className="size-4 text-primary" />
              Purchase Twin
            </span>
            <Badge>Sample</Badge>
          </div>
          <ProductArt kind="headphones" />
          <div className="px-1 pt-5">
            <p className="text-xs font-medium text-muted-foreground">
              Forma · F-01
            </p>
            <p className="mt-2 text-xl font-semibold tracking-tight">
              Everyday headphones
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              An ownership story, all together.
            </p>
          </div>
          <div className="passport-divider mt-5 flex items-center justify-between gap-2 pt-4">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
              <FileText className="size-4" />
              Sample receipt
            </span>
            <ArrowUpRight className="size-4 text-primary" />
          </div>
        </div>
      </div>
      <div className="absolute -right-1 bottom-3 rotate-3 rounded-2xl border bg-card px-4 py-3 shadow-lift sm:right-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
          <Sparkles className="size-4" />
          CareOS
        </span>
        <p className="mt-1 text-xs text-muted-foreground">
          Intelligence, thoughtfully planned.
        </p>
      </div>
      <div className="absolute top-1 left-1 -rotate-6 rounded-2xl border bg-card px-4 py-3 shadow-card">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-primary">
          <span className="size-2 rounded-full bg-brand" />
          Everything, connected.
        </span>
      </div>
    </div>
  );
}
