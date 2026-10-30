import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../src/app/globals.css", import.meta.url),
  "utf8",
);
function luminance(hex: string) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function ratio(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
for (const theme of ["light", "dark"]) {
  const block = css.match(
    theme === "light" ? /:root\s*\{([^}]+)\}/ : /\.dark\s*\{([^}]+)\}/,
  )![1];
  const tokens = Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  describe(`${theme} semantic contrast tokens`, () => {
    for (const [foreground, background] of [
      ["foreground", "background"],
      ["foreground", "card"],
      ["muted-foreground", "card"],
      ["muted-foreground", "secondary"],
      ["primary-foreground", "primary"],
      ["primary-foreground", "primary-action"],
      ["primary-foreground", "primary-hover"],
      ["primary", "card"],
      ["primary", "secondary"],
      ["secondary-foreground", "secondary"],
      ["intelligence-foreground", "intelligence"],
      ["intelligence-foreground", "card"],
      ["intelligence-on-accent", "intelligence-accent"],
      ["intelligence-on-accent", "intelligence-hover"],
      ["muted-foreground", "intelligence"],
      ["care-foreground", "care"],
      ["care-foreground", "card"],
      ["success", "success-surface"],
      ["warning", "warning-surface"],
      ["danger", "danger-surface"],
    ]) {
      it(`${foreground} / ${background} meets normal text AA`, () =>
        expect(
          ratio(tokens[foreground], tokens[background]),
        ).toBeGreaterThanOrEqual(4.5));
    }
    for (const indicator of ["ring", "input", "intelligence-border"]) {
      it(`${indicator} is distinguishable on card and page surfaces`, () => {
        expect(ratio(tokens[indicator], tokens.card)).toBeGreaterThanOrEqual(3);
        expect(
          ratio(tokens[indicator], tokens.background),
        ).toBeGreaterThanOrEqual(3);
      });
    }
  });
}

it("uses the approved two-tone PC mark and a version-pinned local Inter asset", () => {
  const logo = readFileSync(
    new URL("../../src/app/icon.svg", import.meta.url),
    "utf8",
  );
  expect(logo).toContain("#8078E5");
  expect(logo).toContain("#B8733A");
  expect(logo).toContain('rx="18"');
  expect(logo).not.toMatch(/<text|<image|filter=|(?:href|src)="https?:/);
  const layout = readFileSync(
    new URL("../../src/app/layout.tsx", import.meta.url),
    "utf8",
  );
  expect(layout).toContain("next/font/local");
  expect(layout).toContain("InterVariable-v4.1.woff2");
  expect(css).toContain("--font-inter");
  expect(
    readFileSync(
      new URL("../../public/licenses/inter-OFL.txt", import.meta.url),
      "utf8",
    ),
  ).toContain("SIL OPEN FONT LICENSE");
});
