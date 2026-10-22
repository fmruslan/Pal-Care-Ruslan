import "server-only";
import { MemoryStore } from "./store";
import { CareError, type TurnInput } from "./contracts";
import { deterministicAnswer } from "./tools";
import { getDemoData } from "../demo/repository";
import { findTwin } from "../demo/presentation";

const state = globalThis as unknown as { careosStore?: MemoryStore };
export function careRuntime() {
  const configured = process.env.APP_ORIGIN;
  if (
    !configured ||
    !URL.canParse(configured) ||
    new URL(configured).origin !== configured
  )
    throw new CareError("careos_origin_not_configured");
  state.careosStore ??= new MemoryStore();
  return { store: state.careosStore, origin: configured };
}
export async function answerTurn(input: TurnInput) {
  const data = await getDemoData();
  if (input.twinId && !findTwin(data, input.twinId))
    throw new CareError("careos_purchase_not_found", 404);
  return deterministicAnswer(data, input);
}
