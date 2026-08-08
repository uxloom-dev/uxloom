import type { Finding, Project } from "@uxloom/journeygraph";

const CRITIC = "touch-targets";

/**
 * Platform minimum touch-target sizes (px at 1x). Defaults:
 *  - iOS Human Interface Guidelines: 44pt
 *  - Android Material: 48dp
 *  - Web (WCAG 2.2 target-size AA): 24px minimum, 44px recommended
 * Configurable upward for stricter company bars.
 */
const SOURCES: Record<string, string> = {
  ios: "iOS HIG 44pt",
  android: "Material 48dp",
  mweb: "44px recommended for touch web",
  web: "WCAG 2.2 target-size minimum 24px",
};
const DEFAULT_MINIMUMS: Record<string, number> = { ios: 44, android: 48, mweb: 44, web: 24 };

export function touchTargets(
  project: Project,
  minimums: Partial<Record<string, number>> = {},
): Finding[] {
  const findings: Finding[] = [];
  const mins = { ...DEFAULT_MINIMUMS, ...minimums };

  for (const screen of project.screens) {
    const platforms = screen.platforms ?? project.platforms;
    for (const component of screen.components ?? []) {
      if (!component.interactive || component.minTargetPx === undefined) continue;
      for (const platform of platforms) {
        const rule = mins[platform] !== undefined
          ? { min: mins[platform]!, source: SOURCES[platform] ?? `configured ${mins[platform]}px` }
          : undefined;
        if (rule && component.minTargetPx < rule.min) {
          findings.push({
            critic: CRITIC,
            code: "target-too-small",
            severity: "error",
            screen: screen.id,
            component: component.id ?? component.semantic,
            message: `"${component.semantic}" on "${screen.id}" has a ${component.minTargetPx}px target — below the ${platform} minimum (${rule.source}).`,
            fix: `Increase the target (including padding/hit-slop) to at least ${rule.min}px on ${platform}.`,
          });
        }
      }
    }
  }

  return findings;
}
