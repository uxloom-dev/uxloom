import { describe, expect, it } from "vitest";
import { parseProject } from "@uxloom/journeygraph";
import { a11y, critique, wcagContrast } from "@uxloom/critics";

const base = { name: "t", formatVersion: "0.1" as const, platforms: ["web" as const], journeys: [] };
const screen = (components: unknown[]) =>
  parseProject({
    ...base,
    screens: [{
      id: "S",
      requiredStates: ["default", "empty", "loading", "error.network"],
      designedStates: ["default", "empty", "loading", "error.network"],
      components,
    }],
  });

describe("a11y pack v1", () => {
  it("flags interactive components without labels", () => {
    const p = screen([{ semantic: "Button.Icon", interactive: true, minTargetPx: 48 }]);
    expect(a11y(p)).toContainEqual(
      expect.objectContaining({ code: "unlabeled-interactive", screen: "S" }),
    );
  });

  it("does not flag labeled interactives or non-interactive components", () => {
    const p = screen([
      { semantic: "Button.Primary", interactive: true, minTargetPx: 48, label: { key: "k", en: "Go" } },
      { semantic: "Text.Body" },
    ]);
    expect(a11y(p)).toEqual([]);
  });

  it("flags decorative motion, not essential or none", () => {
    const p = screen([
      { semantic: "Hero.Anim", motion: "decorative" },
      { semantic: "Progress.Bar", motion: "essential" },
      { semantic: "Text.Body", motion: "none" },
    ]);
    const findings = a11y(p);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: "motion-fallback", component: "Hero.Anim" });
  });

  it("large text checks contrast at 3:1 instead of 4.5:1", () => {
    // ~3.5:1 pair: passes large (3:1), fails normal (4.5:1).
    const pair = { fg: "#898989", bg: "#FFFFFF" };
    const large = screen([{ semantic: "Display.Title", textRole: "large", ...pair }]);
    const normal = screen([{ semantic: "Text.Body", ...pair }]);
    expect(wcagContrast(large)).toEqual([]);
    expect(wcagContrast(normal)).toHaveLength(1);
  });

  it("is wired into critique()", () => {
    const p = screen([{ semantic: "Button.Icon", interactive: true, minTargetPx: 48 }]);
    expect(critique(p).findings.some((f) => f.code === "unlabeled-interactive")).toBe(true);
  });
});
