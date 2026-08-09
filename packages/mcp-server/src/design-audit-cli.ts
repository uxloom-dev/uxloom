/**
 * `uxloom audit --design <file|dir> [--scaffold <out>] [--json|--sarif|--github]`
 * — RFC 0007 R28/R29. Reverse bridge: audit a design export against the
 * contract. Zero-coupling (reads exported files), deterministic, CI-gateable.
 */
import { existsSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { auditDesign, parseDesignExport } from "./design-audit.js";
import { loadWorkspace } from "./workspace.js";
import { parseFormatFlag, render, type ReportableFinding } from "./reporters.js";

const { version: VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s: string) => c("31", s);
const yellow = (s: string) => c("33", s);
const green = (s: string) => c("32", s);
const dim = (s: string) => c("2", s);
const bold = (s: string) => c("1", s);

export async function runDesignAuditCli(
  designPath: string,
  fileArg?: string,
  flags: string[] = [],
  scaffoldOut?: string,
): Promise<never> {
  const projectPath = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  const design = resolve(designPath);
  const format = parseFormatFlag(flags);

  if (!existsSync(design)) {
    console.error(red(`✖ no design export at ${design}`));
    console.error(dim("  point --design at a Figma/Penpot SVG or JSON export, a folder of them, or a uxloom --manifest index.json"));
    process.exit(2);
  }

  let ws;
  try {
    ws = loadWorkspace(projectPath);
  } catch (error) {
    console.error(red(`✖ cannot load project at ${projectPath}`));
    console.error(dim(String(error instanceof Error ? error.message : error)));
    process.exit(2);
  }

  const frames = parseDesignExport(design);
  const result = auditDesign(ws.project, frames);
  const errors = result.findings.filter((f) => f.severity === "error").length;

  if (scaffoldOut) {
    const out = resolve(scaffoldOut);
    if (existsSync(out)) {
      console.error(red(`✖ refusing to overwrite ${relative(process.cwd(), out)} — choose a new --scaffold path`));
      process.exit(2);
    }
    writeFileSync(out, JSON.stringify(result.scaffold, null, 2) + "\n");
    console.error(dim(`scaffold: ${result.scaffold.screens.length} unmapped screen(s) written to ${relative(process.cwd(), out)}`));
  }

  if (format !== "human") {
    const findings: ReportableFinding[] = result.findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      message: f.message,
      fix: f.fix,
      file: relative(process.cwd(), design) || design,
      screen: f.screen,
      state: f.state,
      journey: f.journey,
    }));
    console.log(render({ tool: "uxloom", command: "design", version: VERSION, summary: result.summary, findings }, format));
    process.exit(errors > 0 ? 1 : 0);
  }

  const s = result.summary;
  console.log(bold(`\nuxloom audit --design ${dim(relative(process.cwd(), design) || design)}`));
  console.log(
    `${s.screens} contracted screens · ${s.requiredStates} required states · ${s.framesFound} frame(s) found in the design\n`,
  );
  if (s.framesFound === 0) {
    console.log(yellow("▲ no frames recognized — export with frame names \"<Screen> / <state>\", or use `uxloom export --svg <dir> --manifest`.\n"));
  }
  for (const f of result.findings) {
    const mark = f.severity === "error" ? red("✖") : yellow("▲");
    const label = f.state ? `${f.screen}:${f.state}` : f.screen ?? "?";
    console.log(`  ${mark} ${bold(label)}  ${f.message}`);
    console.log(dim(`     fix → ${f.fix}`));
  }
  console.log(
    `\n${green(`✔ ${s.coveredStates} states covered`)}  ${s.missingStates ? red(`✖ ${s.missingStates} missing`) : ""}  ${s.unmappedFrames ? yellow(`▲ ${s.unmappedFrames} unmapped frame(s)`) : ""}`.trim(),
  );
  if (errors === 0 && s.framesFound > 0) {
    console.log(green("✔ every contracted required state has a frame in the design\n"));
  } else {
    console.log();
  }
  process.exit(errors > 0 ? 1 : 0);
}
