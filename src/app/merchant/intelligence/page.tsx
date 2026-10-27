import { headers } from "next/headers";
import { getDemoData } from "@/lib/demo/repository";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { recordedDataset } from "@/lib/intelligence/model";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { IntelligenceWorkspace } from "@/components/intelligence/workspace";
import { studioEvaluationAllowed } from "@/lib/intelligence/access";
export const metadata = { title: "CareOS Merchant Intelligence" };
export default async function IntelligencePage() {
  const [data, guardian, h] = await Promise.all([
    getDemoData(),
    getGuardian(),
    headers(),
  ]);
  // Explicit operator configuration plus local trusted origin; Host alone cannot enable evaluation.
  const local = studioEvaluationAllowed(process.env, h.get("host") ?? "");
  return (
    <Shell active="/merchant/intelligence" source={data.source} merchant>
      <PageHeading
        eyebrow="Everyday Goods · Merchant workspace"
        title="Intelligence, with evidence."
        description="Useful questions. Transparent numbers. Every outcome connected to its Purchase Twin."
      />
      <IntelligenceWorkspace
        recorded={recordedDataset(guardian)}
        studioAllowed={local}
        subscription={process.env.CAREOS_PROVIDER === "subscription"}
        live={
          local &&
          ((process.env.CAREOS_PROVIDER === "responses" &&
            process.env.CAREOS_LIVE_ENABLED === "true") ||
            (process.env.CAREOS_PROVIDER === "subscription" &&
              process.env.CAREOS_SUBSCRIPTION_ENABLED === "true"))
        }
      />
    </Shell>
  );
}
