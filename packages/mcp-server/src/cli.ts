#!/usr/bin/env node
/**
 * Bin entry. No "is main module" guard — npm bin symlinks make
 * process.argv[1] end in "uxloom", not "cli.js", and heuristics silently
 * fail (0.1.0 bug).
 *
 *   uxloom               start the MCP server on stdio
 *   uxloom init          set up this project: MCP config, agent skill, starter file
 *   uxloom check [file]  validate design completeness (exit 1 on errors)
 *   uxloom audit [file]  audit implementation drift (exit 1 on drift)
 *   uxloom preview [file] live mocks in the browser (themed, commentable)
 *   uxloom export [file] [--out path]  self-contained shareable HTML
 *   Flags for check/audit: --json | --sarif | --github | --update-baseline
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { createServer } from "./server.js";
import { runCheck } from "./check.js";
import { runInit } from "./init.js";
import { runAuditCli } from "./audit-cli.js";
import { runPreview } from "./preview.js";
import { runExport } from "./preview-export.js";
import { updateNotice } from "./update-check.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
const argv = process.argv.slice(2);
const command = argv[0];

const flags: string[] = [];
const positionals: string[] = [];
let outPath: string | undefined;
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--out") outPath = argv[++i];
  else if (a.startsWith("--")) flags.push(a);
  else positionals.push(a);
}
const fileArg = positionals[0];

if (command === "--version" || command === "-v" || command === "version") {
  console.log(version);
  process.exit(0);
} else if (
  command === "check" || command === "audit" || command === "init" ||
  command === "preview" || command === "export"
) {
  // Nudge before the command runs; suppressed automatically in non-human output.
  const machineOutput = flags.some((f) => ["--json", "--sarif", "--github"].includes(f));
  if (!machineOutput) {
    const notice = await updateNotice(version);
    if (notice) console.error(`\n▲ ${notice}\n`);
  }
  if (command === "check") runCheck(fileArg, flags);
  else if (command === "audit") runAuditCli(fileArg, flags);
  else if (command === "preview") runPreview(fileArg);
  else if (command === "export") runExport(fileArg, outPath);
  else runInit();
} else if (command === undefined) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error("uxloom mcp server failed:", error);
    process.exit(1);
  });
  // Non-blocking: stderr is protocol-safe on MCP stdio transports.
  void updateNotice(version).then((notice) => notice && console.error(notice));
} else {
  console.error(`unknown command: ${command}`);
  console.error("usage: uxloom                # start MCP server (stdio)");
  console.error("       uxloom init           # set up this project (MCP config + skill + starter file)");
  console.error("       uxloom check [file]   # validate design completeness  [--json|--sarif|--github|--update-baseline]");
  console.error("       uxloom audit [file]   # audit implementation drift    [--json|--sarif|--github|--update-baseline]");
  console.error("       uxloom preview [file] # live mocks in the browser");
  console.error("       uxloom export [file]  # shareable self-contained HTML  [--out path]");
  console.error("       uxloom --version      # print version");
  process.exit(2);
}
