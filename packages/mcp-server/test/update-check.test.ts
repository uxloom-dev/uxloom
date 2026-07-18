import { describe, expect, it } from "vitest";
import { isNewer, updateNotice } from "uxloom/dist/update-check.js";

describe("update notifier", () => {
  it("compares semver numerically, not lexically", () => {
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("1.0.0", "0.99.99")).toBe(true);
    expect(isNewer("0.3.0", "0.3.0")).toBe(false);
    expect(isNewer("0.2.9", "0.3.0")).toBe(false);
    expect(isNewer("garbage", "0.3.0")).toBe(false);
  });

  it("is fully disabled by UXLOOM_NO_UPDATE_CHECK", async () => {
    process.env.UXLOOM_NO_UPDATE_CHECK = "1";
    try {
      expect(await updateNotice("0.0.1")).toBeNull();
    } finally {
      delete process.env.UXLOOM_NO_UPDATE_CHECK;
    }
  });
});
