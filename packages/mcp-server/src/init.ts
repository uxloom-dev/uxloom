import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `uxloom init` — one-command project setup, agent-agnostic:
 *  - registers the MCP server in ./.mcp.json (created or merged)
 *  - installs the agent skill for every agent layout found in the project
 *    (.claude/skills for Claude Code, .agents/skills for Codex; both when
 *    neither exists yet, so the repo is ready for either)
 *  - creates a starter uxloom.project.json if none exists
 * Never overwrites user content it didn't create; never touches git.
 */
export function runInit(cwd = process.cwd()): never {
  const done: string[] = [];
  const skipped: string[] = [];

  // 1. MCP registration (.mcp.json is the cross-agent project convention)
  const mcpPath = join(cwd, ".mcp.json");
  const serverEntry = { command: "npx", args: ["-y", "uxloom"] };
  if (!existsSync(mcpPath)) {
    writeFileSync(mcpPath, JSON.stringify({ mcpServers: { uxloom: serverEntry } }, null, 2) + "\n");
    done.push(".mcp.json created (uxloom server registered)");
  } else {
    try {
      const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
      if (mcp.mcpServers?.uxloom) {
        skipped.push(".mcp.json already registers uxloom");
      } else {
        mcp.mcpServers = { ...mcp.mcpServers, uxloom: serverEntry };
        writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
        done.push(".mcp.json updated (uxloom server added)");
      }
    } catch {
      skipped.push(`.mcp.json exists but is not valid JSON — add manually: "uxloom": ${JSON.stringify(serverEntry)}`);
    }
  }

  // 2. Skill install for detected agent layouts
  const skillSource = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "uxloom");
  const layouts = [
    { name: "Claude Code", dir: join(cwd, ".claude", "skills") },
    { name: "Codex", dir: join(cwd, ".agents", "skills") },
  ];
  const detected = layouts.filter((l) => existsSync(dirname(l.dir)));
  for (const layout of detected.length ? detected : layouts) {
    const target = join(layout.dir, "uxloom");
    mkdirSync(layout.dir, { recursive: true });
    cpSync(skillSource, target, { recursive: true });
    done.push(`skill installed for ${layout.name} (${target.replace(cwd + "/", "")})`);
  }

  // 3. Starter project file
  const projectPath = join(cwd, "uxloom.project.json");
  if (!existsSync(projectPath)) {
    const starter = {
      name: basename(cwd),
      formatVersion: "0.1",
      platforms: ["web"],
      journeys: [],
      screens: [],
    };
    writeFileSync(projectPath, JSON.stringify(starter, null, 2) + "\n");
    done.push(`uxloom.project.json created (name: ${starter.name}, platforms: web — your agent will adjust)`);
  } else {
    skipped.push("uxloom.project.json already exists");
  }

  for (const line of done) console.log(`✔ ${line}`);
  for (const line of skipped) console.log(`• ${line}`);
  console.log(`
Next steps:
  1. Restart your agent session so it picks up .mcp.json
  2. Ask your agent, e.g.:
     "Design the user journeys and screens for <your product> using UXLoom.
      Iterate until validation is clean."
  3. Any time, in any terminal or CI:  npx uxloom check
`);
  process.exit(0);
}
