import type { Finding, Project, Report } from "@uxloom/journeygraph";
import { journeyCompleteness } from "./journey-completeness.js";
import { stateCoverage } from "./state-coverage.js";
import { wcagContrast } from "./contrast.js";
import { touchTargets } from "./touch-targets.js";
import { textExpansion } from "./text-expansion.js";

export { journeyCompleteness } from "./journey-completeness.js";
export { stateCoverage } from "./state-coverage.js";
export { wcagContrast, contrastRatio, relativeLuminance } from "./contrast.js";
export { touchTargets } from "./touch-targets.js";
export { textExpansion } from "./text-expansion.js";

const ALL_CRITICS: Array<(project: Project) => Finding[]> = [
  journeyCompleteness,
  stateCoverage,
  wcagContrast,
  touchTargets,
  textExpansion,
];

/** Run every critic and produce the full report. */
export function critique(project: Project): Report {
  const findings = ALL_CRITICS.flatMap((critic) => critic(project));

  let designed = 0;
  let required = 0;
  for (const screen of project.screens) {
    required += screen.requiredStates.length;
    designed += screen.requiredStates.filter((s) =>
      screen.designedStates.includes(s),
    ).length;
  }

  return {
    findings,
    summary: {
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      journeys: project.journeys.length,
      screens: project.screens.length,
      stateCoverage: { designed, required },
    },
  };
}

/** Findings scoped to one screen (its own checks + journey refs to it). */
export function critiqueScreen(project: Project, screenId: string): Finding[] {
  return critique(project).findings.filter((f) => f.screen === screenId);
}
