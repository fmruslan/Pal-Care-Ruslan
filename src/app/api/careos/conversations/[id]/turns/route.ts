import { ownedConversation } from "@/lib/careos/http";
import { answerTurn, careRuntime } from "@/lib/careos/runtime";
import {
  assertOrigin,
  careError,
  careResponse,
  readTurn,
} from "@/lib/careos/security";
import type { CareAnswer } from "@/lib/careos/contracts";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const runtime = careRuntime();
    assertOrigin(request, runtime.origin);
    const { id, owner } = await ownedConversation(params);
    const input = await readTurn(request);
    const prior = await runtime.store.claim(id, owner, input);
    if (prior) return careResponse(prior);
    let answer: CareAnswer;
    try {
      answer = await answerTurn(input);
    } catch {
      answer = {
        outcome: "unavailable",
        mode: "deterministic",
        context: null,
        revision: input.revision,
        text: "CareOS couldn’t retrieve an answer. Your saved purchases and documents are unchanged. Please try again later.",
        steps: [],
        sources: [],
        actions: [],
      };
    }
    const turn = { requestId: input.requestId, message: input.message, answer };
    await runtime.store.finish(id, owner, turn);
    return careResponse(turn);
  } catch (error) {
    return careError(error);
  }
}
