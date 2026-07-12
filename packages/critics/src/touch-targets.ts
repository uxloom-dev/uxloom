import type { Finding, Project } from "@uxloom/journeygraph";

const CRITIC = "touch-targets";

/**
 * Platform minimum touch-target sizes (px at 1x):
 *  - iOS Human Interface Guidelines: 44pt
 *  - Android Material: 48dp
 *  - Web (WCAG 2.2 target-size AA): 24px minimum, 44px recommended
 */
const MINIMUMS: Record<string, { min: number; source: string }> = {
  ios: { min: 44, source: "iOS HIG 44pt" },
  android: { min: 48, source: "Material 48dp" },
  mweb: { min: 44, source: "44px recommended for touch web" },
  web: { min: 24, source: "WCAG 2.2 target-size minimum 24px" },
};

export function touchTargets(project: Project): Finding[] {
  const findings: Finding[] = [];

  for (const screen of project.screens) {
    const platforms = screen.platforms ?? project.platforms;
    for (const component of screen.components ?? []) {
      if (!component.interactive || component.minTargetPx === undefined) continue;
      for (const platform of platforms) {
        const rule = MINIMUMS[platform];
        if (rule && component.minTargetPx < rule.min) {
          findings.push({
            critic: CRITIC,
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
