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

    // Exemptions: a documented reason a baseline state doesn't apply.
    // "error.any" (or any "error"-prefixed state) exempts the error family.
    const exemptions = screen.exemptions ?? [];
    const exempted = new Set(exemptions.map((e) => e.state));
    const errorExempt = exemptions.some((e) => e.state.startsWith(ERROR_PREFIX));

    for (const exemption of exemptions) {
      if (required.has(exemption.state)) {
        findings.push({
          critic: CRITIC,
          code: "contradictory-exemption",
          severity: "warning",
          screen: screen.id,
          state: exemption.state,
          message: `Screen "${screen.id}" exempts state "${exemption.state}" but also requires it — the exemption is stale or the contract is wrong.`,
          fix: `Remove the exemption or remove "${exemption.state}" from requiredStates.`,
        });
      }
    }

    const hasError = screen.requiredStates.some((s) => s.startsWith(ERROR_PREFIX));
    const missingBaseline = BASELINE.filter((s) => !required.has(s) && !exempted.has(s));
    const missingError = !hasError && !errorExempt;
    if (missingBaseline.length > 0 || missingError) {
      const gaps = [...missingBaseline, ...(missingError ? ["error.*"] : [])];
      findings.push({
        critic: CRITIC,
        code: "happy-path-contract",
        severity: "warning",
        screen: screen.id,
        message: `Screen "${screen.id}" contract looks happy-path-only. Missing baseline states: ${gaps.join(", ")}.`,
        fix: `Add ${gaps.join(", ")} to requiredStates, or declare an exemption with a written reason if a state genuinely cannot apply.`,
      });
    }
  }

  return findings;
}
