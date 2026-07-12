import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseProject, type Finding } from "@uxloom/journeygraph";
import { critique } from "@uxloom/critics";

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

/** `uxloom check [file]` — validate a JourneyGraph project, exit 1 on errors. */
export function runCheck(fileArg?: string): never {
  const path = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(red(`✖ no project file at ${path}`));
    console.error(dim("  pass a path: uxloom check ./uxloom.project.json"));
    process.exit(2);
  }

  let project;
  try {
    project = parseProject(JSON.parse(raw));
  } catch (error) {
    console.error(red(`✖ ${path} is not a valid JourneyGraph project`));
    console.error(dim(String(error instanceof Error ? error.message : error)));
    process.exit(2);
  }

  const report = critique(project);
  const { errors, warnings, stateCoverage } = report.summary;

  console.log(bold(`\nuxloom check ${dim(path)}`));
  console.log(
    `${project.journeys.length} journeys · ${project.screens.length} screens · platforms: ${project.platforms.join(", ")}\n`,
  );

  for (const critic of [...new Set(report.findings.map((f) => f.critic))]) {
    console.log(bold(critic));
    for (const f of report.findings.filter((x) => x.critic === critic)) {
      const mark = f.severity === "error" ? red("✖") : yellow("▲");
      console.log(`  ${mark} ${bold(where(f))}  ${f.message}`);
      if (f.fix) console.log(dim(`     fix → ${f.fix}`));
    }
    console.log();
  }

  const pct = stateCoverage.required
    ? Math.round((100 * stateCoverage.designed) / stateCoverage.required)
    : 100;
  console.log(
    `state coverage: ${stateCoverage.designed}/${stateCoverage.required} required states designed (${pct}%)`,
  );
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
