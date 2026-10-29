import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getPurchaseActivity } from "../careos/activity-repository";
import { getKnowledge } from "../careos/knowledge-repository";
import { getDemoData } from "../demo/repository";
import { getGuardian } from "../price-guardian/runtime";
import { customerDataset, type CustomerDataset } from "./customer-model";

/** Required purchase reads fail visibly; optional evidence fails independently. */
export async function getCustomerIntelligence(): Promise<CustomerDataset> {
  let data: Awaited<ReturnType<typeof getDemoData>>;
  try {
    data = await getDemoData();
  } catch (error) {
    // Preserve Next.js request-time rendering signals; only real repository
    // failures become the sanitized unavailable state.
    unstable_rethrow(error);
    throw new Error(
      "Customer purchase records are unavailable. No fixture fallback was substituted.",
    );
  }
  const [knowledge, guardian, activity] = await Promise.allSettled([
    Promise.resolve().then(() => getKnowledge()),
    Promise.resolve().then(() => getGuardian()),
    Promise.resolve().then(() => getPurchaseActivity(data)),
  ]);
  return customerDataset(
    data,
    knowledge.status === "fulfilled" ? knowledge.value : [],
    guardian.status === "fulfilled" ? guardian.value : null,
    activity.status === "fulfilled"
      ? activity.value
      : { items: [], unavailable: ["Purchase activity"] },
    knowledge.status === "rejected" ? ["Product care"] : [],
  );
}
