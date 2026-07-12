/**
 * Cold-start test: launch the PUBLISHED package via `npx -y uxloom@latest`
 * exactly the way an agent's MCP config would — no local dist, no local
 * node_modules, fresh npx cache entry.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectDir = mkdtempSync(join(tmpdir(), "uxloom-coldstart-"));
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "uxloom@latest"],
  env: { ...process.env, UXLOOM_PROJECT: join(projectDir, "uxloom.project.json") },
});

const client = new Client({ name: "coldstart", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log(`tools (${tools.tools.length}):`, tools.tools.map((t) => t.name).join(", "));

const call = async (tool, args = {}) =>
  JSON.parse((await client.callTool({ name: tool, arguments: args })).content[0].text);

await call("project_init", { name: "coldstart", platforms: ["web"] });
await call("journey_define", {
  journey: {
    id: "j", entry: "a",
    states: {
      a: { screen: "A", on: { GO: "b" } },
      b: { screen: "B", final: true },
    },
  },
});
await call("screen_register", { screen: { id: "A", requiredStates: ["default", "loading"], designedStates: ["default"] } });
await call("screen_register", { screen: { id: "B", requiredStates: ["default"], designedStates: ["default"],
  exemptions: [{ state: "empty", reason: "Terminal screen reached only with completed data." },
               { state: "loading", reason: "Static confirmation, no async content to wait for." },
               { state: "error.any", reason: "Failures handled upstream on screen A." }] } });
const report = await call("project_validate");
console.log("errors:", report.summary.errors, "warnings:", report.summary.warnings);
console.log(report.summary.errors === 1 ? "COLDSTART OK (caught the missing loading state)" : "UNEXPECTED REPORT");
await client.close();
