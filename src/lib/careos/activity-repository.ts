import "server-only";
import type { DemoData } from "../../db/schema";
import { getGuardian } from "../price-guardian/runtime";
import { getRecallActivities } from "../safety/runtime";
import { projectActivity } from "./activity";

export async function getPurchaseActivity(data: DemoData, twinId?: string) {
  const [guardian, recall] = await Promise.allSettled([
    getGuardian(twinId),
    getRecallActivities(twinId ? [twinId] : data.twins.map((t) => t.id)),
  ]);
  return projectActivity(
    data,
    guardian.status === "fulfilled" ? guardian.value.cases : [],
    recall.status === "fulfilled" ? recall.value : [],
    [
      ...(guardian.status === "rejected" ? ["Price Guardian"] : []),
      ...(recall.status === "rejected" ? ["Recall Guardian"] : []),
    ],
  );
}
