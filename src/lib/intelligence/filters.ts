import type { AgBaseRegistry, AgReportState } from "ag-studio";
import { stages } from "./model";

export function pageStage(state: AgReportState): string {
  const filter = state.pages
    ?.find((p) => p.id === "care")
    ?.filter?.page?.find((f) => f.field.id === "cases.stage");
  const value =
    filter?.model && "value" in filter.model ? filter.model.value : undefined;
  return typeof value === "string" && stages.some((s) => s === value)
    ? value
    : "All";
}

/** One shared stage, translated into the SDK page filter. Layout/widget scopes survive. */
export function withPageStage<T extends AgBaseRegistry>(
  state: AgReportState<T>,
  stage: string,
): AgReportState<T> {
  if (stage !== "All" && !stages.some((s) => s === stage))
    throw new Error("Unsupported case stage");
  return {
    ...state,
    pages: state.pages?.map((p) =>
      p.id !== "care"
        ? p
        : {
            ...p,
            crossFilter: undefined,
            filter: {
              ...p.filter,
              page: [
                ...(p.filter?.page ?? []).filter(
                  (f) => f.field.id !== "cases.stage",
                ),
                ...(stage === "All"
                  ? []
                  : [
                      {
                        field: { id: "cases.stage" },
                        model: { operator: "equals" as const, value: stage },
                      },
                    ]),
              ],
            },
          },
    ),
  };
}
