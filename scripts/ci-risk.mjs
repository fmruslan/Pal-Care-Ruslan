import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ts = createRequire(resolve("package.json"))("typescript");

// Deliberately small allowlists. Unrecognized paths and changes fail upward.
const ui = new Set([
  "src/components/care/calendar-rail.tsx",
  "src/components/care/calendar.tsx",
  "src/components/care/feed.tsx",
]);
const copy = "src/lib/care/demo/consumer.ts";
const css = "src/app/customer-visual.css";
const featureFiles = new Set([
  "src/app/dashboard/page.tsx",
  "src/app/purchases/page.tsx",
  "src/app/insights/page.tsx",
  "src/lib/care/calendar.ts",
  "src/lib/care/summary.ts",
  "src/lib/care/model.ts",
  "src/lib/care/ownership.ts",
  "src/lib/care/answer.ts",
  copy,
  css,
  ...[
    "care-calendar-state",
    "records-chart",
    "customer-presentation",
    "customer-commands",
    "customer-observation",
    "customer-model",
    "customer-state",
    "filters",
    "layout",
  ].map((n) => `src/lib/intelligence/${n}.ts`),
]);
const rank = { fast: 0, feature: 1, full: 2 };
const presentationProperties = new Set([
  "status",
  "summary",
  "action",
  "nextStep",
]);
const cosmeticClass =
  /^(?:(?:sm|md|lg|xl|2xl|dark|hover|focus|focus-visible):)*(?:text-(?!transparent)[a-z0-9/-]+|font-[a-z0-9-]+|leading-[a-z0-9.-]+|tracking-[a-z0-9-]+|bg-[a-z0-9/-]+|border(?:-[a-z0-9/.-]+)?|rounded(?:-[a-z0-9-]+)?|shadow(?:-[a-z0-9/-]+)?|[pm][trblxyse]?-[a-z0-9.]+|gap(?:-[xy])?-[a-z0-9.]+|(?:w|h|min-w|max-w|min-h|max-h|size)-[a-z0-9/.]+)$/;

function copyValue(node) {
  let value = node;
  while (
    ts.isConditionalExpression(value.parent) &&
    (value.parent.whenTrue === value || value.parent.whenFalse === value)
  )
    value = value.parent;
  return (
    ts.isPropertyAssignment(value.parent) &&
    value.parent.initializer === value &&
    presentationProperties.has(value.parent.name.getText())
  );
}
/** AST structure/identifiers/expressions stay identical. Never strip arbitrary strings. */
export function presentationFingerprint(path, source) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (file.parseDiagnostics.length) return null;
  const comments = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.JSX,
    source,
  );
  for (
    let kind = scanner.scan();
    kind !== ts.SyntaxKind.EndOfFileToken;
    kind = scanner.scan()
  )
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    )
      comments.push(scanner.getTokenText());
  function walk(node) {
    if (ui.has(path) && ts.isJsxText(node)) return [node.kind, "COPY"];
    if (
      ui.has(path) &&
      ts.isStringLiteral(node) &&
      ts.isJsxAttribute(node.parent) &&
      node.parent.name.getText() === "className" &&
      !/url\s*\(|(?:https?|javascript|data):|\\/i.test(node.text)
    )
      return [
        node.kind,
        "CLASS",
        node.text
          .split(/\s+/)
          .filter((token) => token && !cosmeticClass.test(token)),
      ];
    if (
      path === copy &&
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      copyValue(node)
    )
      return [node.kind, "COPY"];
    // Template substitutions are executable and are always fingerprinted.
    if (
      path === copy &&
      (ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node))
    ) {
      const expression = ts.isTemplateExpression(node.parent)
        ? node.parent
        : node.parent.parent;
      if (ts.isTemplateExpression(expression) && copyValue(expression))
        return [node.kind, "COPY"];
    }
    const children = node.getChildren(file).map(walk);
    return children.length
      ? [node.kind, children]
      : [node.kind, node.getText(file)];
  }
  return JSON.stringify([comments, walk(file)]);
}
const safeProperty =
  /^(?:color|background(?:-color)?|border(?:-(?:color|width|style|radius|top|right|bottom|left))?|box-shadow|text-shadow|font(?:-size|-weight|-family)?|line-height|letter-spacing|text-align|gap|row-gap|column-gap|padding(?:-(?:top|right|bottom|left|inline|block))?|margin(?:-(?:top|right|bottom|left|inline|block))?|width|min-width|max-width|height|min-height|max-height)$/;
