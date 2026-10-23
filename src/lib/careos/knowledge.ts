import { z } from "zod";

export const REFERENCE_PRODUCT = "00000000-0000-4000-8000-000000000104";
export const REFERENCE_TWIN = "00000000-0000-4000-8000-000000000204";
export const sourceSchema = z.strictObject({
  id: z.uuid(),
  productId: z.uuid(),
  brand: z.string().max(80),
  model: z.string().max(80),
  publisher: z.string().max(120),
  title: z.string().max(160),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.raspberrypi.com" &&
      url.pathname.startsWith("/documentation/") &&
      !url.username &&
      !url.password &&
      !url.port
    );
  }, "Only reviewed official documentation destinations are permitted."),
  section: z.string().max(160),
  revision: z.string().max(80),
  reviewedOn: z.iso.date(),
  content: z.string().min(1).max(4000),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["approved", "conflicting", "withdrawn"]),
  language: z.literal("en"),
  license: z.literal("CC BY-SA 4.0"),
  tags: z.array(z.string().max(40)).max(20),
});
export type KnowledgeSource = z.infer<typeof sourceSchema>;

// Short excerpts, copyright Raspberry Pi Ltd, CC BY-SA 4.0. Adapted selection:
// only Raspberry Pi 5 + Raspberry Pi OS instructions; other model shortcuts omitted.
// https://www.raspberrypi.com/licensing/ — no endorsement is implied.
export const referenceContent =
  "Shutdown. Closes all running programs and powers off your Raspberry Pi. Use this option before disconnecting your Raspberry Pi from power.\nTo open the Shutdown Options window from the desktop, select the Raspberry Pi icon in the top-left corner of the system tray, then select Shutdown.\nRaspberry Pi 5: Double-press the power button to shut the device down (the Shutdown Options window might display briefly).";
export const referenceSource: KnowledgeSource = {
  id: "00000000-0000-4000-8000-000000000501",
  productId: REFERENCE_PRODUCT,
  brand: "Raspberry Pi",
  model: "5",
  publisher: "Raspberry Pi Ltd",
  title: "Raspberry Pi 5 · safe shutdown",
  section: "Shutdown options · Raspberry Pi OS",
  url: "https://www.raspberrypi.com/documentation/computers/getting-started.html#shutdown",
  revision: "Pal Care excerpt reviewed 2026-10-23",
  reviewedOn: "2026-10-23",
  content: referenceContent,
  contentHash:
    "6e37c625188358a822ab55e845dc6322cb2b4352dffcb97c9b3b8089db68c22f",
  status: "approved",
  language: "en",
  license: "CC BY-SA 4.0",
  tags: [
    "shutdown",
    "shut",
    "power",
    "off",
    "maintain",
    "maintenance",
    "care",
    "disconnect",
  ],
};

export function retrievePassages(
  sources: KnowledgeSource[],
  product: { id: string; brand: string; model: string },
  query: string,
) {
  const scoped = sources.filter(
    (source) =>
      source.productId === product.id &&
      source.brand === product.brand &&
      source.model === product.model &&
      source.status !== "withdrawn",
  );
  const words: string[] = Array.from(
    query.toLowerCase().match(/[a-z0-9]+/g) ?? [],
  );
  const relevant = scoped
    .map((source) => ({
      source,
      score: source.tags.filter((tag) => words.includes(tag)).length,
    }))
    .filter((result) => result.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id),
    );
  return {
    conflict: relevant.some((r) => r.source.status === "conflicting"),
    passages: relevant.slice(0, 4).map((r) => r.source),
  };
}
