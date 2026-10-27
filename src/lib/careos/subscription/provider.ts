import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { PilotFiles } from "./files";
import { subscriptionStructured } from "./session";
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
    private context: { scope: "customer" | "studio"; requestId: string },
    private files = subscriptionFiles(),
  ) {}
  structured<T extends z.ZodType>(
    payload: string,
    schema: T,
    name: string,
    signal: AbortSignal,
    prompt = CARE_INSTRUCTIONS,
  ) {
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
