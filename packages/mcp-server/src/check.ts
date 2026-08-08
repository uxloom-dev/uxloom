import { relative, resolve } from "node:path";
import { createRequire } from "node:module";
import type { Finding } from "@uxloom/journeygraph";
import { critique, rationaleCoverage } from "@uxloom/critics";
import {
  applyBaseline,
  commentFindings,
  criticOptionsFor,
  fingerprint,
  loadWorkspace,
  saveBaseline,
} from "./workspace.js";
import { parseFormatFlag, render, type ReportableFinding } from "./reporters.js";

const { version: VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s: string) => c("31", s);
const yellow = (s: string) => c("33", s);
const green = (s: string) => c("32", s);
const dim = (s: string) => c("2", s);
const bold = (s: string) => c("1", s);

function where(f: Finding): string {
  if (f.screen && f.state) return `${f.screen}:${f.state}`;
  if (f.screen && f.component) return `${f.screen}/${f.component}`;
  if (f.screen) return f.screen;
  if (f.journey && f.state) return `${f.journey}.${f.state}`;
  if (f.journey) return f.journey;
  return "project";
}

/** `uxloom check [file] [--json|--sarif|--github] [--update-baseline]` */
export function runCheck(fileArg?: string, flags: string[] = []): never {
  const path = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  const format = parseFormatFlag(flags);

  let ws;
  try {
    ws = loadWorkspace(path);
  } catch (error) {
    console.error(red(`✖ cannot load project at ${path}`));
    console.error(dim(String(error instanceof Error ? error.message : error)));
    process.exit(2);
  }

  const report = critique(ws.project, criticOptionsFor(ws.config));
  const all: Finding[] = [
    ...ws.loadFindings,
    ...report.findings,
    ...commentFindings(ws.comments),
  ];

  if (flags.includes("--update-baseline")) {
    ws.baseline.check = all.map(fingerprint);
    saveBaseline(ws.baselinePath, ws.baseline);
    console.log(`baseline updated: ${all.length} finding(s) frozen in ${relative(process.cwd(), ws.baselinePath)}`);
    process.exit(0);
  }

  const { fresh, suppressed } = applyBaseline(all, ws.baseline.check);
  const errors = fresh.filter((f) => f.severity === "error").length;
  const warnings = fresh.filter((f) => f.severity === "warning").length;
  const projectFile = relative(process.cwd(), ws.projectPath) || ws.projectPath;

  if (format !== "human") {
    const findings: ReportableFinding[] = fresh.map((f) => ({
      code: f.code ?? f.critic,
      severity: f.severity,
      message: f.message,
      fix: f.fix,
      file: projectFile,
      screen: f.screen,
      state: f.state,
      journey: f.journey,
    }));
    console.log(render(
      {
        tool: "uxloom", command: "check", version: VERSION,
        summary: { errors, warnings, suppressed, screens: ws.project.screens.length, journeys: ws.project.journeys.length },
        findings,
      },
      format,
    ));
    process.exit(errors > 0 ? 1 : 0);
  }

  console.log(bold(`\nuxloom check ${dim(ws.projectPath)}`));
  console.log(
    `${ws.project.journeys.length} journeys · ${ws.project.screens.length} screens · platforms: ${ws.project.platforms.join(", ")}` +
    (ws.fragments.length ? ` · ${ws.fragments.length} fragment file(s) merged` : "") + "\n",
  );

  for (const critic of [...new Set(fresh.map((f) => f.critic))]) {
    console.log(bold(critic));
    for (const f of fresh.filter((x) => x.critic === critic)) {
      const mark = f.severity === "error" ? red("✖") : yellow("▲");
      console.log(`  ${mark} ${bold(where(f))}  ${f.message}`);
      if (f.fix) console.log(dim(`     fix → ${f.fix}`));
    }
    console.log();
  }

  const { stateCoverage, declarations } = report.summary;
  const pct = stateCoverage.required
    ? Math.round((100 * stateCoverage.designed) / stateCoverage.required)
    : 100;
  console.log(`state coverage: ${stateCoverage.designed}/${stateCoverage.required} required states designed (${pct}%)`);
  const d = declarations;
  const undeclared =
    d.colors.total - d.colors.declared + d.targets.total - d.targets.declared + d.budgets.total - d.budgets.declared;
  console.log(
    `checkable declarations: colors ${d.colors.declared}/${d.colors.total} · targets ${d.targets.declared}/${d.targets.total} · label budgets ${d.budgets.declared}/${d.budgets.total}` +
    (undeclared > 0 ? yellow(`  (${undeclared} undeclared — the critics cannot see what isn't declared)`) : ""),
  );
  const rc = rationaleCoverage(ws.project);
  if (rc.optedIn || ws.config.rationale === "required") {
    console.log(
      `design rationale: ${rc.documented}/${rc.total} decisions documented` +
      (rc.documented < rc.total ? yellow("  (evidence-based design adopted — document the rest)") : green("  ✔ fully evidenced")),
    );
  }
  if (suppressed > 0) console.log(dim(`${suppressed} finding(s) suppressed by baseline`));
  if (errors === 0 && warnings === 0) {
    console.log(green("✔ no findings — every journey complete, every contract met\n"));
  } else {
    const parts = [
      errors ? red(`✖ ${errors} error${errors === 1 ? "" : "s"}`) : green("✔ 0 errors"),
      warnings ? yellow(`▲ ${warnings} warning${warnings === 1 ? "" : "s"}`) : "",
    ].filter(Boolean);
    console.log(parts.join("  ") + "\n");
  }
  process.exit(errors > 0 ? 1 : 0);
}
