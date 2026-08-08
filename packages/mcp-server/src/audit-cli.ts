import { relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { loadMap, runAudit, type AuditFinding } from "./audit.js";
import { applyBaseline, fingerprint, loadWorkspace, saveBaseline } from "./workspace.js";
import { parseFormatFlag, render, type ReportableFinding } from "./reporters.js";

const { version: VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s: string) => c("31", s);
const yellow = (s: string) => c("33", s);
const green = (s: string) => c("32", s);
const dim = (s: string) => c("2", s);
const bold = (s: string) => c("1", s);

/** `uxloom audit [file] [--json|--sarif|--github] [--update-baseline]` */
export function runAuditCli(fileArg?: string, flags: string[] = []): never {
  const projectPath = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  const format = parseFormatFlag(flags);

  let ws;
  try {
    ws = loadWorkspace(projectPath);
  } catch (error) {
    console.error(red(`✖ cannot load project at ${projectPath}`));
    console.error(dim(String(error instanceof Error ? error.message : error)));
    process.exit(2);
  }
  const map = loadMap(resolve(ws.dir, "uxloom.map.json"));
  const result = runAudit(ws.project, ws.dir, map);

  if (flags.includes("--update-baseline")) {
    ws.baseline.audit = result.findings.map(fingerprint);
    saveBaseline(ws.baselinePath, ws.baseline);
    console.log(`baseline updated: ${result.findings.length} audit finding(s) frozen in ${relative(process.cwd(), ws.baselinePath)}`);
    process.exit(0);
  }

  const { fresh, suppressed } = applyBaseline(result.findings, ws.baseline.audit);
  const errors = fresh.filter((f) => f.severity === "error").length;
  const projectFile = relative(process.cwd(), ws.projectPath) || ws.projectPath;

  if (format !== "human") {
    const findings: ReportableFinding[] = fresh.map((f: AuditFinding) => ({
      code: f.code,
      severity: f.severity,
      message: f.message,
      fix: f.fix,
      file: f.file ?? projectFile,
      line: f.line,
      screen: f.screen,
      state: f.state,
    }));
    console.log(render(
      {
        tool: "uxloom", command: "audit", version: VERSION,
        summary: { ...result.summary, unmappedScreens: result.summary.unmappedScreens.join(","), suppressed },
        findings,
      },
      format,
    ));
    process.exit(errors > 0 ? 1 : 0);
  }

  console.log(bold(`\nuxloom audit ${dim(ws.dir)}`));
  console.log(
    `${result.summary.screens} screens · ${result.summary.states} contracted states · marker adoption ${Math.round(result.summary.markerAdoption * 100)}%\n`,
  );
  for (const f of fresh) {
    const mark = f.severity === "error" ? red("✖") : yellow("▲");
    const loc = f.file ? dim(` (${f.file}${f.line ? `:${f.line}` : ""})`) : "";
    console.log(`  ${mark} ${bold(f.state ? `${f.screen ?? "?"}:${f.state}` : f.screen ?? "?")}  ${f.message}${loc}`);
    console.log(dim(`     fix → ${f.fix}`));
  }
  const s = result.summary;
  if (suppressed > 0) console.log(dim(`\n${suppressed} finding(s) suppressed by baseline`));
  console.log(
    `\n${green(`✔ ${s.implemented} implemented`)}  ${s.unimplemented ? red(`✖ ${s.unimplemented} unimplemented`) : ""}  ${s.unproven ? yellow(`▲ ${s.unproven} unproven`) : ""}`.trim(),
  );
  if (s.implemented === s.states) {
    console.log(green("✔ every contracted state has implementation evidence\n"));
  } else {
    console.log();
  }
  process.exit(errors > 0 ? 1 : 0);
}
