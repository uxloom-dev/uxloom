/**
 * One-command release preparation: bumps every version-bearing surface,
 * then runs the full verification stack. Usage:
 *
 *   node tools/release-prep.mjs 0.4.0
 *
 * After it passes: commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`
 * — the release pipeline does npm + MCP registry + GitHub release.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("usage: node tools/release-prep.mjs <semver>  e.g. 0.4.0");
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const edit = (path, fn) => {
  const p = join(root, path);
  const before = readFileSync(p, "utf8");
  const after = fn(before);
  if (after !== before) {
    writeFileSync(p, after);
    console.log(`✔ ${path}`);
  }
};

// 1. The one true version: packages/mcp-server/package.json
edit("packages/mcp-server/package.json", (t) => t.replace(/"version": "[^"]+"/, `"version": "${version}"`));
// 2. MCP registry manifest (both fields)
edit("server.json", (t) => t.replace(/"version": "[^"]+"/g, `"version": "${version}"`));
// 3. Website version badge (major.minor)
const [major, minor] = version.split(".");
edit("docs/index.html", (t) => t.replace(/>v\d+\.\d+</, `>v${major}.${minor}<`));

// 4. Full verification: build, tests, surface consistency, benchmark gate.
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });
run("npm install --no-audit --no-fund"); // refresh workspace links after bump
run("npx tsc --build");
run("npx vitest run");
run("node tools/consistency-check.mjs");
run("node src/run.mjs", join(root, "packages/bench"));

console.log(`
release ${version} is prepared and verified. Next:
  git add -A && git commit -m "Release v${version}: <what changed>"
  git push && git tag v${version} && git push origin v${version}
`);
