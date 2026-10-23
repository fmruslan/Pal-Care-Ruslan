import { createDatabase } from "./connection";
const state = globalThis as unknown as {
  runtimePools?: Map<string, ReturnType<typeof createDatabase>>;
};
/** Share compatible readers only. Distinct writer credentials never merge. */
export function runtimeDatabase(
  url: string,
  { readOnly = false }: { readOnly?: boolean } = {},
) {
  const pools: Map<
    string,
    ReturnType<typeof createDatabase>
  > = (state.runtimePools ??= new Map());
  const key = `${readOnly ? "read" : "write"}\0${url}`;
  let database = pools.get(key);
  if (!database) {
    database = createDatabase(url, { readOnly, max: readOnly ? 3 : 2 });
    pools.set(key, database);
  }
  return database;
}
