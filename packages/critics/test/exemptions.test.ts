import { describe, expect, it } from "vitest";
import { parseProject, ScreenSchema } from "@uxloom/journeygraph";
import { stateCoverage } from "@uxloom/critics";

const base = {
  name: "t",
  formatVersion: "0.1" as const,
  platforms: ["web" as const],
  journeys: [],
};

describe("exemptions", () => {
  it("suppresses the happy-path warning for documented states", () => {
    const project = parseProject({
      ...base,
      screens: [
        {
          id: "ConfirmScreen",
          requiredStates: ["default", "loading"],
          designedStates: ["default", "loading"],
          exemptions: [
            { state: "empty", reason: "Terminal confirmation; reached only with a placed order." },
            { state: "error.any", reason: "Failures surface upstream before this state is reachable." },
          ],
        },
      ],
    });
    const warnings = stateCoverage(project).filter((f) => f.code === "happy-path-contract");
    expect(warnings).toEqual([]);
  });

  it("still warns for undocumented gaps", () => {
    const project = parseProject({
      ...base,
      screens: [
        {
          id: "ListScreen",
          requiredStates: ["default", "loading"],
          designedStates: ["default", "loading"],
          exemptions: [
            { state: "error.any", reason: "Read-only cached content, failures fall back silently." },
          ],
        },
      ],
    });
    const warnings = stateCoverage(project).filter((f) => f.code === "happy-path-contract");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("empty");
    expect(warnings[0].message).not.toContain("error.*");
  });

  it("flags contradictory exemptions (state both exempted and required)", () => {
    const project = parseProject({
      ...base,
      screens: [
        {
          id: "S",
          requiredStates: ["default", "empty", "loading", "error.network"],
          designedStates: ["default", "empty", "loading", "error.network"],
          exemptions: [{ state: "empty", reason: "This reason is stale and contradictory." }],
        },
      ],
    });
    expect(stateCoverage(project)).toContainEqual(
      expect.objectContaining({ code: "contradictory-exemption", screen: "S" }),
    );
  });

  it("rejects lazy one-word exemption reasons", () => {
    const result = ScreenSchema.safeParse({
      id: "S",
      requiredStates: ["default"],
      designedStates: ["default"],
      exemptions: [{ state: "empty", reason: "n/a" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields instead of silently stripping them", () => {
    const result = ScreenSchema.safeParse({
      id: "S",
      requiredStates: ["default"],
      designedStates: ["default"],
      exemption: [{ state: "empty", reason: "typo in the field name above" }],
    });
    expect(result.success).toBe(false);
  });
});