export function cssFingerprint(source) {
  // No remote resources, directives, executable legacy CSS, escapes, or hidden new rules.
  if (/url\s*\(|expression\s*\(|\\/i.test(source)) return null;
  return source.replace(
    /([;{]\s*)([a-z-]+)(\s*:\s*)([^;{}]+)(?=;|})/gi,
    (all, before, property, colon) =>
      safeProperty.test(property) ? `${before}${property}${colon}VALUE` : all,
  );
}
export function classifyChange({ path, status = "M", before, after }) {
  if (status !== "M" || typeof before !== "string" || typeof after !== "string")
    return "full";
  if (
    /^(?:README\.md|docs\/.*\.md)$/.test(path) &&
    !/^docs\/(?:SECURITY|WORKSPACE|CI-POLICY)\.md$/.test(path)
  )
    return "fast";
  if (
    /^tests\/e2e\/visual\/(?:desktop|tablet|mobile)-(?:light|dark)\/(?:home|dashboard|passport)\.png$/.test(
      path,
    )
  )
    return "fast";
  if (ui.has(path) || path === copy) {
    const old = presentationFingerprint(path, before),
      next = presentationFingerprint(path, after);
    if (old !== null && old === next) return "fast";
    return "feature";
  }
  if (path === css) {
    const old = cssFingerprint(before),
      next = cssFingerprint(after);
    return old !== null && old === next ? "fast" : "feature";
  }
  if (
    featureFiles.has(path) ||
    /^src\/components\/(?:care|careos|intelligence)\/[^/]+\.tsx$/.test(path) ||
    /^tests\/(?:unit\/care-(?:calendar|consumer|ten-products)\.test\.ts|e2e\/(?:care-homepage|care-ten-products|customer-insights|integrated-north|design)\.spec\.ts)$/.test(
      path,
    )
  )
    return "feature";
  return "full";
}
export function classifyChanges(changes, forceFull = false) {
  const reasons = changes.map((change) => ({
    path: change.path,
    lane: classifyChange(change),
  }));
  const lane =
    forceFull || !changes.length
      ? "full"
      : reasons.reduce(
          (current, r) => (rank[r.lane] > rank[current] ? r.lane : current),
          "fast",
        );
  return { lane, reasons, forceFull };
}
export function classificationForGit(
  { base, head, event, ref },
  git = (...args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }),
) {
  const full = (reason) => ({
    lane: "full",
    reasons: [{ path: reason, lane: "full" }],
    forceFull: true,
    base,
    head,
  });
  if (!/^[a-f0-9]{40}$/.test(head ?? "")) throw Error("exact_head_required");
  if (
    !["push", "pull_request"].includes(event) ||
    ref?.startsWith("refs/tags/") ||
    !/^[a-f0-9]{40}$/.test(base ?? "") ||
    /^0+$/.test(base)
  )
    return full("forced-or-missing-base");
  try {
    git("merge-base", "--is-ancestor", base, head);
    const fields = git(
      "diff",
      "--no-renames",
      "--name-status",
      "-z",
      base,
      head,
    )
      .split("\0")
      .filter(Boolean);
    const changes = [];
    for (let i = 0; i < fields.length; i += 2) {
      const status = fields[i],
        path = fields[i + 1];
      if (!path || !["M", "A", "D", "T"].includes(status))
        return full("unrecognized-diff");
      const read = (sha) => git("show", `${sha}:${path}`);
      changes.push({
        status,
        path,
        before: status === "A" ? undefined : read(base),
        after: status === "D" ? undefined : read(head),
      });
    }
    return { ...classifyChanges(changes), base, head };
  } catch {
    return full("unavailable-or-nonancestor-diff");
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = classificationForGit({
    base: process.env.CI_BASE,
    head: process.env.CI_HEAD,
    event: process.env.CI_EVENT,
    ref: process.env.GITHUB_REF,
  });
  writeFileSync("ci-risk.json", JSON.stringify(result, null, 2) + "\n");
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `lane=${result.lane}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Risk lane: ${result.lane}\n\nExact head: \`${result.head}\`\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`,
    );
  console.log(JSON.stringify(result));
}
