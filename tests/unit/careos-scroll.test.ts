import { describe, expect, it } from "vitest";
import { intentionalUpwardScroll } from "@/components/careos/use-conversation-scroll";

describe("transcript reading intent survives composer reflow", () => {
  it("does not pause following when Chrome clamps the old position to a shorter range", () => {
    expect(intentionalUpwardScroll(22, 0, 0)).toBe(false);
    expect(intentionalUpwardScroll(150, 50, 50)).toBe(false);
  });
  it("still pauses for a genuine upward scroll within the valid range", () => {
    expect(intentionalUpwardScroll(150, 100, 500)).toBe(true);
    expect(intentionalUpwardScroll(150, 100, 150)).toBe(true);
  });
  it("does not treat downward, unchanged or subpixel-tolerance adjustments as reading up", () => {
    expect(intentionalUpwardScroll(20, 40, 100)).toBe(false);
    expect(intentionalUpwardScroll(20, 20, 100)).toBe(false);
    expect(intentionalUpwardScroll(20, 19, 100)).toBe(false);
  });
});
