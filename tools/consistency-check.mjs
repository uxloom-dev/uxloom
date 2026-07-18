/**
 * Surface-consistency check: the drift critic for our own project.
 *
 * Source of truth: the RUNNING MCP server (introspected for its real tool
 * list) and packages/mcp-server/package.json (version). Every other surface
 * — server.json, READMEs, llms.txt, the website, the skill, QUICKSTART —
 * is verified against them. Runs in CI on every push: a change that adds a
 * capability without updating its surfaces fails with the exact fix.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, ProjectStore } from "uxloom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const failures = [];
const fail = (surface, problem, fix) => failures.push({ surface, problem, fix });

/* ---- source of truth ---------------------------------------------------- */

const pkg = JSON.parse(read("packages/mcp-server/package.json"));
const version = pkg.version;

const server = createServer(new ProjectStore("/tmp/uxloom-consistency-noop.json"));
const [ct, st] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "consistency", version: "0" });
await Promise.all([client.connect(ct), server.connect(st)]);
const tools = (await client.listTools()).tools.map((t) => t.name).sort();
await client.close();

const KNOWN_CLI = ["init", "check", "audit", "preview"];
const cliUsage = read("packages/mcp-server/src/cli.ts");
const cliCommands = KNOWN_CLI.filter((c) => cliUsage.includes(`"${c}"`));

/* ---- 1. version coherence ----------------------------------------------- */

const serverJson = JSON.parse(read("server.json"));
if (serverJson.version !== version)
  fail("server.json", `version ${serverJson.version} != package ${version}`, "run: node tools/release-prep.mjs <version>");
if (serverJson.packages?.[0]?.version !== version)
  fail("server.json", `packages[0].version ${serverJson.packages?.[0]?.version} != package ${version}`, "run: node tools/release-prep.mjs <version>");

const [major, minor] = version.split(".");
if (!read("docs/index.html").includes(`>v${major}.${minor}<`))
  fail("docs/index.html", `version badge does not say v${major}.${minor}`, `update the nav pill to >v${major}.${minor}< (release-prep does this)`);

if (JSON.parse(read("packages/mcp-server/src/server.ts").includes("createRequire") ? "true" : "false") === false)
  fail("server.ts", "serverInfo version is not derived from package.json", "use createRequire(import.meta.url)('../package.json')");

/* ---- 2. tool list coherence --------------------------------------------- */

const llms = read("docs/llms.txt");
const mcpReadme = read("packages/mcp-server/README.md");
for (const tool of tools) {
  if (!llms.includes(tool))
    fail("docs/llms.txt", `tool "${tool}" exists on the server but is not listed`, "add it to the tools list");
  if (!mcpReadme.includes(tool))
    fail("packages/mcp-server/README.md", `tool "${tool}" exists on the server but is not in the tools table`, "add a row for it");
}

// The skill must never reference a tool that doesn't exist.
const skillFiles = ["SKILL.md", "references/format.md", "references/critics.md", "references/audit.md", "references/examples.md"];
for (const f of skillFiles) {
  const text = read(join("packages/mcp-server/skills/uxloom", f));
  for (const m of text.matchAll(/uxloom:([a-z_]+)/g)) {
    if (!tools.includes(m[1]))
      fail(`skill/${f}`, `references nonexistent tool "uxloom:${m[1]}"`, `tools are: ${tools.join(", ")}`);
  }
}

/* ---- 3. CLI command coherence ------------------------------------------- */

for (const doc of ["README.md", "QUICKSTART.md", "packages/mcp-server/README.md", "docs/llms.txt", "docs/index.html"]) {
  const text = read(doc);
  for (const m of text.matchAll(/uxloom (init|check|audit|preview|[a-z]{3,})\b/g)) {
    if (KNOWN_CLI.includes(m[1]) && !cliCommands.includes(m[1]))
      fail(doc, `documents "uxloom ${m[1]}" but the CLI does not implement it`, "add the command or fix the doc");
  }
}

/* ---- 3b. capability ANNOUNCEMENT coverage -------------------------------- */
// Truth is not enough: every shipped CLI command must be PRESENT on every
// primary surface. A feature nobody can discover might as well not exist.
const ANNOUNCE_SURFACES = ["README.md", "QUICKSTART.md", "docs/index.html", "docs/llms.txt", "packages/mcp-server/README.md"];
for (const doc of ANNOUNCE_SURFACES) {
  const text = read(doc);
  for (const cmd of cliCommands) {
    if (!new RegExp(`uxloom ${cmd}\\b`).test(text))
      fail(doc, `CLI command "uxloom ${cmd}" exists but is not mentioned on this surface`, `document it (a features/quick-start line is enough)`);
  }
}

/* ---- 4. stale-claim ban ------------------------------------------------- */

// "No waitlist" is fine copy; promising one is not — ban the promise, not the word.
const STALE = /pre-release|first release (lands|soon)|coming soon|being strung|join (the |our )?waitlist/i;
for (const doc of ["README.md", "QUICKSTART.md", "docs/index.html", "docs/llms.txt", "packages/mcp-server/README.md"]) {
  const text = read(doc);
  const m = text.match(STALE);
  if (m) fail(doc, `stale claim "${m[0]}" — the product is released`, "update the copy to the current state");
}

/* ---- 5. hardcoded tool counts rot — ban them ---------------------------- */

for (const doc of ["README.md", "QUICKSTART.md", "docs/index.html", "docs/llms.txt", "packages/mcp-server/README.md", "POSITIONING.md"]) {
  const text = read(doc);
  const m = text.match(/\b(\d+)\s+(?:MCP\s+)?tools\b/i);
  if (m && Number(m[1]) !== tools.length)
    fail(doc, `claims "${m[0]}" but the server exposes ${tools.length} tools`, "fix the number, or better: remove the count (numbers rot)");
}

/* ---- report -------------------------------------------------------------- */

if (failures.length === 0) {
  console.log(`consistency ✔  version ${version} · ${tools.length} tools · ${cliCommands.length} CLI commands · all surfaces coherent`);
  process.exit(0);
}
console.error(`SURFACE DRIFT — ${failures.length} problem(s):\n`);
for (const f of failures) console.error(`  ✖ [${f.surface}] ${f.problem}\n     fix → ${f.fix}`);
process.exit(1);
