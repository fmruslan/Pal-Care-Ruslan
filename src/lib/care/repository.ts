import "server-only";
import { cache } from "react";
import { getSavedRecordsData } from "../demo/repository";
import { getKnowledge } from "../careos/knowledge-repository";
import { getPurchaseActivity } from "../careos/activity-repository";
import { getGuardian } from "../price-guardian/runtime";
import { careFeed } from "./model";
import { getSavedCare } from "./persistence-runtime";

export const getCareFeed = cache(async () => {
  const data = await getSavedRecordsData(); // Required records fail visibly.
  const [knowledge, guardian, activity, savedCare] = await Promise.allSettled([
    getKnowledge(),
    getGuardian(),
    getPurchaseActivity(data),
    getSavedCare(),
  ]);
  return careFeed({
    data,
    knowledge: knowledge.status === "fulfilled" ? knowledge.value : [],
    guardian: guardian.status === "fulfilled" ? guardian.value : null,
    savedCare: savedCare.status === "fulfilled" ? savedCare.value : undefined,
    persistenceEnabled: process.env.CARE_RECORDS_ENABLED === "true",
    scheduled: process.env.CARE_WATCH_SCHEDULE_ENABLED === "true",
    activity:
      activity.status === "fulfilled"
        ? activity.value
        : { items: [], unavailable: ["Purchase activity"] },
    unavailable: [
      ...(knowledge.status === "rejected" ? ["Product care"] : []),
      ...(savedCare.status === "rejected" ? ["Care tracking"] : []),
    ],
  });
});
