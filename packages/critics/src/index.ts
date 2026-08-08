import type { Finding, Project, Report } from "@uxloom/journeygraph";
import { journeyCompleteness } from "./journey-completeness.js";
import { stateCoverage } from "./state-coverage.js";
import { wcagContrast } from "./contrast.js";
import { touchTargets } from "./touch-targets.js";
import { textExpansion } from "./text-expansion.js";
import { a11y } from "./a11y.js";

export { journeyCompleteness } from "./journey-completeness.js";
export { stateCoverage } from "./state-coverage.js";
export { wcagContrast, contrastRatio, relativeLuminance } from "./contrast.js";
export { touchTargets } from "./touch-targets.js";
export { textExpansion } from "./text-expansion.js";
export { a11y } from "./a11y.js";

export { type CriticOptions, DEFAULT_OPTIONS } from "./options.js";
import { withDefaults, type CriticOptions } from "./options.js";

/** Run every critic and produce the full report. */
export function critique(project: Project, options?: CriticOptions): Report {
  const opts = withDefaults(options);
  const findings = [
    ...journeyCompleteness(project),
    ...stateCoverage(project),
    ...wcagContrast(project, opts.contrastRatio),
    ...touchTargets(project, opts.touchTargets),
    ...textExpansion(project, opts.expansionFactor),
    ...a11y(project),
  ];

  let designed = 0;
  let required = 0;
  // Declaration coverage: the critics only see declared data — surface how
  // much of the design was actually checkable, so a clean report over an
  // undeclared design can't masquerade as a verified one.
  const declarations = {
    colors: { declared: 0, total: 0 },
    targets: { declared: 0, total: 0 },
    budgets: { declared: 0, total: 0 },
  };
  for (const screen of project.screens) {
    required += screen.requiredStates.length;
    designed += screen.requiredStates.filter((s) =>
      screen.designedStates.includes(s),
    ).length;
    for (const component of screen.components ?? []) {
      declarations.colors.total++;
      if (component.fg && component.bg) declarations.colors.declared++;
      if (component.interactive) {
        declarations.targets.total++;
        if (component.minTargetPx !== undefined) declarations.targets.declared++;
      }
      if (component.label) {
        declarations.budgets.total++;
        if (component.label.maxChars !== undefined) declarations.budgets.declared++;
      }
    }
  }

  return {
    findings,
    summary: {
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      journeys: project.journeys.length,
      screens: project.screens.length,
      stateCoverage: { designed, required },
      declarations,
    },
  };
}

/** Findings scoped to one screen (its own checks + journey refs to it). */
export function critiqueScreen(project: Project, screenId: string): Finding[] {
  return critique(project).findings.filter((f) => f.screen === screenId);
}
