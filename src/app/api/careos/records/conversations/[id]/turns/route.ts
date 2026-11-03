import { ownedRecords, recordsRuntime } from "@/lib/careos/records/runtime";
import { answerRecordsTurn } from "@/lib/careos/records/service";
import { getSavedRecordsData } from "@/lib/demo/repository";
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
    const { origin, store } = recordsRuntime();
    assertOrigin(request, origin);
    const { id, owner } = await ownedRecords(params);
    const input = await readTurn(request);
    const prior = await store.claim(id, owner, input);
    if (prior) return careResponse(prior);
    let answer: CareAnswer;
    try {
      const history = (await store.get(id, owner)).turns;
      answer = await answerRecordsTurn({
        input,
        history,
        load: getSavedRecordsData,
      });
    } catch {
      answer = {
        outcome: "unavailable",
        mode: "deterministic",
        revision: input.revision,
        questionScope: "library",
        context: null,
        text: "Saved purchases could not be read completely. No totals or sample fallback were substituted. Your records are unchanged.",
        steps: [],
        sources: [],
        actions: [],
      };
    }
    const turn = { requestId: input.requestId, message: input.message, answer };
    await store.finish(id, owner, turn);
    return careResponse(turn);
  } catch (error) {
    return careError(error);
  }
}
