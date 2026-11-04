import { describe, expect, it } from "vitest";
import {
  careWorkerContainerArgs,
  careWorkerTarget,
  CARE_WORKER_IMAGE,
} from "../../scripts/care-worker-container";

describe("isolated private checker", () => {
  it("uses a pinned no-pull, non-root, read-only, network-disabled container with no credential mounts", () => {
    const args = careWorkerContainerArgs(
      "/repo",
      "/private/check",
      "test-name",
    );
    expect(args.join(" ")).toContain(
      "--network none --user 1000:1000 --read-only --cap-drop ALL",
    );
    expect(args.join(" ")).toContain("--pull never");
    expect(args).toContain(CARE_WORKER_IMAGE);
    expect(args.join(" ")).not.toMatch(
      /\.env|\.config|docker\.sock|CAREOS|PAYPAL|MIGRATION/,
    );
    expect(args.slice(-2)).toEqual(["scripts/care-records.ts", "check"]);
  });
  it("accepts only the two approved local PostgreSQL ports, no host override", () => {
    expect(
      careWorkerTarget(
        "postgresql://worker:test-only@127.0.0.1:55440/care_test",
      ).port,
    ).toBe(55440);
    for (const value of [
      "postgresql://worker:test-only@remote.test:55432/app",
      "postgresql://worker:test-only@127.0.0.1:443/app",
      "postgresql://worker:test-only@127.0.0.1:55432/app?host=evil.test",
    ])
      expect(() => careWorkerTarget(value)).toThrow();
  });
});
