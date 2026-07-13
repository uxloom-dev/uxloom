import type { Finding, Project } from "@uxloom/journeygraph";

const CRITIC = "text-expansion";

/**
 * Localization expansion factor. German/Finnish routinely run 30–40%
 * longer than English for UI-length strings (short strings expand the
 * most). 1.4 is the standard pseudo-localization planning factor.
 */
const EXPANSION = 1.4;

/**
 * Flags labels whose translated length will overflow the space the
 * design allocated — before a single translation exists.
 */
export function textExpansion(project: Project): Finding[] {
  const findings: Finding[] = [];

  for (const screen of project.screens) {
    for (const component of screen.components ?? []) {
      const label = component.label;
      if (!label?.maxChars) continue;
      const projected = Math.ceil(label.en.length * EXPANSION);
      if (projected > label.maxChars) {
        findings.push({
          critic: CRITIC,
          code: "label-overflow",
          severity: "warning",
          screen: screen.id,
          component: component.id ?? component.semantic,
          message: `Label "${label.en}" (${label.key}) is ${label.en.length} chars; at ×${EXPANSION} localization expansion it projects to ${projected}, over the layout budget of ${label.maxChars}. German will break this.`,
          fix: `Shorten the English source, or widen the layout budget to ≥ ${projected} chars.`,
        });
      }
    }
  }

  return findings;
}
