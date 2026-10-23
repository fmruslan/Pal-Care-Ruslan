import { createHash } from "node:crypto";
import { z } from "zod";

export const CPSC_NUMBER = "24159";
export const CPSC_ENDPOINT = `https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallNumber=${CPSC_NUMBER}`;
const officialUrl = z
  .string()
  .max(1000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        u.protocol === "https:" &&
        u.hostname === "www.cpsc.gov" &&
        u.pathname.startsWith("/Recalls/") &&
        !u.username &&
        !u.password &&
        !u.port
      );
    } catch {
      return false;
    }
  });
const entry = z.object({
  RecallID: z.int().positive(),
  RecallNumber: z.literal(CPSC_NUMBER),
  Title: z.string().min(1).max(1000),
  Description: z.string().min(1).max(12000),
  URL: officialUrl,
  RecallDate: z.string().max(40),
  LastPublishDate: z.string().max(40),
  Hazards: z.array(z.object({ Name: z.string().max(12000) })).max(20),
  Remedies: z.array(z.object({ Name: z.string().max(12000) })).max(20),
});
export const sourceSchema = entry;
export type RecallSource = z.infer<typeof sourceSchema>;
export const sourceHash = (source: RecallSource) =>
  createHash("sha256")
    .update(JSON.stringify(sourceSchema.parse(source)))
    .digest("hex");
export async function retrieveCpsc(transport: typeof fetch = fetch) {
  const response = await transport(CPSC_ENDPOINT, {
    signal: AbortSignal.timeout(12000),
    redirect: "error",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok || Number(response.headers.get("content-length")) > 1000000)
    throw new Error("cpsc_unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("cpsc_invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1000000) throw new Error("cpsc_response_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const source = z
    .array(entry)
    .length(1)
    .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")))[0];
  return {
    source,
    hash: sourceHash(source),
    retrievedAt: new Date().toISOString(),
    endpoint: CPSC_ENDPOINT,
  };
}
