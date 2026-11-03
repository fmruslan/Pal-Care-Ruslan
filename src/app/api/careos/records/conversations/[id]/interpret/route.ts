import { ownedRecords, recordsRuntime } from "@/lib/careos/records/runtime";
import {
  answerAuthorizedRecords,
  assertRecordsModelAccess,
} from "@/lib/careos/records/semantic-runtime";
import {
  assertOrigin,
  careError,
  careResponse,
  readTurn,
} from "@/lib/careos/security";
import type { CareAnswer } from "@/lib/careos/contracts";

/** Separate protected interpretation boundary. Provider-free /turns never falls
 * through here, and a records cookie alone is never inference authority. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { origin, store } = recordsRuntime();
    assertOrigin(request, origin);
    await assertRecordsModelAccess();
    const { id, owner } = await ownedRecords(params);
    const input = await readTurn(request);
    const prior = await store.claim(id, owner, input);
    if (prior) return careResponse(prior);
    let answer: CareAnswer;
    let failure: unknown;
    try {
      answer = await answerAuthorizedRecords(input, id, owner, request.signal);
    } catch (error) {
      failure = error;
      answer = {
        outcome: "unavailable",
        mode: "deterministic",
        revision: input.revision,
        questionScope: "library",
        context: null,
        text: "AI query interpretation could not be confirmed. Your records are unchanged; no automatic replay or provider fallback will occur. Supported saved-record queries remain available.",
        steps: [],
        sources: [],
        actions: [],
      };
    }
    const turn = { requestId: input.requestId, message: input.message, answer };
    await store.finish(id, owner, turn);
    return failure ? careError(failure) : careResponse(turn);
  } catch (error) {
    return careError(error);
  }
}
