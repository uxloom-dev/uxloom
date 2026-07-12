#!/usr/bin/env node
/**
 * Dedicated bin entry: starts the server unconditionally. Never add an
 * "is main module" guard here — npm bin symlinks make process.argv[1]
 * end in "uxloom", not "cli.js", and heuristics silently fail (0.1.0 bug).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const server = createServer();
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error("uxloom mcp server failed:", error);
  process.exit(1);
});
