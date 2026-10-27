import type OpenAI from "openai";
import { PilotError } from "./files";

// Responses delivers complete output items separately from the terminal lifecycle
// event. Match the official SDK's completed-item accumulation and phase handling;
// never promote a text delta, unfinished item, commentary or refusal to an answer.
export class SubscriptionOutput {
  private responseId: string | undefined;
  private added = new Map<number, { id: string; type: string }>();
  private done = new Map<number, OpenAI.Responses.ResponseOutputItem>();
  observe(event: OpenAI.Responses.ResponseStreamEvent) {
    if ("response" in event) {
      const id = event.response.id;
      if (this.responseId && id !== this.responseId)
        throw new PilotError("subscription_response_identity_changed");
      this.responseId = id;
    }
    if (
      event.type !== "response.output_item.added" &&
      event.type !== "response.output_item.done"
    )
      return;
    const { output_index: index, item } = event;
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index > 15 ||
      !item ||
      !["message", "reasoning"].includes(item.type) ||
      !("id" in item) ||
      !item.id
    )
      throw new PilotError("subscription_unexpected_output_item");
    const identity = { id: item.id, type: item.type };
    const previous = this.added.get(index);
    if (
      previous &&
      (previous.id !== identity.id || previous.type !== identity.type)
    )
      throw new PilotError("subscription_output_identity_changed");
    if (event.type === "response.output_item.added") {
      if (previous) throw new PilotError("subscription_duplicate_output_item");
      this.added.set(index, identity);
    } else {
      if (
        this.done.has(index) ||
        (item.type === "message" && item.status !== "completed")
      )
        throw new PilotError("subscription_unfinished_or_duplicate_output");
      this.done.set(index, item);
    }
  }
  complete(response: OpenAI.Responses.Response) {
    if (
      [...this.added.keys()].some((index) => !this.done.has(index)) &&
      !response.output.length
    )
      throw new PilotError("subscription_unfinished_output");
    const completedItems = [...this.done]
      .sort(([a], [b]) => a - b)
      .map(([, item]) => item);
    const output = response.output.length ? response.output : completedItems;
    for (const item of completedItems) {
      if (
        !output.some(
          (candidate) =>
            candidate.type === item.type &&
            "id" in candidate &&
            "id" in item &&
            candidate.id === item.id,
        )
      )
        throw new PilotError("subscription_terminal_output_conflict");
    }
    return { ...response, output };
  }
}
export function finalStructuredText(response: OpenAI.Responses.Response) {
  if (
    response.output.some(
      (item) => !["message", "reasoning"].includes(item.type),
    )
  )
    throw new PilotError("pilot_refusal_or_unexpected_output");
  const messages = response.output.filter(
    (item): item is OpenAI.Responses.ResponseOutputMessage =>
      item.type === "message" &&
      (item.phase == null || item.phase === "final_answer"),
  );
  if (
    messages.length !== 1 ||
    messages[0].status !== "completed" ||
    !messages[0].content.length ||
    messages[0].content.some((content) => content.type !== "output_text")
  )
    throw new PilotError("pilot_refusal_or_unexpected_output");
  return messages[0].content
    .map((content) => (content.type === "output_text" ? content.text : ""))
    .join("");
}
