import { ModelFailure, type ModelResult } from "./providers/responses";
import type { ModelUsage } from "./model-policy";

export async function accountedCall<T>(
  work: () => Promise<ModelResult<T>>,
  settle: (micro: number, usage?: ModelUsage | null) => Promise<void>,
): Promise<T> {
  let result: ModelResult<T>;
  try {
    result = await work();
  } catch (error) {
    if (error instanceof ModelFailure && error.micro !== null)
      await settle(error.micro, error.usage);
    throw error;
  }
  if (result.micro !== null) await settle(result.micro, result.usage);
  return result.value;
}
