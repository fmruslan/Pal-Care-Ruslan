import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { PilotFiles, PilotError } from "./files";
import { CareError } from "../contracts";
import { subscriptionStructured } from "./session";
import { standingStructured } from "./standing";
import { StandingOwner, type OwnerProof } from "../standing-owner";
import {
  CARE_INSTRUCTIONS,
  CARE_SELECTION_INSTRUCTIONS,
  classificationSchema,
  explanationSchema,
  evidenceSelectionSchema,
  type CareModel,
} from "../providers/responses";

export const subscriptionFiles = () =>
  new PilotFiles(join(homedir(), ".config/palcare-chatgpt-pilot"));
export class SubscriptionProvider implements CareModel {
  constructor(
    private context: {
      scope: "customer" | "studio";
      requestId: string;
      ownerProof?: OwnerProof;
    },
    private files = subscriptionFiles(),
  ) {}
  structured<T extends z.ZodType>(
    payload: string,
    schema: T,
    name: string,
    signal: AbortSignal,
    prompt = CARE_INSTRUCTIONS,
  ) {
    if (this.context.ownerProof) {
      return standingStructured({
        files: this.files,
        owner: new StandingOwner(),
        proof: this.context.ownerProof,
        scope: this.context.scope === "studio" ? "customer-studio" : "customer",
        enabled: () =>
          process.env.CAREOS_OWNER_MODE === "true" &&
          process.env.APP_ORIGIN ===
            "https://greatbison.tail9e8802.ts.net:8444" &&
          process.env.CAREOS_SUBSCRIPTION_CREDITS_DISABLED === "true" &&
          process.env.CAREOS_STANDING_AI_ENABLED === "true",
        requestId: this.context.requestId,
        payload,
        schema,
        name,
        signal,
        prompt,
      }).catch((error: unknown) => {
        if (
          error instanceof PilotError &&
          /pilot_(signin_required|refresh_unknown_reauthorize|plan_permission_missing|oauth_)/.test(
            error.code,
          )
        )
          throw new CareError("careos_owner_provider_reconnect", 503);
        throw error;
      });
    }
    return subscriptionStructured({
      files: this.files,
      ...this.context,
      payload,
      schema,
      name,
      signal,
      prompt,
    });
  }
  classify(payload: string, signal: AbortSignal) {
    return this.structured(
      payload,
      classificationSchema,
      "careos_intent",
      signal,
    );
  }
  explain(payload: string, signal: AbortSignal) {
    return this.structured(payload, explanationSchema, "careos_care", signal);
  }
  selectEvidence(payload: string, signal: AbortSignal) {
    return this.structured(
      payload,
      evidenceSelectionSchema,
      "careos_evidence",
      signal,
      CARE_SELECTION_INSTRUCTIONS,
    );
  }
}
