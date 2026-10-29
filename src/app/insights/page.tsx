import { headers } from "next/headers";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { CustomerWorkspace } from "@/components/intelligence/customer-workspace";
import { getCustomerIntelligence } from "@/lib/intelligence/customer-repository";
import { studioEvaluationAllowed } from "@/lib/intelligence/access";

export const metadata = { title: "Personal Purchase Intelligence" };
export default async function InsightsPage() {
  const [dataset, h] = await Promise.all([
    getCustomerIntelligence(),
    headers(),
  ]);
  const allowed = studioEvaluationAllowed(process.env, h.get("host") ?? "");
  const live =
    allowed &&
    ((process.env.CAREOS_PROVIDER === "responses" &&
      process.env.CAREOS_LIVE_ENABLED === "true") ||
      (process.env.CAREOS_PROVIDER === "subscription" &&
        process.env.CAREOS_SUBSCRIPTION_ENABLED === "true"));
  return (
    <Shell active="/insights" source={dataset.source}>
      <PageHeading
        eyebrow="Your purchases. A clearer picture."
        title="Personal Purchase Intelligence"
        description="Less to keep track of. More to understand and take care of."
      />
      <CustomerWorkspace
        dataset={dataset}
        studioAllowed={allowed}
        live={live}
      />
    </Shell>
  );
}
