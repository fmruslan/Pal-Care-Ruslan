import { z } from "zod";

export const RECORDS_LIMIT = 1000;
export const dateSchema = z.iso.date();
export const recordsQuerySchema = z
  .strictObject({
    version: z.literal(1),
    operation: z.enum(["list", "total", "breakdown", "compare"]),
    format: z.enum(["cards", "bullets", "table", "chart"]),
    from: dateSchema.nullable(),
    to: dateSchema.nullable(),
    categories: z.array(z.enum(["Audio", "Computing", "Kitchen"])).max(3),
    origin: z.enum(["all", "sample", "sandbox"]),
    receipt: z.enum(["any", "present", "missing"]),
    document: z.enum(["any", "present", "missing"]).default("any"),
    price: z.enum(["any", "present", "missing"]),
    search: z.string().max(120),
    referenceDate: dateSchema,
    timezone: z.literal("UTC"),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, "Invalid date range")
  .refine(
    (q) => q.operation !== "compare" || !!(q.from && q.to),
    "Comparison needs a bounded period",
  );
export type RecordsQuery = z.infer<typeof recordsQuerySchema>;

export const recordSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().max(200),
  model: z.string().max(200),
  category: z.string().max(100),
  purchasedOn: dateSchema,
  origin: z.enum(["sample", "sandbox"]),
  amountMinor: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  // Links are resolved from IDs by the UI, never supplied by model output.
  receiptId: z.uuid().nullable(),
  documents: z
    .array(z.strictObject({ id: z.uuid(), title: z.string().max(200) }))
    .max(100),
});
export type SavedRecord = z.infer<typeof recordSchema>;
export const totalSchema = z.strictObject({
  origin: z.enum(["sample", "sandbox"]),
  amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  pricedCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
});
export type RecordTotal = z.infer<typeof totalSchema>;
export const recordsResultSchema = z.strictObject({
  version: z.literal(1),
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/),
  queryFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  observedAt: z.iso.datetime(),
  query: recordsQuerySchema,
  coverage: z.strictObject({
    source: z.enum(["fixtures", "database"]),
    complete: z.boolean(),
    availableCount: z.number().int().min(0).max(RECORDS_LIMIT),
    limit: z.literal(RECORDS_LIMIT),
    excludedInvalidCount: z.number().int().nonnegative(),
  }),
  records: z.array(recordSchema).max(RECORDS_LIMIT),
  totals: z.array(totalSchema).length(2),
  groups: z
    .array(
      z.strictObject({
        label: z.string().max(100),
        totals: z.array(totalSchema).length(2),
        recordIds: z.array(z.uuid()).max(RECORDS_LIMIT),
      }),
    )
    .max(100),
  comparison: z
    .strictObject({
      from: dateSchema,
      to: dateSchema,
      records: z.array(recordSchema).max(RECORDS_LIMIT),
      totals: z.array(totalSchema).length(2),
    })
    .nullable(),
});
export type RecordsResult = z.infer<typeof recordsResultSchema>;

export function emptyRecordsQuery(referenceDate: string): RecordsQuery {
  return recordsQuerySchema.parse({
    version: 1,
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
    referenceDate,
    timezone: "UTC",
  });
}
