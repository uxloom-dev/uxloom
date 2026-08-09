import { describe, expect, it } from "vitest";
import { ProjectSchema } from "@uxloom/journeygraph";

const base = {
  name: "x",
  formatVersion: "0.1" as const,
  platforms: ["web" as const],
  journeys: [],
  screens: [],
};

describe("expanded token model schema (R32)", () => {
  it("accepts the new structural + semantic colors and mode", () => {
    const r = ProjectSchema.safeParse({
      ...base,
      tokens: {
        colors: { accent: "#6D28D9", border: "#222222", success: "#22c55e", warning: "#f59e0b", danger: "#ef4444" },
        mode: "dark",
      },
    });
    expect(r.success).toBe(true);
  });

  it("still rejects unknown token fields (strict) and non-hex colors", () => {
    expect(ProjectSchema.safeParse({ ...base, tokens: { colors: { bogus: "#fff" } } }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, tokens: { colors: { success: "green" } } }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, tokens: { mode: "sepia" } }).success).toBe(false);
  });

  it("is backward compatible — the original token shape still parses", () => {
    expect(ProjectSchema.safeParse({ ...base, tokens: { colors: { accent: "#000000" }, radius: 8 } }).success).toBe(true);
  });
});

describe("block component variants schema (R33)", () => {
  const withBlock = (block: object) => ({
    ...base,
    screens: [{ id: "S", requiredStates: ["default"], designedStates: [], layout: { blocks: [block] } }],
  });

  it("accepts button variant and field state", () => {
    expect(ProjectSchema.safeParse(withBlock({ type: "button", label: "Delete", variant: "danger" })).success).toBe(true);
    expect(ProjectSchema.safeParse(withBlock({ type: "field", label: "Email", state: "error" })).success).toBe(true);
  });

  it("rejects unknown variant / state values", () => {
    expect(ProjectSchema.safeParse(withBlock({ type: "button", variant: "fancy" })).success).toBe(false);
    expect(ProjectSchema.safeParse(withBlock({ type: "field", state: "glowing" })).success).toBe(false);
  });
});
