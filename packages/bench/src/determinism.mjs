/**
 * Determinism: the USP depends on it. Same input must produce a
 * byte-identical report — within a process, across processes.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProject } from "@uxloom/journeygraph";
import { critique } from "@uxloom/critics";
import { buildCleanProject, DEFECTS } from "./generate.mjs";

const hash = (obj) => createHash("sha256").update(JSON.stringify(obj)).digest("hex");

export function runDeterminism() {
  const project = buildCleanProject(12, "det");
  for (const inject of Object.values(DEFECTS)) inject(project);
  const parsed = parseProject(project);

  // In-process: 25 runs.
  const hashes = new Set();
  for (let i = 0; i < 25; i++) hashes.add(hash(critique(parsed)));

  // Cross-process: two fresh node processes over the same file.
  const dir = mkdtempSync(join(tmpdir(), "uxloom-det-"));
  const file = join(dir, "project.json");
  writeFileSync(file, JSON.stringify(project));
  const runner = join(dirname(fileURLToPath(import.meta.url)), "det-child.mjs");
  const child = () => execFileSync(process.execPath, [runner, file], { encoding: "utf8" }).trim();
  const crossHashes = new Set([child(), child()]);

  return {
    inProcessRuns: 25,
    inProcessUniqueHashes: hashes.size,
    crossProcessUniqueHashes: crossHashes.size,
    deterministic: hashes.size === 1 && crossHashes.size === 1 && [...hashes][0] === [...crossHashes][0],
  };
}
