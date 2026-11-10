import { z } from "zod";

const text = z.string().max(4000);
export const documentViewSchema = z.object({
  title: text,
  provenance: text,
  status: text,
  facts: z.array(z.object({ label: text, value: text })).max(30),
  sections: z
    .array(z.object({ title: text, items: z.array(text).max(20) }))
    .max(10),
  next: text,
  limitation: text,
  recognized: z.boolean(),
  actions: z
    .array(
      z.object({
        label: text,
        href: z
          .string()
          .regex(
            /^\/(?:safety\?twinId=[a-f0-9-]{36}|vault\/[a-f0-9-]{36}\/care)$/,
          ),
      }),
    )
    .max(2)
    .default([]),
});
export type DocumentView = z.infer<typeof documentViewSchema>;

/** Display-only link text for retained answers. Never parses evidence or status. */
export function documentLinkTitle(title: string, product: string) {
  const topics: Record<string, string> = {
    "return-window": "return details",
    warranty: "warranty terms",
    delivery: "delivery updates",
    price: "price checks",
    safety: "safety review",
    gap: "coverage record",
  };
  const kind = title.match(
    /^(return-window|warranty|delivery|price|safety|gap) · simulated Care evidence$/,
  )?.[1];
  if (kind) return `${product} ${topics[kind]}`;
  return title
    .replace(/ · (?:fictional demo|sample|sandbox) receipt$/, " receipt")
    .replace(/ · sample care card$/, " care document")
    .replace(/ · sample ownership note$/, " ownership note")
    .replace(/ · Demo source$/, "")
    .replace(/ · demo merchant policy v1$/, " purchase terms");
}
