import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildLanguageLibrary,
  categoryTargets,
  conversationScenarios,
  LANGUAGE_CAMPAIGN,
} from "../tests/fixtures/north-language-library";

const [action, output] = process.argv.slice(2);
if (
  action !== "--prepare" ||
  !output ||
  !output.startsWith("/tmp/opencode/") ||
  process.argv.length !== 4
)
  throw new Error(
    "Usage: --prepare /tmp/opencode/PRIVATE_OUTPUT; offline only, never calls a provider",
  );
const cases = buildLanguageLibrary();
for (const [category, [target]] of Object.entries(categoryTargets))
  if (cases.filter((c) => c.category === category).length !== target)
    throw new Error("category_count_mismatch");
if (
  cases.length !== 1050 ||
  conversationScenarios.length !== 24 ||
  new Set(cases.map((c) => c.id)).size !== 1050
)
  throw new Error("library_count_mismatch");
const manifest = {
  version: 1,
  campaign: LANGUAGE_CAMPAIGN,
  preparedAt: new Date().toISOString(),
  source: "deterministic local definitions; zero provider calls",
  cases,
  conversations: conversationScenarios,
  allocation: categoryTargets,
};
const bytes = JSON.stringify(manifest, null, 2) + "\n";
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(join(output, "library.json"), bytes, {
  mode: 0o600,
  flag: "wx",
});
await writeFile(
  join(output, "conversations.md"),
  "# North: 24 conversation definitions\n\n" +
    conversationScenarios
      .map(
        (s) =>
          `## ${s.id}: ${s.title}\n\nFresh conversation unless independence is explicitly tested. ${s.inputs.length} customer turns.\n\n${s.inputs.map((input, i) => `${i + 1}. ${JSON.stringify(input)}`).join("\n")}\n\nExpected: ${s.expected}\n`,
      )
      .join("\n"),
  { mode: 0o600, flag: "wx" },
);
console.log(
  JSON.stringify({
    campaign: LANGUAGE_CAMPAIGN,
    cases: cases.length,
    conversations: conversationScenarios.length,
    manifestSha256: createHash("sha256").update(bytes).digest("hex"),
    genuineAttempts: 0,
    output,
  }),
);
