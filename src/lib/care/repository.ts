import "server-only";
import { cache } from "react";
import { getDemoData, getSavedRecordsData } from "../demo/repository";
import { getKnowledge } from "../careos/knowledge-repository";
import { getPurchaseActivity } from "../careos/activity-repository";
import { getGuardian } from "../price-guardian/runtime";
import { careFeed } from "./model";
import { getSavedCare } from "./persistence-runtime";
import { getProtection } from "./protection/runtime";
import { emptyProtection } from "./protection/contracts";

export const getCareFeed = cache(async (twinId?: string) => {
  const data = twinId ? await getDemoData(twinId) : await getSavedRecordsData(); // Exact detail never depends on the list window.
  const [knowledge, guardian, activity, savedCare, protection] =
    await Promise.allSettled([
      getKnowledge(),
      getGuardian(twinId),
      getPurchaseActivity(data, twinId),
      getSavedCare(twinId),
      getProtection(twinId),
    ]);
  return careFeed({
    data,
    knowledge: knowledge.status === "fulfilled" ? knowledge.value : [],
    guardian: guardian.status === "fulfilled" ? guardian.value : null,
    savedCare: savedCare.status === "fulfilled" ? savedCare.value : undefined,
    persistenceEnabled: process.env.CARE_RECORDS_ENABLED === "true",
    scheduled: process.env.CARE_WATCH_SCHEDULE_ENABLED === "true",
    protection: {
      ...(protection.status === "fulfilled"
        ? protection.value
        : { saved: { ...emptyProtection(), complete: false }, inputs: [] }),
      scheduled: process.env.CARE_PROTECTION_SCHEDULE_ENABLED === "true",
    },
    activity:
      activity.status === "fulfilled"
        ? activity.value
        : { items: [], unavailable: ["Purchase activity"] },
    unavailable: [
      ...(knowledge.status === "rejected" ? ["Product care"] : []),
      ...(savedCare.status === "rejected" ? ["Care tracking"] : []),
      ...(protection.status === "rejected" ? ["Price protection"] : []),
    ],
  });
});
