/**
 * Release helper: publish each workspace package unless its exact version
 * is already on the registry. Safe to re-run; used by the release workflow.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["packages/journeygraph", "packages/critics", "packages/mcp-server"];

for (const dir of packages) {
  const pkg = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
  if (pkg.private) continue;
  const spec = `${pkg.name}@${pkg.version}`;
  let exists = false;
  try {
    execFileSync("npm", ["view", spec, "version"], { stdio: "pipe" });
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) {
    console.log(`skip ${spec} (already published)`);
    continue;
  }
  console.log(`publish ${spec}`);
  execFileSync("npm", ["publish", "--access", "public", "--provenance", "-w", dir], {
    cwd: root,
    stdio: "inherit",
  });
}
