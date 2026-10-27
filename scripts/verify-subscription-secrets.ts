import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse } from "dotenv";
import { PilotFiles } from "../src/lib/careos/subscription/files";

// Values are inspected in memory only; never print/store a credential or hash it
// into published evidence. Read CareOS's own authorized record, never other tools.
const state = new PilotFiles(join(homedir(), ".config/palcare-chatgpt-pilot"));
await state.prepare();
const registration = await state.registration();
const app = (await state.read("application.json")) as {
  customer?: string;
  studio?: string;
} | null;
const runtime = parse(
  await readFile("/home/bigrus/projects/palcare/.env.local"),
);
const values = [
  registration?.tokens?.accessToken,
  registration?.tokens?.refreshToken,
  registration?.tokens?.idToken,
  app?.customer,
  app?.studio,
  runtime.DATABASE_URL,
  runtime.CAREOS_DATABASE_URL,
].filter((v): v is string => !!v);
if (values.length !== 7)
  throw new Error("Expected explicit private runtime/subscription state");
async function walk(root: string): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(root, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? walk(join(root, e.name)) : [join(root, e.name)],
      ),
    )
  ).flat();
}
let checked = 0;
for (const file of await walk(".next/static")) {
  if (!/\.(js|json|map)$/.test(file)) continue;
  const body = await readFile(file, "utf8");
  if (values.some((value) => body.includes(value)))
    throw new Error(
      "STOP: credential found in browser artifact; values withheld",
    );
  checked++;
}
for (const file of await walk(".next/server")) {
  if (!file.endsWith(".nft.json")) continue;
  const body = await readFile(file, "utf8");
  if (
    body.includes("/.config/palcare-chatgpt-pilot/") ||
    body.includes("/projects/palcare/.env.local")
  )
    throw new Error("STOP: private host files referenced as deployment assets");
}
console.log(
  JSON.stringify({
    browserCredentialLeakCheck: "PASS",
    browserArtifactsChecked: checked,
    privateHostFilesBundled: false,
  }),
);
