#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

export { createServer } from "./server.js";
export { ProjectStore } from "./store.js";
export { briefQuestions, compileBrief } from "./brief.js";

const isMain =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);

if (isMain) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error("uxloom mcp server failed:", error);
    process.exit(1);
  });
}
