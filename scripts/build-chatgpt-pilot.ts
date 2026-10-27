import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, appendFile } from "node:fs/promises";

const outfile = "dist/careos-chatgpt-pilot.mjs";
const result = await build({
  entryPoints: ["scripts/chatgpt-pilot.ts"],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  metafile: true,
  legalComments: "eof",
});
if (
  Object.keys(result.metafile.inputs).some((path) =>
    /src\/db\/|scripts\/environment|\/dotenv\/|\/pg\//.test(path),
  )
)
  throw new Error(
    "Pilot must not bundle database/environment-loader dependencies",
  );
// Keep complete notices in the single file copied to the Mac, not just SPDX tags.
const notices = await Promise.all(
  [
    "LICENSE",
    "node_modules/jose/LICENSE.md",
    "node_modules/openai/LICENSE",
    "node_modules/zod/LICENSE",
  ].map(async (path) => `${path}\n${await readFile(path, "utf8")}`),
);
await appendFile(
  outfile,
  `\n/* Bundled license notices\n${notices.join("\n\n").replaceAll("*/", "* /")}\nReference excerpt: copyright Raspberry Pi Ltd, CC BY-SA 4.0. Adapted selection for Raspberry Pi 5 / Raspberry Pi OS.\nhttps://www.raspberrypi.com/documentation/computers/getting-started.html#shutdown\nhttps://creativecommons.org/licenses/by-sa/4.0/\nNo endorsement implied.\n*/\n`,
);
console.log(
  `${outfile}\nSHA256 ${createHash("sha256")
    .update(await readFile(outfile))
    .digest(
      "hex",
    )}\nCredential-free standalone Node 22+ helper; no sign-in or inference performed.`,
);
