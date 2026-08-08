import type { Finding, Project, Rationale } from "@uxloom/journeygraph";

const CRITIC = "design-intelligence";
const THIN_REASONING_CHARS = 60;

/**
 * Rationale critic (RFC 0005 R17): evidence-backed decisions, enforced.
 *
 * Adoption-gated like the marker convention: fires only when the project
 * has opted into evidence-based design (any rationale present, or config
 * requires it). Once adopted, every screen and journey must carry a
 * defended decision — and "defended" means argued against at least one
 * alternative with real pros AND cons. A rationale with no alternatives
 * or a one-liner reasoning is decision theater.
 */
export function rationale(project: Project, required = false): Finding[] {
  const optedIn =
    required ||
    project.rationale !== undefined ||
    project.journeys.some((j) => j.rationale !== undefined) ||
    project.screens.some((s) => s.rationale !== undefined);
  if (!optedIn) return [];

  const findings: Finding[] = [];
  const thin = (r: Rationale): string | null => {
    if (r.reasoning.length < THIN_REASONING_CHARS)
      return `reasoning is ${r.reasoning.length} chars — that's a caption, not an argument`;
    if (!r.alternatives || r.alternatives.length === 0)
      return "no alternatives were compared — a decision nothing argued against is a guess";
    return null;
  };

  const check = (
    r: Rationale | undefined,
    where: { screen?: string; journey?: string },
    what: string,
  ) => {
    if (!r) {
      findings.push({
        critic: CRITIC,
        code: "rationale-missing",
        severity: "warning",
        ...where,
        message: `${what} has no design rationale — this project practices evidence-based design, and undocumented decisions erode the confidence report.`,
        fix: `Add rationale: the decision, the reasoning, at least one rejected alternative with pros/cons, and sources where claims are factual.`,
      });
      return;
    }
    const problem = thin(r);
    if (problem) {
      findings.push({
        critic: CRITIC,
        code: "rationale-thin",
        severity: "warning",
        ...where,
        message: `${what} rationale ("${r.decision}") is thin: ${problem}.`,
        fix: `Strengthen the reasoning and compare at least one alternative with genuine pros and cons.`,
      });
    }
  };

  check(project.rationale, {}, "The project");
  for (const journey of project.journeys) {
    check(journey.rationale, { journey: journey.id }, `Journey "${journey.id}"`);
  }
  for (const screen of project.screens) {
    check(screen.rationale, { screen: screen.id }, `Screen "${screen.id}"`);
  }
  return findings;
}

/** Coverage stat for reports: documented decisions / total decision sites. */
export function rationaleCoverage(project: Project): { documented: number; total: number; optedIn: boolean } {
  const sites = [project.rationale, ...project.journeys.map((j) => j.rationale), ...project.screens.map((s) => s.rationale)];
  const documented = sites.filter((r) => r !== undefined).length;
  return { documented, total: sites.length, optedIn: documented > 0 };
}
