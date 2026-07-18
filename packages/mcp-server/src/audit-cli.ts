import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseProject } from "@uxloom/journeygraph";
import { loadMap, runAudit } from "./audit.js";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s: string) => c("31", s);
const yellow = (s: string) => c("33", s);
const green = (s: string) => c("32", s);
const dim = (s: string) => c("2", s);
const bold = (s: string) => c("1", s);

/** `uxloom audit [projectFile]` — root and map are resolved next to it. */
export function runAuditCli(fileArg?: string): never {
  const projectPath = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  let project;
  try {
    project = parseProject(JSON.parse(readFileSync(projectPath, "utf8")));
  } catch (error) {
    console.error(red(`✖ cannot load project at ${projectPath}`));
    console.error(dim(String(error instanceof Error ? error.message : error)));
    process.exit(2);
  }
  const root = dirname(projectPath);
  const map = loadMap(resolve(root, "uxloom.map.json"));
  const result = runAudit(project, root, map);

  console.log(bold(`\nuxloom audit ${dim(root)}`));
  console.log(
    `${result.summary.screens} screens · ${result.summary.states} contracted states · marker adoption ${Math.round(result.summary.markerAdoption * 100)}%\n`,
  );
  for (const f of result.findings) {
    const mark = f.severity === "error" ? red("✖") : yellow("▲");
    console.log(`  ${mark} ${bold(f.state ? `${f.screen}:${f.state}` : f.screen)}  ${f.message}`);
    console.log(dim(`     fix → ${f.fix}`));
  }
  const s = result.summary;
  console.log(
    `\n${green(`✔ ${s.implemented} implemented`)}  ${s.unimplemented ? red(`✖ ${s.unimplemented} unimplemented`) : ""}  ${s.unproven ? yellow(`▲ ${s.unproven} unproven`) : ""}`.trim(),
  );
  if (s.implemented === s.states) {
    console.log(green("✔ every contracted state has implementation evidence\n"));
  } else {
    console.log();
  }
  process.exit(result.findings.some((f) => f.severity === "error") ? 1 : 0);
}
