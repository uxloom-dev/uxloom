/**
 * `uxloom preview [file]` — live wireframe mocks from the contract.
 * Zero dependencies: node http + fs.watch + SSE. The agent edits the
 * project file (directly or via MCP tools); every connected browser
 * re-renders within a debounce tick.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, watch } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { PREVIEW_TEMPLATE } from "./preview-template.js";

export function runPreview(fileArg?: string): void {
  const projectPath = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  if (!existsSync(projectPath)) {
    console.error(`✖ no project file at ${projectPath}`);
    console.error("  pass a path: uxloom preview ./uxloom.project.json — or run: uxloom init");
    process.exit(2);
  }
  const port = Number(process.env.UXLOOM_PREVIEW_PORT ?? 4400);
  const clients = new Set<import("node:http").ServerResponse>();

  const server = createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PREVIEW_TEMPLATE);
    } else if (req.url === "/project") {
      try {
        const raw = readFileSync(projectPath, "utf8");
        JSON.parse(raw); // validate before serving
        res.writeHead(200, { "content-type": "application/json" });
        res.end(raw);
      } catch (error) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: `project file is not valid JSON yet: ${String(error instanceof Error ? error.message : error)}` }));
      }
    } else if (req.url === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("retry: 1000\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
    } else {
      res.writeHead(404).end();
    }
  });

  // Watch the directory (watching the file directly breaks on atomic
  // rewrites); debounce bursts from editors and MCP saves.
  let timer: NodeJS.Timeout | undefined;
  watch(dirname(projectPath), (_event, filename) => {
    if (filename && filename !== basename(projectPath)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const client of clients) client.write("data: change\n\n");
    }, 120);
  });

  server.listen(port, () => {
    console.log(`\nuxloom preview — live wireframe mocks from the contract`);
    console.log(`  project  ${projectPath}`);
    console.log(`  open     http://localhost:${port}\n`);
    console.log(`Every contracted state renders automatically (loading → skeleton,`);
    console.log(`empty → placeholder, error.* → banner, custom → overlay); click`);
    console.log(`events to walk journeys. Edits appear live. Ctrl-C to stop.`);
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`✖ port ${port} is in use — set UXLOOM_PREVIEW_PORT to another port`);
      process.exit(2);
    }
    throw error;
  });
}
