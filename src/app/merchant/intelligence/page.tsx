import { headers } from "next/headers";
import { getDemoData } from "@/lib/demo/repository";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { recordedDataset } from "@/lib/intelligence/model";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { IntelligenceWorkspace } from "@/components/intelligence/workspace";
export const metadata = { title: "CareOS Merchant Intelligence" };
export default async function IntelligencePage() {
  const [data, guardian, h] = await Promise.all([
    getDemoData(),
    getGuardian(),
    headers(),
  ]);
  // Host is a local-evaluation UX gate, never financial authorization or a licence.
  const host = h.get("host") ?? "";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
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
      />
    </Shell>
  );
}
