import OpenAI from "openai";
import { MODEL } from "../src/lib/careos/model-policy";
import "./environment";
if (process.env.CAREOS_ACCESS_CHECK_APPROVED !== "true")
  throw new Error(
    "Requires explicit owner approval for a read-only project model-access check. No inference is performed.",
  );
const key = process.env.CAREOS_API_KEY,
  project = process.env.CAREOS_PROJECT_ID;
if (!key || !/^proj_[a-zA-Z0-9_-]+$/.test(project ?? ""))
  throw new Error("Private project key/id required; values withheld.");
try {
  const api = new OpenAI({
    apiKey: key,
    project,
    baseURL: "https://api.openai.com/v1",
    maxRetries: 0,
    timeout: 10000,
    logLevel: "off",
    fetchOptions: { redirect: "error" },
  });
  const model = await api.models.retrieve(MODEL);
  if (model.id !== MODEL) throw new Error("Unexpected model identity");
  console.log(
    "PASS: this API project can retrieve gpt-6.1-sol. No inference/spend or runtime activation. Live Responses compatibility still needs the separately approved test.",
  );
} catch {
  console.error(
    "BLOCKED: model access could not be verified. No inference attempted; credentials/provider diagnostics withheld.",
  );
  process.exitCode = 2;
}
