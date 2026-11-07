import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { transform, aptConfig, assertHost } from "./ci-ubuntu-mirrors.mjs";

const azure = "http://azure.archive.ubuntu.com/ubuntu/";
const active = "mirror+file:/etc/apt/apt-mirrors.txt";
const list = `# retained comment\n${azure}\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n`;
const source = `Types: deb\nURIs: ${active}\nSuites: noble noble-updates noble-backports\nComponents: main restricted universe multiverse\nArchitectures: amd64\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: ${active}\nSuites: noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n`;
const goodHost = {
  env: {
    CI: "true",
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
  },
  platform: "linux",
  uid: 0,
  osRelease: 'ID=ubuntu\nVERSION_ID="24.04"\n',
};
test("removes only Azure lines; keeps official fallback bytes and priorities", () => {
  const result = transform(list, source);
  assert.equal(result.mirrors, list.replace(`${azure}\tpriority:1\n`, ""));
  assert.equal(result.sources, source);
  assert.equal(result.config, aptConfig);
});
test("legacy direct Azure uses same existing mirror list; all other fields unchanged", () => {
  assert.equal(
    transform(list, source.replaceAll(active, azure)).sources,
    source,
  );
});
test("legacy rewrite never changes Azure text in a comment", () => {
  const comment = `# original mirror ${azure}\n`;
  assert.equal(
    transform(list, comment + source.replaceAll(active, azure)).sources,
    comment + source,
  );
});
test("unrelated third-party stanza remains byte-exact", () => {
  const third =
    "\nTypes: deb\nURIs: https://packages.microsoft.com/repos/code\nSuites: stable\nComponents: main\nSigned-By: /usr/share/keyrings/microsoft.gpg\nX-Custom: preserved\n folded third-party value\n";
  assert.equal(transform(list, source + third).sources, source + third);
});
test("idempotent with exact existing bounded config", () => {
  const once = transform(list, source);
  assert.deepEqual(transform(once.mirrors, once.sources, once.config), once);
});
test("missing official fallback fails closed", () => {
  assert.throws(
    () => transform(`${azure}\tpriority:1\n`, source),
    /Missing official/,
  );
});
for (const mirror of [
  "https://evil.example/ubuntu/ priority:2\n",
  "http://archive.ubuntu.com/ubuntu/ priority:2\n",
  "https://archive.ubuntu.com/ubuntu/garbage priority:2\n",
  "https://archive.ubuntu.com/ubuntu/ priority:two\n",
]) {
  test(`rejects unsafe/malformed mirror ${JSON.stringify(mirror)}`, () => {
    assert.throws(() => transform(list + mirror, source));
  });
}
for (const changed of [
  source.replace("noble-security", "jammy-security"),
  source.replace("Components: main", "Components: unsafe"),
  source.replace("ubuntu-archive-keyring.gpg", "unknown.gpg"),
  source.replace(`URIs: ${active}`, `URIs: ${active} https://evil.example/`),
  source.replace("Types: deb", "Trusted: yes\nTypes: deb"),
  source.replace("Types: deb", "Allow-Insecure: yes\nTypes: deb"),
  source.replace("Types: deb", "Check-Valid-Until: no\nTypes: deb"),
  source.replace(
    `URIs: ${active}`,
    "URIs: https://azure.archive.ubuntu.com/ubuntu/",
  ),
  source.replace("Components: main", " continuation\nComponents: main"),
]) {
  test(`rejects unsupported active source ${JSON.stringify(changed.slice(0, 110))}`, () => {
    assert.throws(() => transform(list, changed));
  });
}
test("unknown timeout config is not overwritten", () => {
  assert.throws(
    () => transform(list, source, 'Acquire::Retries "99";\n'),
    /Unknown existing/,
  );
});
test("host guard accepts only explicit hosted root Ubuntu 24.04", () => {
  assert.doesNotThrow(() => assertHost(goodHost));
  for (const changed of [
    { uid: 1000 },
    { platform: "darwin" },
    { env: {} },
    { env: { ...goodHost.env, GITHUB_ACTIONS: "false" } },
    { env: { ...goodHost.env, RUNNER_ENVIRONMENT: "self-hosted" } },
    { osRelease: 'ID=ubuntu\nVERSION_ID="22.04"' },
  ])
    assert.throws(() => assertHost({ ...goodHost, ...changed }));
});
test("import is inert even without CI; no automatic main invocation", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(new URL("./ci-ubuntu-mirrors.mjs", import.meta.url).href)})`,
    ],
    { env: {}, encoding: "utf8" },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "");
});
test("CLI outside explicit GitHub CI fails before OS reads/writes", () => {
  const child = spawnSync(
    process.execPath,
    [new URL("./ci-ubuntu-mirrors.mjs", import.meta.url).pathname],
    { env: {}, encoding: "utf8" },
  );
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Only root on explicit GitHub-hosted Linux CI/);
});
