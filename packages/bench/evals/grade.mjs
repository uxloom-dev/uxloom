/**
 * Agent-agnostic grader: after ANY agent (Claude Code, Codex, ...) has
 * worked an eval in a workspace directory, this grades the outcome with
 * mechanical assertions — no LLM judging, evidence only.
 *
 * Usage: node evals/grade.mjs <eval-id> <workspace-dir>
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseProject } from "@uxloom/journeygraph";
import { critique } from "@uxloom/critics";

const BASELINE = ["empty", "loading"];

function loadProject(dir) {
  const path = join(dir, "uxloom.project.json");
  if (!existsSync(path)) return null;
  return parseProject(JSON.parse(readFileSync(path, "utf8")));
}

function honestContracts(project) {
  return project.screens.every((s) => {
    const req = new Set(s.requiredStates);
    const exempt = new Set((s.exemptions ?? []).map((e) => e.state));
    const errorOk = s.requiredStates.some((x) => x.startsWith("error")) ||
      (s.exemptions ?? []).some((e) => e.state.startsWith("error"));
    return BASELINE.every((b) => req.has(b) || exempt.has(b)) && errorOk;
  });
}

const GRADERS = {
  "design-from-prompt": (dir) => {
    const p = loadProject(dir);
    if (!p) return { pass: false, evidence: "no uxloom.project.json produced" };
    const report = critique(p);
    const checks = {
      "project file exists": true,
      "has journeys with a final state": p.journeys.length > 0 &&
        p.journeys.every((j) => Object.values(j.states).some((s) => s.final)),
      "honest contracts (baseline states or exemptions)": honestContracts(p),
      "zero validation errors": report.summary.errors === 0,
    };
    return { pass: Object.values(checks).every(Boolean), evidence: checks };
  },
  "validate-generated": (dir) => {
    const p = loadProject(dir);
    if (!p) return { pass: false, evidence: "no uxloom.project.json in workspace" };
    const report = critique(p);
    const journey = p.journeys[0];
    const promoHandled = !journey?.states?.promo ||
      Object.values(journey.states).some((s) =>
        Object.values(s.on ?? {}).some((t) => t.split("#")[0] === "promo"));
    const checks = {
      "zero errors": report.summary.errors === 0,
      "zero warnings": report.summary.warnings === 0,
      "unreachable promo state wired or removed": promoHandled,
      "payment error states still contracted": p.screens.some((s) =>
        s.requiredStates.some((x) => x.startsWith("error"))),
    };
    return { pass: Object.values(checks).every(Boolean), evidence: checks };
  },
  "exemption-honesty": (dir) => {
    const p = loadProject(dir);
    if (!p) return { pass: false, evidence: "no uxloom.project.json in workspace" };
    const report = critique(p);
    const confirm = p.screens.find((s) => s.id === "ConfirmScreen");
    const exempted = (confirm?.exemptions ?? []).length > 0 &&
      (confirm?.exemptions ?? []).every((e) => e.reason.length >= 15);
    const padded = confirm?.requiredStates.includes("empty") &&
      confirm?.designedStates.includes("empty");
    const checks = {
      "confirmation screen exempted with real reasons": exempted,
      "contract not padded with a meaningless empty state": !padded,
      "zero errors and zero happy-path warnings": report.summary.errors === 0 &&
        !report.findings.some((f) => f.code === "happy-path-contract"),
    };
    return { pass: Object.values(checks).every(Boolean), evidence: checks };
  },
  "ci-gate": (dir) => {
    const wfDir = join(dir, ".github", "workflows");
    const files = existsSync(wfDir) ? readdirSync(wfDir) : [];
    const contents = files.map((f) => readFileSync(join(wfDir, f), "utf8")).join("\n");
    const checks = {
      "workflow file created": files.length > 0,
      "runs uxloom check": /uxloom\s+check/.test(contents),
      "does not parse output text for pass/fail": !/grep|awk|\|\s*tee/.test(contents),
    };
    return { pass: Object.values(checks).every(Boolean), evidence: checks };
  },
};

const [, , evalId, workspace] = process.argv;
if (!evalId || !workspace) {
  console.error("usage: node evals/grade.mjs <eval-id> <workspace-dir>");
  process.exit(2);
}
const grader = GRADERS[evalId];
if (!grader) {
  console.error(`unknown eval: ${evalId}. known: ${Object.keys(GRADERS).join(", ")}`);
  process.exit(2);
}
const result = grader(workspace);
console.log(JSON.stringify({ eval: evalId, ...result }, null, 2));
process.exit(result.pass ? 0 : 1);
