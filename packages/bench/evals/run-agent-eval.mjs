/**
 * Layer-2 skill eval: drive a real agent CLI through each eval, twice —
 * WITH the uxloom skill installed and WITHOUT — then grade both runs
 * mechanically (grade.mjs). The difference is the measured skill lift.
 *
 * Requires the `claude` CLI and consumes API/subscription tokens, so it
 * is opt-in:  UXLOOM_AGENT_EVAL=1 node evals/run-agent-eval.mjs [eval-id]
 */
import { execFileSync, execSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.UXLOOM_AGENT_EVAL !== "1") {
  console.log("Agent evals consume tokens. Set UXLOOM_AGENT_EVAL=1 to run.");
  process.exit(0);
}
try {
  execSync("command -v claude", { stdio: "ignore" });
} catch {
  console.error("claude CLI not found on PATH");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const serverCli = join(repoRoot, "packages/mcp-server/dist/cli.js");
const skillDir = join(repoRoot, "packages/mcp-server/skills/uxloom");
const only = process.argv[2];

const evalFiles = readdirSync(here).filter((f) => f.endsWith(".json"));
const results = [];

for (const file of evalFiles) {
  const def = JSON.parse(readFileSync(join(here, file), "utf8"));
  if (only && def.id !== only) continue;

  for (const withSkill of [true, false]) {
    const ws = mkdtempSync(join(tmpdir(), `uxloom-eval-${def.id}-${withSkill ? "skill" : "base"}-`));
    // Seed files
    for (const f of def.files ?? []) {
      cpSync(join(here, f), join(ws, "uxloom.project.json"));
    }
    // MCP server available either way; the skill is the variable.
    writeFileSync(join(ws, ".mcp.json"), JSON.stringify({
      mcpServers: { uxloom: { command: "node", args: [serverCli] } },
    }, null, 2));
    if (withSkill) {
      mkdirSync(join(ws, ".claude", "skills"), { recursive: true });
      cpSync(skillDir, join(ws, ".claude", "skills", "uxloom"), { recursive: true });
    }

    const t0 = Date.now();
    let agentError = null;
    try {
      execFileSync("claude", ["-p", def.query, "--permission-mode", "acceptEdits"], {
        cwd: ws, encoding: "utf8", timeout: 600_000, stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      agentError = String(error.message ?? error).slice(0, 200);
    }
    const seconds = Math.round((Date.now() - t0) / 1000);

    let grade;
    try {
      const out = execFileSync(process.execPath, [join(here, "grade.mjs"), def.id, ws], { encoding: "utf8" });
      grade = JSON.parse(out);
    } catch (error) {
      grade = { pass: false, evidence: String(error.stdout ?? error).slice(0, 300) };
    }
    results.push({ eval: def.id, withSkill, pass: grade.pass, seconds, agentError, evidence: grade.evidence });
    console.log(`${def.id} ${withSkill ? "WITH skill" : "no skill  "} → ${grade.pass ? "PASS" : "fail"} (${seconds}s)`);
  }
}

const outPath = join(here, "..", "results", "agent-eval.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(results, null, 2));
const lift = (s) => results.filter((r) => r.withSkill === s && r.pass).length;
console.log(`\nskill lift: ${lift(true)}/${results.length / 2} with skill vs ${lift(false)}/${results.length / 2} without`);
