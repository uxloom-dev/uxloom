import type { Finding, Project } from "@uxloom/journeygraph";

const CRITIC = "a11y";

/**
 * Accessibility pack v1 (RFC 0004 R11) — only rules that are honestly
 * checkable at design-data level. No checkbox theater: broader WCAG
 * coverage (focus order, keyboard flows) needs modeling work, not rules.
 */
export function a11y(project: Project): Finding[] {
  const findings: Finding[] = [];

  for (const screen of project.screens) {
    for (const component of screen.components ?? []) {
      // WCAG 4.1.2-adjacent: an interactive element with no accessible
      // label gives screen-reader users nothing to act on.
      if (component.interactive && !component.label) {
        findings.push({
          critic: CRITIC,
          code: "unlabeled-interactive",
          severity: "warning",
          screen: screen.id,
          component: component.id ?? component.semantic,
          message: `Interactive "${component.semantic}" on "${screen.id}" has no label — screen readers announce nothing actionable.`,
          fix: `Add a label ({ key, en }) — it becomes the accessible name (and the i18n key).`,
        });
      }
      // WCAG 2.3.3-adjacent: decorative motion must be skippable.
      if (component.motion === "decorative") {
        findings.push({
          critic: CRITIC,
          code: "motion-fallback",
          severity: "warning",
          screen: screen.id,
          component: component.id ?? component.semantic,
          message: `"${component.semantic}" on "${screen.id}" declares decorative motion — it must honor prefers-reduced-motion.`,
          fix: `Implement a reduced-motion alternative (static or cross-fade), or mark motion "essential" with a reason if the motion carries meaning.`,
        });
      }
    }
  }
  return findings;
}
