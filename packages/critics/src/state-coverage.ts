import type { Finding, Project } from "@uxloom/journeygraph";

const CRITIC = "state-coverage";

/** Baseline states most data-bearing screens need beyond the happy path. */
const BASELINE = ["loading", "empty"];
const ERROR_PREFIX = "error";

/**
 * The anti-happy-path critic:
 *  - every requiredState must be designed (contract vs. progress)
 *  - designed states not declared required are flagged (drift)
 *  - screens whose contract is happy-path-only get a warning with the
 *    baseline states real products need
 */
export function stateCoverage(project: Project): Finding[] {
  const findings: Finding[] = [];

  for (const screen of project.screens) {
    const required = new Set(screen.requiredStates);
    const designed = new Set(screen.designedStates);

    for (const state of screen.requiredStates) {
      if (!designed.has(state)) {
        findings.push({
          critic: CRITIC,
          severity: "error",
          screen: screen.id,
          state,
          message: `Screen "${screen.id}" requires state "${state}" but it has not been designed.`,
          fix: `Design the "${state}" state of "${screen.id}" (or remove it from requiredStates if truly not needed).`,
        });
      }
    }

    for (const state of screen.designedStates) {
      if (!required.has(state)) {
        findings.push({
          critic: CRITIC,
          severity: "warning",
          screen: screen.id,
          state,
          message: `Screen "${screen.id}" has a designed state "${state}" that is not in its contract (requiredStates). The contract and the design are drifting.`,
          fix: `Add "${state}" to requiredStates, or delete the orphaned design.`,
        });
      }
    }

    const hasError = screen.requiredStates.some((s) => s.startsWith(ERROR_PREFIX));
    const missingBaseline = BASELINE.filter((s) => !required.has(s));
    if (!hasError || missingBaseline.length > 0) {
      const gaps = [...missingBaseline, ...(hasError ? [] : ["error.*"])];
      findings.push({
        critic: CRITIC,
        severity: "warning",
        screen: screen.id,
        message: `Screen "${screen.id}" contract looks happy-path-only. Missing baseline states: ${gaps.join(", ")}.`,
        fix: `Consider adding ${gaps.join(", ")} to requiredStates — production screens need them.`,
      });
    }
  }

  return findings;
}
