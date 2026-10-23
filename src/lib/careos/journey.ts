import type { CareContext } from "./contracts";
import type { DiscoveryCategory } from "../discovery/contracts";
import { categorySchema } from "../discovery/contracts";
import { findTwin } from "../demo/presentation";
import type { DemoData } from "../../db/schema";

export type JourneyQuery = {
  twinId?: string;
  example?: string;
  category?: string;
};
export const referenceContext: CareContext = {
  twinId: null,
  example: "insignia",
  name: "Insignia air fryer · fictional ownership",
  model: "NS-AF34D2",
  origin: "example",
};
export function journeyContext(
  data: DemoData,
  query: JourneyQuery,
): {
  context: CareContext | null;
  category: DiscoveryCategory | null;
  query: string;
  back: string;
} | null {
  if (query.twinId && query.example) return null;
  if (query.example)
    return query.example === "insignia"
      ? {
          context: referenceContext,
          category: "air-fryer",
          query: "example=insignia",
          back: "/safety?example=insignia",
        }
      : null;
  if (query.twinId) {
    const record = findTwin(data, query.twinId);
    if (!record) return null;
    return {
      context: {
        twinId: record.twin.id,
        name: record.product.name,
        model: record.product.model,
        origin: record.twin.origin,
      },
      category:
        record.product.illustration === "headphones" ? "headphones" : null,
      query: `twinId=${record.twin.id}`,
      back: `/vault/${record.twin.id}`,
    };
  }
  const category = categorySchema.safeParse(query.category ?? "headphones");
  return category.success
    ? {
        context: null,
        category: category.data,
        query: `category=${category.data}`,
        back: "/vault",
      }
    : null;
}
