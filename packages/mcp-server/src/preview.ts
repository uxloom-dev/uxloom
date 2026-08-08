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
 *
 * Structured edit mode (R13): POST /edit applies designer edits (copy,
 * labels, block reorder/add/remove, design tokens) to the project file
 * itself — validated with parseProject before writing, so a bad edit can
 * never corrupt the contract. The write wakes the watcher, which reloads
 * every connected viewer; the file the designer edits is the same file
 * the agent edits.
 */
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { parseProject } from "@uxloom/journeygraph";
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

/* ----------------------- structured edit mode ----------------------- */

const EDIT_OPS = ["set-copy", "set-label", "move-block", "add-block", "remove-block", "set-token"] as const;

/** Editable token paths → expected primitive type of the value. */
const TOKEN_PATHS: Record<string, "string" | "number"> = {
  "colors.accent": "string",
  "colors.bg": "string",
  "colors.surface": "string",
  "colors.text": "string",
  "colors.muted": "string",
  radius: "number",
  font: "string",
};

const NO_LAYOUT_MESSAGE =
  "screen has no explicit layout — ask your agent to add one (auto-derived layouts are not editable)";

function isIndex(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/** Flatten a ZodError into one human line; fall back to the raw message. */
function validationMessage(error: unknown): string {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues
      .map((i) => (i.path.length > 0 ? i.path.join(".") + ": " + i.message : i.message))
      .join("; ");
  }
  return String(error instanceof Error ? error.message : error);
}

interface EditOutcome {
  status: number;
  payload: unknown;
}

/**
 * Validate one edit op strictly, apply it to the project file, and
 * re-validate the whole project with parseProject BEFORE writing — on any
 * failure nothing is written. Returns the HTTP outcome; the actual viewer
 * refresh rides on the file watcher, not on this response.
 */
export function applyEditOp(projectPath: string, raw: string): EditOutcome {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { status: 400, payload: { error: "body must be valid JSON" } };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { status: 400, payload: { error: "body must be a JSON object" } };
  }
  const op = body.op;
  if (typeof op !== "string" || !(EDIT_OPS as readonly string[]).includes(op)) {
    return { status: 400, payload: { error: "op must be one of: " + EDIT_OPS.join(", ") } };
  }

  // Strict shape checks per op — before the file is even read.
  if (op === "set-token") {
    if (typeof body.path !== "string" || !(body.path in TOKEN_PATHS)) {
      return { status: 400, payload: { error: "path must be one of: " + Object.keys(TOKEN_PATHS).join(", ") } };
    }
    const expected = TOKEN_PATHS[body.path];
    if (typeof body.value !== expected) {
      return { status: 400, payload: { error: "value for " + body.path + " must be a " + expected } };
    }
  } else {
    if (typeof body.screen !== "string" || body.screen === "") {
      return { status: 400, payload: { error: "screen must be a non-empty string" } };
    }
    if (op === "set-copy" && typeof body.copy !== "string") {
      return { status: 400, payload: { error: "copy must be a string" } };
    }
    if (op === "set-label" && typeof body.label !== "string") {
      return { status: 400, payload: { error: "label must be a string" } };
    }
    if (op === "move-block" && (!isIndex(body.from) || !isIndex(body.to))) {
      return { status: 400, payload: { error: "from and to must be non-negative integers" } };
    }
    if (op === "add-block") {
      if (!isIndex(body.index)) {
        return { status: 400, payload: { error: "index must be a non-negative integer" } };
      }
      const block = body.block;
      if (
        typeof block !== "object" || block === null || Array.isArray(block) ||
        typeof (block as Record<string, unknown>).type !== "string"
      ) {
        return { status: 400, payload: { error: "block must be an object with a string type" } };
      }
    }
    if ((op === "set-copy" || op === "set-label" || op === "remove-block") && !isIndex(body.blockIndex)) {
      return { status: 400, payload: { error: "blockIndex must be a non-negative integer" } };
    }
  }

  let project: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(projectPath, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    project = parsed as Record<string, unknown>;
  } catch (error) {
    return {
      status: 422,
      payload: { error: "project file is not valid JSON: " + String(error instanceof Error ? error.message : error) },
    };
  }

  if (op === "set-token") {
    const path = body.path as string;
    const prior = project.tokens;
    const tokens: Record<string, unknown> =
      typeof prior === "object" && prior !== null && !Array.isArray(prior)
        ? (prior as Record<string, unknown>)
        : {};
    project.tokens = tokens;
    if (path.startsWith("colors.")) {
      const priorColors = tokens.colors;
      const colors: Record<string, unknown> =
        typeof priorColors === "object" && priorColors !== null && !Array.isArray(priorColors)
          ? (priorColors as Record<string, unknown>)
          : {};
      tokens.colors = colors;
      colors[path.slice("colors.".length)] = body.value;
    } else {
      tokens[path] = body.value;
    }
  } else {
    const screens = Array.isArray(project.screens) ? project.screens : [];
    const screen = screens.find(
      (s): s is Record<string, unknown> =>
        typeof s === "object" && s !== null && (s as Record<string, unknown>).id === body.screen
    );
    if (!screen) {
      return { status: 404, payload: { error: "no screen \"" + String(body.screen) + "\" in the project file" } };
    }
    const layout = screen.layout as Record<string, unknown> | undefined;
    const blocks =
      typeof layout === "object" && layout !== null && Array.isArray(layout.blocks)
        ? (layout.blocks as unknown[])
        : null;
    if (!blocks) {
      return { status: 409, payload: { error: NO_LAYOUT_MESSAGE } };
    }
    const outOfRange = (what: string): EditOutcome => ({
      status: 400,
      payload: { error: what + " is out of range (screen has " + blocks.length + " blocks)" },
    });
    if (op === "set-copy" || op === "set-label" || op === "remove-block") {
      const i = body.blockIndex as number;
      if (i >= blocks.length) return outOfRange("blockIndex");
      const block = blocks[i];
      if (typeof block !== "object" || block === null) {
        return { status: 422, payload: { error: "block at index " + i + " is not an object" } };
      }
      if (op === "set-copy") (block as Record<string, unknown>).copy = body.copy;
      else if (op === "set-label") (block as Record<string, unknown>).label = body.label;
      else blocks.splice(i, 1);
    } else if (op === "move-block") {
      const from = body.from as number;
      const to = body.to as number;
      if (from >= blocks.length) return outOfRange("from");
      if (to >= blocks.length) return outOfRange("to");
      const [moved] = blocks.splice(from, 1);
      blocks.splice(to, 0, moved);
    } else {
      // add-block
      const index = body.index as number;
      if (index > blocks.length) return outOfRange("index");
      blocks.splice(index, 0, body.block);
    }
  }

  try {
    parseProject(project);
  } catch (error) {
    return { status: 422, payload: { error: validationMessage(error) } };
  }
  writeFileSync(projectPath, JSON.stringify(project, null, 2) + "\n");
  return { status: 200, payload: { ok: true, op } };
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
    } else if (req.url === "/edit" && req.method === "POST") {
      collectBody(req, (raw) => {
        const outcome = applyEditOp(projectPath, raw);
        json(outcome.status, outcome.payload);
      });
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
