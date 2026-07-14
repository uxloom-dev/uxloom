#!/usr/bin/env node
/**
 * Bin entry. No "is main module" guard — npm bin symlinks make
 * process.argv[1] end in "uxloom", not "cli.js", and heuristics silently
 * fail (0.1.0 bug).
 *
 *   uxloom              start the MCP server on stdio
 *   uxloom init         set up this project: MCP config, agent skill, starter file
 *   uxloom check [file] validate a JourneyGraph project, exit 1 on errors
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { runCheck } from "./check.js";
import { runInit } from "./init.js";

const [, , command, arg] = process.argv;

if (command === "check") {
  runCheck(arg);
} else if (command === "init") {
  runInit();
} else if (command === undefined) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error("uxloom mcp server failed:", error);
    process.exit(1);
  });
} else {
  console.error(`unknown command: ${command}`);
  console.error("usage: uxloom               # start MCP server (stdio)");
  console.error("       uxloom init          # set up this project (MCP config + skill + starter file)");
  console.error("       uxloom check [file]  # validate a JourneyGraph project");
  process.exit(2);
}
