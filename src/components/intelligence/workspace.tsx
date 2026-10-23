"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ChartNoAxesCombined, Layers2, ShieldCheck } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { IntelligenceSummary } from "./summary";
import {
  filterFacts,
  illustrativeDataset,
  stages,
  type IntelligenceDataset,
} from "@/lib/intelligence/model";
import { money } from "@/lib/demo/presentation";
const Studio = dynamic(
  () => import("./studio").then((m) => m.IntelligenceStudio),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="p-8">
        Loading local AG Studio evaluation…
      </p>
    ),
  },
);
export function IntelligenceWorkspace({
  recorded,
  studioAllowed,
}: {
  recorded: IntelligenceDataset;
  studioAllowed: boolean;
}) {
  const [mode, setMode] = useState<"recorded" | "illustrative">("recorded"),
    [stage, setStage] = useState("All"),
    [studio, setStudio] = useState(false);
  const data = mode === "recorded" ? recorded : illustrativeDataset,
    facts = filterFacts(data.facts, stage),
    example = mode === "illustrative";
  return (
    <>
      <section className="intelligence-wash mb-6 rounded-3xl border p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
            <ChartNoAxesCombined className="size-5" aria-hidden="true" />
            CareOS Intelligence · Evidence before action
          </p>
          <Badge tone="intelligence">Read-only commerce data</Badge>
        </div>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          A clearer picture.
          <br />A more thoughtful merchant.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Explore where value is found, what is still pending, and which
          outcomes have independent evidence. No dashboard or assistant can
          authorize money movement.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant={example ? "outline" : "default"}
            onClick={() => {
              setMode("recorded");
              setStage("All");
            }}
          >
            Recorded application data
          </Button>
          <Button
            variant={example ? "default" : "outline"}
            onClick={() => {
              setMode("illustrative");
              setStage("All");
            }}
          >
            Explore illustrative scenarios
          </Button>
        </div>
      </section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone={example ? "warning" : "blue"}>
            {example
              ? "Illustrative scenarios · not provider evidence"
              : "Recorded data · no sample scenarios"}
          </Badge>
          <p className="mt-3 text-sm text-muted-foreground">
            Workspace: {data.facts.length}{" "}
            {example ? "fictional cases" : "newest cases, maximum 500"}.
            Filtered widgets show only this window.
          </p>
          {!example && (
            <p className="mt-2 text-xs text-muted-foreground">
              Separate all-record totals: {data.totalCases} cases ·{" "}
              {money(data.allVerifiedMinor)} verified refunded. These totals are
              not affected by workspace filters.
            </p>
          )}
        </div>
        <label className="text-sm font-medium">
          Case stage
          <select
            className="mt-2 block min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {["All", ...stages].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p
        aria-label="Analytics filter scope"
        className="mb-4 text-sm text-muted-foreground"
      >
        Scope: {stage} · current bounded dataset. All-record totals above remain
        unfiltered; verified-only widgets further restrict this selection.
      </p>
      <details open={!studio} className="rounded-2xl border bg-card p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          Accessible summary · same selected data
        </summary>
        <div data-testid="intelligence-summary" className="mt-3">
          <IntelligenceSummary
            facts={facts}
            example={example}
            onStage={setStage}
          />
        </div>
      </details>
      {!facts.length && (
        <p role="status" className="mt-5 rounded-xl border bg-card p-5 text-sm">
          No adjustment cases in this selection. Zero is an honest result;
          explore the separate illustrative dataset to try the dashboard tools.
        </p>
      )}
      <section className="mt-7 rounded-3xl border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Layers2 className="size-5" aria-hidden="true" />
              AG Studio workbench
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Actual AG Studio 3.0 components, custom widgets and browser-local
              layout tools. Local evaluation retains the vendor watermark. No
              hosted model is active.
            </p>
          </div>
          {studioAllowed && (
            <Button variant="outline" onClick={() => setStudio((s) => !s)}>
              {studio ? "Close workbench" : "Open AG Studio"}
            </Button>
          )}
        </div>
        {!studioAllowed && (
          <p className="mt-4 text-sm text-warning">
            Studio evaluation requires explicit local enablement and a
            configured local origin. Production/judging access requires
            owner-provided license coverage through December 15, 2026.
          </p>
        )}
        {studio && (
          <div className="mt-5">
            <Studio
              key={mode}
              dataset={data}
              stage={stage}
              onStage={setStage}
            />
          </div>
        )}
      </section>
      <p className="mt-5 flex items-center gap-2 text-xs leading-6 text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        Layouts are browser-local presentation, not merchant authorization.
        Financial flags remain separate and disabled.
      </p>
    </>
  );
}
