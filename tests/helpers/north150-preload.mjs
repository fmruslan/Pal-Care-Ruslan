// TEST ONLY. Loaded exclusively into the isolated north150 child, never the app
// configuration. Real auth/accounting run unchanged; only time and fetch differ.
import { appendFileSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const epoch = Number(process.env.NORTH150_CLOCK_EPOCH);
const wallStarted = Number(process.env.NORTH150_CLOCK_WALL_STARTED);
const log = process.env.NORTH150_TRANSPORT_LOG;
const offsetFile = process.env.NORTH150_CLOCK_OFFSET;
if (
  !Number.isSafeInteger(epoch) ||
  !Number.isSafeInteger(wallStarted) ||
  !log?.startsWith("/tmp/opencode/north150-") ||
  !offsetFile?.startsWith("/tmp/opencode/north150-") ||
  !process.env.HOME?.startsWith("/tmp/opencode/north150-")
)
  throw Error("north150 isolated fixture environment required");

const NativeDate = Date;
const elapsed = Math.max(0, NativeDate.now() - wallStarted);
const started = performance.now();
const now = () =>
  epoch +
  Number(readFileSync(offsetFile, "utf8")) +
  elapsed +
  Math.floor(performance.now() - started);
globalThis.Date = new Proxy(NativeDate, {
  construct(target, args) {
    return Reflect.construct(target, args.length ? args : [now()]);
  },
  apply() {
    return new NativeDate(now()).toString();
  },
  get(target, property) {
    return property === "now" ? now : Reflect.get(target, property);
  },
});

const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = new URL(
    typeof input === "string" ? input : (input.url ?? String(input)),
  );
  if (target.origin === "http://127.0.0.1:3117") return original(input, init);
  const method = init?.method ?? "GET";
  const record = (value) =>
    appendFileSync(log, JSON.stringify({ at: now(), ...value }) + "\n");
  if (
    target.href !== "https://api.openai.com/v1/responses" ||
    method !== "POST"
  ) {
    record({
      kind: "blocked",
      origin: target.origin,
      path: target.pathname,
      method,
    });
    throw Error("north150 external networking/refresh forbidden");
  }
  const headers = new Headers(init.headers);
  if (headers.get("authorization") !== "Bearer north150-synthetic-access")
    throw Error("north150 unexpected synthetic credential");
  const body = JSON.parse(init.body);
  if (
    body.model !== "gpt-6.1-sol" ||
    body.reasoning?.effort !== "medium" ||
    body.store !== false ||
    body.stream !== true ||
    body.tools
  )
    throw Error("north150 unexpected model contract");
  const payload = JSON.parse(body.input[1].content);
  const name = body.text.format.name;
  let value;
  if (name === "north_conversation_v1") {
    const query = {
      outcome: "query",
      operation: "list",
      format: "cards",
      from: null,
      to: null,
      categories: [],
      origin: "all",
      receipt: "any",
      document: "any",
      price: "any",
      search: "",
    };
    value = {
      task: "records",
      relation: "fresh",
      query,
      comparison: null,
      productSearch: "",
      productAction: "summary",
      careQuestion: "",
      clarification: "",
      guide: null,
    };
    switch (payload.question) {
      case "How do I find a receipt in Pal Care?":
        value.task = "guidance";
        value.guide = {
          text: "Use Purchases & Docs to find the saved original receipt.",
          steps: [
            "Open Purchases & Docs, then choose Documents.",
            "Search for the dated product and open its receipt or View original record.",
          ],
          features: ["receipts", "library"],
        };
        break;
      case "Which have no recorded price?":
        query.price = "missing";
        break;
      case "Show all Audio purchases as a chart":
        query.categories = ["Audio"];
        query.operation = "breakdown";
        query.format = "chart";
        break;
      case "Show all Audio purchases in a table":
        query.categories = ["Audio"];
        query.format = "table";
        break;
      case "How do I shut down my Raspberry Pi 5?":
        value.task = "care";
        value.productSearch = "Raspberry Pi 5";
        value.careQuestion = payload.question;
        break;
      default:
        throw Error("north150 question not in this synthetic transport script");
    }
  } else if (name === "careos_care") {
    const quote =
      "Use this option before disconnecting your Raspberry Pi from power.";
    const source = payload.untrustedPassages.find((s) =>
      s.content.includes(quote),
    );
    if (!source)
      throw Error("north150 expected exact-model seeded source missing");
    value = {
      outcome: "answered",
      steps: [
        {
          text: "Use Shutdown before disconnecting power.",
          sourceId: source.id,
          quote,
        },
      ],
    };
  } else throw Error("north150 unexpected provider stage");
  record({ kind: "response", name, question: payload.question ?? null });
  const response = {
    id: "resp_north150_synthetic",
    status: "completed",
    model: body.model,
    reasoning: { effort: "medium" },
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 1 },
    },
    output: [
      {
        id: "msg_north150_synthetic",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: JSON.stringify(value), annotations: [] },
        ],
      },
    ],
  };
  return new Response(
    `data: ${JSON.stringify({ type: "response.completed", sequence_number: 1, response })}\n\ndata: [DONE]\n\n`,
    {
      headers: {
        "content-type": "text/event-stream",
        "x-request-id": "req_north150_synthetic",
      },
    },
  );
};
