/**
 * Performance: validation must stay interactive at real product scale.
 * An enterprise app is ~200-500 screens; 1000 is the stress ceiling.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProject } from "@uxloom/journeygraph";
import { critique } from "@uxloom/critics";
import { buildCleanProject } from "./generate.mjs";

export function runPerf() {
  const sizes = [10, 100, 500, 1000];
  const scaling = sizes.map((n) => {
    const parsed = parseProject(buildCleanProject(n));
    critique(parsed); // warm-up
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const t0 = process.hrtime.bigint();
      critique(parsed);
      runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return { screens: n, medianMs: runs.sort((a, b) => a - b)[2] };
  });

  // CLI cold start: full process spawn + parse + critique + print.
  const dir = mkdtempSync(join(tmpdir(), "uxloom-perf-"));
  const file = join(dir, "project.json");
  writeFileSync(file, JSON.stringify(buildCleanProject(100)));
  const cli = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../mcp-server/dist/cli.js",
  );
  const coldRuns = [];
  for (let i = 0; i < 3; i++) {
    const t0 = process.hrtime.bigint();
    execFileSync(process.execPath, [cli, "check", file], { encoding: "utf8" });
    coldRuns.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }

  return { scaling, cliColdStartMedianMs: coldRuns.sort((a, b) => a - b)[1] };
}
