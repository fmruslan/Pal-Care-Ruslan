import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { getEnvironment } from "../../config";
import { validAppOrigin } from "../../origin";
import { runtimeDatabase } from "../../../db/runtime";
import { runtimeWriterUrl } from "../../../db/authority";
import { MemoryStore, type ConversationStore } from "../store";
import { PostgresStore } from "../postgres-store";
import { CareError } from "../contracts";
import { digest, validCapability } from "../security";
import { northReviewPresentation } from "../../private-preview-origin";
import { StandingOwner } from "../standing-owner";
import { standingOwnerMode, standingProof } from "../standing-runtime";

const review = northReviewPresentation(process.env);
export const RECORDS_COOKIE = review
  ? "palcare-north-review-records"
  : "palcare-records";
// A namespaced owner is incompatible with care/Insights conversation authority,
// even if a visitor copies a known conversation ID or cookie between endpoints.
export const recordsOwner = (token: string) =>
  digest(`${review ? "records-north-review-v1" : "records-v1"}:${token}`);
const shared = globalThis as unknown as {
  northRecordsMemory?: MemoryStore;
  northRecordsPostgres?: PostgresStore;
};
export function recordsRuntime() {
  const origin = process.env.APP_ORIGIN;
  if (!validAppOrigin(origin))
    throw new CareError("careos_origin_not_configured");
  let store: ConversationStore;
  if (getEnvironment().dataSource === "database") {
    shared.northRecordsPostgres ??= new PostgresStore(
      runtimeDatabase(runtimeWriterUrl("CAREOS_DATABASE_URL")).pool,
      undefined,
      true,
      Date.now,
      async (owner) => {
        if (
          !standingOwnerMode() ||
          process.env.CAREOS_STANDING_AI_ENABLED !== "true"
        )
          return false;
        const token = (await cookies()).get(RECORDS_COOKIE)?.value;
        if (!validCapability(token) || recordsOwner(token) !== owner)
          return false;
        return new StandingOwner().evaluationQuotaAccess(
          await standingProof(),
          true,
        );
      },
    );
    store = shared.northRecordsPostgres;
  } else store = shared.northRecordsMemory ??= new MemoryStore();
  return { origin, store };
}
export async function ownedRecords(params: Promise<{ id: string }>) {
  const { id } = await params;
  const token = (await cookies()).get(RECORDS_COOKIE)?.value;
  if (!z.uuid().safeParse(id).success || !validCapability(token))
    throw new CareError("careos_conversation_not_found", 404);
  return { id, owner: recordsOwner(token) };
}
