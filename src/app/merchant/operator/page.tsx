import { getDemoData } from "@/lib/demo/repository";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { OperatorPanel } from "@/components/operator-panel";
export const metadata = { title: "Scoped merchant operator" };
export default async function OperatorPage() {
  const [data, guardian] = await Promise.all([getDemoData(), getGuardian()]);
  return (
    <Shell active="/merchant" source={data.source} merchant>
      <PageHeading
        eyebrow="Everyday Goods · Scoped authorization"
        title="Review. Approve. Verify."
        description="Private operator capabilities are separate from public dashboard access. Refund execution remains off until separately approved and configured."
      />
      <OperatorPanel overview={guardian} />
    </Shell>
  );
}
