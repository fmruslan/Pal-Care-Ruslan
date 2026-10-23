import { z } from "zod";
const position = z
  .strictObject({
    xTrack: z.int().min(0).max(23),
    yTrack: z.int().min(0).max(200),
    xSpan: z.int().min(1).max(24),
    ySpan: z.int().min(1).max(80),
  })
  .refine((p) => p.xTrack + p.xSpan <= 24);
export const layoutSchema = z.strictObject({
  recovery: position,
  status: position,
  evidence: position,
});
