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
      ["secondary-foreground", "secondary"],
      ["intelligence-foreground", "intelligence"],
      ["success", "success-surface"],
      ["warning", "warning-surface"],
      ["danger", "danger-surface"],
    ]) {
      it(`${foreground} / ${background} meets normal text AA`, () =>
        expect(
          ratio(tokens[foreground], tokens[background]),
        ).toBeGreaterThanOrEqual(4.5));
    }
    for (const indicator of ["ring", "input"]) {
      it(`${indicator} is distinguishable on card and page surfaces`, () => {
        expect(ratio(tokens[indicator], tokens.card)).toBeGreaterThanOrEqual(3);
        expect(
          ratio(tokens[indicator], tokens.background),
        ).toBeGreaterThanOrEqual(3);
      });
    }
  });
}
