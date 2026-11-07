import {
  constants as C,
  lstatSync,
  openSync,
  fstatSync,
  readFileSync,
  writeFileSync,
  writeSync,
  ftruncateSync,
  closeSync,
} from "node:fs";
import { pathToFileURL } from "node:url";

const MIRRORS = "/etc/apt/apt-mirrors.txt";
const SOURCES = "/etc/apt/sources.list.d/ubuntu.sources";
const CONFIG = "/etc/apt/apt.conf.d/99palcareci";
const ACTIVE = `mirror+file:${MIRRORS}`;
const AZURE = "http://azure.archive.ubuntu.com/ubuntu/";
const OFFICIAL = new Set([
  "https://archive.ubuntu.com/ubuntu/",
  "https://security.ubuntu.com/ubuntu/",
]);
export const aptConfig =
  'Acquire::http::Timeout "15";\nAcquire::https::Timeout "15";\nAcquire::Retries "1";\n';
const requireThat = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Only the documented Ubuntu runner format: retain signed official fallbacks,
// suites/components/keyrings and every unrelated source byte-for-byte.
export function transform(mirrors, sources, config = null) {
  requireThat(
    config === null || config === aptConfig,
    "Unknown existing 99palcareci",
  );
  let fallbacks = 0;
  const kept = mirrors
    .split(/(?<=\n)/)
    .filter((line) => {
      if (/^[ \t]*(?:#[^\r\n]*)?\n?$/.test(line)) return true;
      const match = /^(\S+)[ \t]+priority:([1-9][0-9]*)[ \t]*\n?$/.exec(line);
      requireThat(match, "Unknown mirror-list format");
      if (match[1] === AZURE) return false;
      requireThat(OFFICIAL.has(match[1]), "Unsafe or unknown mirror URI");
      fallbacks++;
      return true;
    })
    .join("");
  requireThat(fallbacks > 0, "Missing official HTTPS fallback");
  let active = 0;
  const updated = sources
    .split(/(\n[ \t]*\n)/)
    .map((block) => {
      if (
        !block.includes(ACTIVE) &&
        !block.includes("azure.archive.ubuntu.com")
      )
        return block;
      const fields = new Map();
      for (const line of block.split("\n")) {
        if (/^\s*(?:#.*)?$/.test(line)) continue;
        const match = /^([A-Za-z][A-Za-z-]*):[ \t]*(\S.*?)[ \t]*$/.exec(line);
        requireThat(match, "Unsupported deb822 format");
        const key = match[1].toLowerCase();
        requireThat(!fields.has(key), "Duplicate source field");
        fields.set(key, match[2]);
      }
      if (!fields.size) return block;
      const uris = fields.get("uris")?.split(/\s+/) ?? [];
      if (!uris.some((uri) => uri === AZURE || uri === ACTIVE)) {
        requireThat(
          !block.includes("azure.archive.ubuntu.com") &&
            !block.includes(ACTIVE),
          "Unrecognized active URI",
        );
        return block;
      }
      requireThat(
        uris.length === 1,
        "Mixed active URIs require separate review",
      );
      requireThat(fields.get("types") === "deb", "Unexpected source type");
      requireThat(
        /^noble(?:-(?:updates|backports|security))?(?: noble(?:-(?:updates|backports|security))?)*$/.test(
          fields.get("suites") ?? "",
        ),
        "Unexpected suites",
      );
      const components = fields.get("components")?.split(/\s+/) ?? [];
      requireThat(
        components.length &&
          components.every((v) =>
            ["main", "restricted", "universe", "multiverse"].includes(v),
          ),
        "Unexpected components",
      );
      requireThat(
        fields.get("signed-by") ===
          "/usr/share/keyrings/ubuntu-archive-keyring.gpg",
        "Unexpected signing key",
      );
      requireThat(
        [...fields.keys()].every((key) =>
          [
            "types",
            "uris",
            "suites",
            "components",
            "signed-by",
            "architectures",
            "enabled",
          ].includes(key),
        ),
        "Unknown active source option",
      );
      requireThat(
        !fields.has("enabled") || fields.get("enabled") === "yes",
        "Disabled source",
      );
      active++;
      return uris[0] === ACTIVE
        ? block
        : block.replace(
            /^(URIs:[ \t]*)http:\/\/azure\.archive\.ubuntu\.com\/ubuntu\/([ \t]*)$/im,
            `$1${ACTIVE}$2`,
          );
    })
    .join("");
  requireThat(active > 0, "Missing supported active Ubuntu source");
  return { mirrors: kept, sources: updated, config: aptConfig };
}

function assertRunner({ env, platform, uid }) {
  requireThat(
    env.CI === "true" &&
      env.GITHUB_ACTIONS === "true" &&
      env.RUNNER_ENVIRONMENT === "github-hosted" &&
      platform === "linux" &&
      uid === 0,
    "Only root on explicit GitHub-hosted Linux CI",
  );
}
export function assertHost(host) {
  assertRunner(host);
  requireThat(
    /^ID=(?:ubuntu|"ubuntu")$/m.test(host.osRelease) &&
      /^VERSION_ID=(?:24\.04|"24\.04")$/m.test(host.osRelease),
    "Only Ubuntu 24.04",
  );
}
function safeStat(stat) {
  requireThat(
    stat.uid === 0 && !(stat.mode & 0o022),
    "Expected root-owned non-writable-by-others apt path",
  );
}
export function main() {
  // No path overrides and no OS reads outside explicit ephemeral hosted CI.
  const host = {
    env: process.env,
    platform: process.platform,
    uid: process.getuid?.(),
  };
  assertRunner(host);
  requireThat(process.argv.length === 2, "No CLI arguments supported");
  assertHost({ ...host, osRelease: readFileSync("/etc/os-release", "utf8") });
  for (const dir of [
    "/etc",
    "/etc/apt",
    "/etc/apt/sources.list.d",
    "/etc/apt/apt.conf.d",
  ]) {
    const stat = lstatSync(dir);
    safeStat(stat);
    requireThat(stat.isDirectory(), "Symlink or non-directory apt parent");
  }
  const handles = [];
  try {
    const read = (path, optional = false) => {
      let fd;
      try {
        const before = lstatSync(path);
        safeStat(before);
        requireThat(before.isFile(), "Symlink or non-regular apt file");
        fd = openSync(path, C.O_RDWR | C.O_NOFOLLOW);
      } catch (error) {
        if (optional && error.code === "ENOENT") return null;
        throw error;
      }
      handles.push(fd);
      const stat = fstatSync(fd);
      safeStat(stat);
      requireThat(stat.isFile(), "Expected regular apt file");
      return { fd, content: readFileSync(fd, "utf8") };
    };
    const mirrors = read(MIRRORS),
      sources = read(SOURCES),
      config = read(CONFIG, true);
    const result = transform(
      mirrors.content,
      sources.content,
      config?.content ?? null,
    );
    // Preflight every input before writes. Any failure remains fatal to CI.
    for (const [file, content] of [
      [mirrors, result.mirrors],
      [sources, result.sources],
    ]) {
      if (file.content === content) continue;
      const bytes = Buffer.from(content);
      for (let offset = 0; offset < bytes.length;) {
        const written = writeSync(
          file.fd,
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
        requireThat(written > 0, "Short apt file write");
        offset += written;
      }
      ftruncateSync(file.fd, bytes.length);
    }
    if (!config) {
      const fd = openSync(
        CONFIG,
        C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
        0o644,
      );
      handles.push(fd);
      writeFileSync(fd, result.config);
    }
    console.log(
      "Official HTTPS fallback list selected; inactivity bounds configured. No speed claim.",
    );
  } finally {
    for (const fd of handles) closeSync(fd);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
