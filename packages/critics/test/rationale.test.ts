import { describe, expect, it } from "vitest";
import { parseProject } from "@uxloom/journeygraph";
import { critique, rationale, rationaleCoverage } from "@uxloom/critics";

const GOOD_RATIONALE = {
  decision: "Single-column checkout",
  reasoning: "Checkout is a completion task; category convention is a distraction-free linear flow with visible progress, and this product is mobile-first.",
  alternatives: [{ option: "Two-column", pros: ["cart visible"], cons: ["collapses poorly on mobile"] }],
  confidence: "high" as const,
};

const SCREEN = {
  id: "S",
  requiredStates: ["default", "empty", "loading", "error.network"],
  designedStates: ["default", "empty", "loading", "error.network"],
};

const base = (extra: Record<string, unknown>) =>
  parseProject({
    name: "t", formatVersion: "0.1", platforms: ["web"],
    journeys: [{ id: "j", entry: "a", states: { a: { screen: "S", final: true } } }],
    screens: [SCREEN],
    ...extra,
  });

describe("rationale critic (adoption-gated)", () => {
  it("stays silent when no rationale exists anywhere", () => {
    expect(rationale(base({}))).toEqual([]);
    expect(rationaleCoverage(base({})).optedIn).toBe(false);
  });

  it("enforces coverage everywhere once the project opts in", () => {
    const p = base({ rationale: GOOD_RATIONALE });
    const findings = rationale(p);
    expect(findings.map((f) => f.code)).toEqual(["rationale-missing", "rationale-missing"]);
    expect(findings.map((f) => f.journey ?? f.screen)).toEqual(["j", "S"]);
  });

  it("can be forced on via requireRationale before any rationale exists", () => {
    const findings = rationale(base({}), true);
    expect(findings).toHaveLength(3); // project + journey + screen
    expect(critique(base({}), { requireRationale: true }).findings.some((f) => f.code === "rationale-missing")).toBe(true);
  });

  it("flags thin rationale: short reasoning or no compared alternatives", () => {
    const short = { decision: "X", reasoning: "Because it looks nice today" };
    const noAlt = { ...GOOD_RATIONALE, alternatives: undefined };
    const p = base({
      rationale: GOOD_RATIONALE,
      journeys: [{ id: "j", entry: "a", states: { a: { screen: "S", final: true } }, rationale: short }],
      screens: [{ ...SCREEN, rationale: noAlt }],
    });
    const findings = rationale(p);
    expect(findings.filter((f) => f.code === "rationale-thin")).toHaveLength(2);
    expect(findings.find((f) => f.journey === "j")!.message).toContain("caption");
    expect(findings.find((f) => f.screen === "S")!.message).toContain("guess");
  });

  it("fully evidenced project produces zero rationale findings", () => {
    const p = base({
      rationale: GOOD_RATIONALE,
      journeys: [{ id: "j", entry: "a", states: { a: { screen: "S", final: true } }, rationale: GOOD_RATIONALE }],
      screens: [{ ...SCREEN, rationale: GOOD_RATIONALE }],
    });
    expect(rationale(p)).toEqual([]);
    const rc = rationaleCoverage(p);
    expect(rc).toEqual({ documented: 3, total: 3, optedIn: true });
  });
});
