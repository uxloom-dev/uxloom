/**
 * `uxloom preview [file]` — live wireframe mocks from the contract.
 * Zero dependencies: node http + fs.watch + SSE. The agent edits the
 * project file (directly or via MCP tools); every connected browser
 * re-renders within a debounce tick.
 *
 * Comment mode persists review pins to a sidecar file next to the
 * project (uxloom.project.json → uxloom.project.comments.json) via
 * GET /comments, POST /comments, POST /comments/resolve; the watcher
 * broadcasts changes to that file too, so all viewers stay in sync.
 */
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { PREVIEW_TEMPLATE } from "./preview-template.js";

interface PreviewComment {
  id: string;
  screen: string;
  state: string;
  x: number;
  y: number;
  text: string;
  resolved: boolean;
  createdAt: string;
}

interface CommentStore {
  comments: PreviewComment[];
}

/** Sidecar comments file: uxloom.project.json → uxloom.project.comments.json */
export function commentsPathFor(projectPath: string): string {
  return projectPath.endsWith(".json")
    ? projectPath.slice(0, -".json".length) + ".comments.json"
    : projectPath + ".comments.json";
}

function collectBody(req: IncomingMessage, done: (raw: string) => void): void {
  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk: string) => { raw += chunk; });
  req.on("end", () => done(raw));
}

/**
 * Create, wire up, and start the preview server (pass port 0 for an
 * ephemeral port). Returns the http server; closing it also stops the
 * file watcher. runPreview() wraps this with CLI ergonomics.
 */
export function createPreviewServer(projectPath: string, port: number): Server {
  const commentsPath = commentsPathFor(projectPath);
  const clients = new Set<ServerResponse>();

  const readStore = (): CommentStore => {
    try {
      const parsed = JSON.parse(readFileSync(commentsPath, "utf8")) as { comments?: unknown };
      return { comments: Array.isArray(parsed.comments) ? (parsed.comments as PreviewComment[]) : [] };
    } catch {
      return { comments: [] };
    }
  };
  const writeStore = (store: CommentStore): void => {
    writeFileSync(commentsPath, JSON.stringify(store, null, 2) + "\n");
  };

  const server = createServer((req, res) => {
    const json = (status: number, payload: unknown): void => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };

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
        json(200, { error: `project file is not valid JSON yet: ${String(error instanceof Error ? error.message : error)}` });
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
    } else if (req.url === "/comments" && req.method === "GET") {
      json(200, readStore());
    } else if (req.url === "/comments" && req.method === "POST") {
      collectBody(req, (raw) => {
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return json(400, { error: "body must be valid JSON" });
        }
        if (
          typeof body !== "object" || body === null ||
          typeof body.screen !== "string" || typeof body.state !== "string" ||
          typeof body.x !== "number" || typeof body.y !== "number" ||
          typeof body.text !== "string" || body.text.trim() === ""
        ) {
          return json(400, { error: "expected { screen, state, x, y, text }" });
        }
        const comment: PreviewComment = {
          id: randomUUID(),
          screen: body.screen,
          state: body.state,
          x: body.x,
          y: body.y,
          text: body.text,
          resolved: false,
          createdAt: new Date().toISOString(),
        };
        const store = readStore();
        store.comments.push(comment);
        writeStore(store);
        json(200, comment);
      });
    } else if (req.url === "/comments/resolve" && req.method === "POST") {
      collectBody(req, (raw) => {
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return json(400, { error: "body must be valid JSON" });
        }
        if (typeof body !== "object" || body === null || typeof body.id !== "string") {
          return json(400, { error: "expected { id }" });
        }
        const store = readStore();
        const found = store.comments.find((c) => c.id === body.id);
        if (!found) return json(404, { error: `no comment with id ${body.id}` });
        found.resolved = true;
        writeStore(store);
        json(200, found);
      });
    } else {
      res.writeHead(404).end();
    }
  });

  // Watch the directory (watching the file directly breaks on atomic
  // rewrites); debounce bursts from editors and MCP saves. The comments
  // sidecar broadcasts too, so multiple reviewers stay in sync.
  let timer: NodeJS.Timeout | undefined;
  const watcher = watch(dirname(projectPath), (_event, filename) => {
    if (filename && filename !== basename(projectPath) && filename !== basename(commentsPath)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const client of clients) client.write("data: change\n\n");
    }, 120);
  });
  server.on("close", () => {
    watcher.close();
    clearTimeout(timer);
  });

  server.listen(port);
  return server;
}

export function runPreview(fileArg?: string): void {
  const projectPath = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  if (!existsSync(projectPath)) {
    console.error(`✖ no project file at ${projectPath}`);
    console.error("  pass a path: uxloom preview ./uxloom.project.json — or run: uxloom init");
    process.exit(2);
  }
  const port = Number(process.env.UXLOOM_PREVIEW_PORT ?? 4400);
  const server = createPreviewServer(projectPath, port);

  server.on("listening", () => {
    const address = server.address();
    const bound = typeof address === "object" && address !== null ? address.port : port;
    console.log(`\nuxloom preview — live wireframe mocks from the contract`);
    console.log(`  project  ${projectPath}`);
    console.log(`  open     http://localhost:${bound}\n`);
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
