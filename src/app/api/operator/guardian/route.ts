import { z } from "zod";
import {
  guardianRuntime,
  getGuardian,
  refundRuntime,
} from "@/lib/price-guardian/runtime";
import { GuardianError } from "@/lib/price-guardian/contracts";
import {
  guardianResponse,
  guardianError,
  operatorSession,
  operatorJson,
} from "@/lib/operator/http";

const actionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("publish-policy") }),
  z.strictObject({
    action: z.literal("publish-price"),
    requestId: z.uuid(),
    direction: z.enum(["drop", "restore"]),
  }),
  z.strictObject({
    action: z.literal("approve"),
    caseId: z.uuid(),
    revision: z.int().positive(),
    requestId: z.uuid(),
  }),
  z.strictObject({
    action: z.literal("execute"),
    caseId: z.uuid(),
    revision: z.int().positive(),
  }),
  z.strictObject({ action: z.literal("reconcile"), caseId: z.uuid() }),
]);
export async function POST(request: Request) {
  try {
    const runtime = await guardianRuntime();
    const parsed = actionSchema.safeParse(
      await operatorJson(request, runtime.origin),
    );
    if (!parsed.success)
      throw new GuardianError("guardian_invalid_request", 400);
    const session = await operatorSession(),
      input = parsed.data;
    if (input.action === "publish-policy")
      await runtime.guardian.publishPolicy(session);
    if (input.action === "publish-price") {
      await runtime.guardian.publishPrice(
        session,
        input.requestId,
        input.direction,
      );
      await runtime.guardian.detect();
    }
    if (input.action === "approve")
      await runtime.guardian.approve(
        session,
        input.caseId,
        input.revision,
        input.requestId,
      );
    if (input.action === "execute")
      await (
        await refundRuntime()
      ).execute(session, input.caseId, input.revision);
    if (input.action === "reconcile")
      await (await refundRuntime()).reconcile(session, input.caseId);
    return guardianResponse(await getGuardian());
  } catch (error) {
    return guardianError(error);
  }
}
