// TEST-ONLY Node preload for a separate local test process. Never imported by the
// application. All external networking is denied; Responses are synthetic proof.
const original = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = new URL(
    typeof url === "string" ? url : (url.url ?? String(url)),
  );
  if (["127.0.0.1", "localhost"].includes(target.hostname))
    return original(url, init);
  if (
    target.origin !== "https://api.openai.com" ||
    target.pathname !== "/v1/responses"
  )
    throw new Error("TEST: external networking forbidden");
  const body = JSON.parse(init.body);
  if (
    body.model !== "gpt-6.1-sol" ||
    body.reasoning.effort !== "medium" ||
    body.service_tier !== "default" ||
    body.store !== false ||
    body.tools
  )
    throw new Error("TEST: invalid Sol contract");
  const input = JSON.parse(body.input[1].content),
    schema = body.text.format.name;
  let value;
  if (schema === "careos_dashboard")
    value = {
      outcome: "apply",
      commands: [
        { operation: "reset" },
        { operation: "add-summary" },
        { operation: "evidence" },
      ],
    };
  else if (schema === "careos_customer_dashboard")
    value = {
      outcome: "apply",
      commands: [
        {
          operation: /categor/i.test(input.message)
            ? "category"
            : /care/i.test(input.message)
              ? "care"
              : /document/i.test(input.message)
                ? "documents"
                : "purchases",
        },
      ],
    };
  else if (schema === "careos_intent") value = { intent: "care" };
  else if (schema === "careos_evidence") value = { factIds: ["fact-0"] };
  else {
    const source = input.untrustedPassages[0];
    value = {
      outcome: "answered",
      steps: [
        {
          text: "Use Shutdown before disconnecting power.",
          sourceId: source.id,
          quote:
            "Use this option before disconnecting your Raspberry Pi from power.",
        },
      ],
    };
  }
  return Response.json({
    id: "resp_injected_test",
    model: "gpt-6.1-sol",
    service_tier: "default",
    status: "completed",
    output: [
      { type: "reasoning", id: "rs_test", summary: [] },
      {
        type: "message",
        id: "msg_test",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: JSON.stringify(value), annotations: [] },
        ],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 30,
      total_tokens: 130,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 10 },
    },
  });
};
