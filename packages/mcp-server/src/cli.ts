#!/usr/bin/env node
/**
 * Bin entry. No "is main module" guard — npm bin symlinks make
 * process.argv[1] end in "uxloom", not "cli.js", and heuristics silently
 * fail (0.1.0 bug).
 *
 *   uxloom              start the MCP server on stdio
 *   uxloom init         set up this project: MCP config, agent skill, starter file
 *   uxloom check [file] validate a JourneyGraph project, exit 1 on errors
 *   uxloom audit [file] audit implementation against the contract, exit 1 on drift
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { createServer } from "./server.js";
import { runCheck } from "./check.js";
import { runInit } from "./init.js";
import { runAuditCli } from "./audit-cli.js";
import { updateNotice } from "./update-check.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
const [, , command, arg] = process.argv;

if (command === "--version" || command === "-v" || command === "version") {
  console.log(version);
  process.exit(0);
} else if (command === "check" || command === "audit" || command === "init") {
  // Nudge before the command runs (they exit the process when done).
  const notice = await updateNotice(version);
  if (notice) console.error(`\n▲ ${notice}\n`);
  if (command === "check") runCheck(arg);
  else if (command === "audit") runAuditCli(arg);
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
  console.error("usage: uxloom               # start MCP server (stdio)");
  console.error("       uxloom init          # set up this project (MCP config + skill + starter file)");
  console.error("       uxloom check [file]  # validate a JourneyGraph project");
  console.error("       uxloom audit [file]  # audit implementation against the contract");
  console.error("       uxloom --version     # print version");
  process.exit(2);
}
