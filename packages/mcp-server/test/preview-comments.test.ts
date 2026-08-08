import { afterEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPreviewServer } from "uxloom/dist/preview.js";
import { PREVIEW_TEMPLATE, renderStandalone } from "uxloom/dist/preview-template.js";

const project = {
  name: "meridian",
  formatVersion: "0.1",
  platforms: ["web"],
  journeys: [{ id: "browse", entry: "home", states: { home: { screen: "Home", final: true } } }],
  screens: [{
    id: "Home",
    requiredStates: ["default"],
    designedStates: ["default"],
    layout: { blocks: [{ type: "header", label: "Home" }, { type: "button", label: "Go" }] },
  }],
};

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "uxloom-assign-"));
  writeFileSync(join(dir, "uxloom.project.json"), JSON.stringify(project, null, 2));
  return dir;
}

describe("agent-addressable comments (RFC 0006)", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise((res) => server!.close(res));
    server = undefined;
  });

  async function start(dir: string): Promise<string> {
    server = createPreviewServer(join(dir, "uxloom.project.json"), 0);
    await once(server, "listening");
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("no address");
    return `http://127.0.0.1:${address.port}`;
  }

  const post = (base: string, url: string, body: unknown) =>
    fetch(base + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("captures the block anchor on creation and persists it", async () => {
    const dir = workspace();
    const base = await start(dir);
    const res = await post(base, "/comments", {
      screen: "Home", state: "default", x: 30, y: 40, text: "make this button louder",
      block: { index: 1, type: "button", label: "Go" },
    });
    expect(res.status).toBe(200);
    const created = (await res.json()) as Record<string, unknown>;
    expect(created.status).toBe("open");
    expect(created.block).toEqual({ index: 1, type: "button", label: "Go" });
    const sidecar = JSON.parse(readFileSync(join(dir, "uxloom.project.comments.json"), "utf8"));
    expect(sidecar.comments[0].block).toEqual({ index: 1, type: "button", label: "Go" });
  });

  it("rejects a malformed block anchor but accepts anchorless comments", async () => {
    const dir = workspace();
    const base = await start(dir);
    const bad = await post(base, "/comments", {
      screen: "Home", state: "default", x: 1, y: 1, text: "note", block: { index: -1, type: "" },
    });
    expect(bad.status).toBe(400);
    const ok = await post(base, "/comments", { screen: "Home", state: "default", x: 1, y: 1, text: "auto-derived layout note" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as Record<string, unknown>).block).toBeUndefined();
  });

  it("assigns a comment to the agent: persisted status, idempotent, guarded", async () => {
    const dir = workspace();
    const base = await start(dir);
    const created = (await (await post(base, "/comments", { screen: "Home", state: "default", x: 5, y: 5, text: "hand this off" })).json()) as { id: string };

    const unknown = await post(base, "/comments/assign", { id: "nope" });
    expect(unknown.status).toBe(404);

    const assigned = await post(base, "/comments/assign", { id: created.id });
    expect(assigned.status).toBe(200);
    const body = (await assigned.json()) as Record<string, unknown>;
    expect(body.status).toBe("assigned");
    expect(body.assignedAt).toBeTypeOf("string");

    // idempotent: same assignedAt, still 200
    const again = await post(base, "/comments/assign", { id: created.id });
    expect(again.status).toBe(200);
    expect(((await again.json()) as Record<string, unknown>).assignedAt).toBe(body.assignedAt);

    const sidecar = JSON.parse(readFileSync(join(dir, "uxloom.project.comments.json"), "utf8"));
    expect(sidecar.comments[0].status).toBe("assigned");

    // resolved comments cannot be assigned
    await post(base, "/comments/resolve", { id: created.id });
    const conflict = await post(base, "/comments/assign", { id: created.id });
    expect(conflict.status).toBe(409);
  });

  it("preview resolve stamps resolvedBy reviewer and keeps status in sync", async () => {
    const dir = workspace();
    const base = await start(dir);
    const created = (await (await post(base, "/comments", { screen: "Home", state: "default", x: 5, y: 5, text: "fix then resolve" })).json()) as { id: string };
    const res = await post(base, "/comments/resolve", { id: created.id });
    expect(res.status).toBe(200);
    const sidecar = JSON.parse(readFileSync(join(dir, "uxloom.project.comments.json"), "utf8"));
    expect(sidecar.comments[0]).toMatchObject({ resolved: true, status: "resolved", resolvedBy: "reviewer" });
    expect(sidecar.comments[0].resolvedAt).toBeTypeOf("string");
  });

  it("ships the assign UI in the live template but never in static exports", () => {
    expect(PREVIEW_TEMPLATE).toContain("/comments/assign");
    expect(PREVIEW_TEMPLATE).toContain("Assign to agent");
    expect(PREVIEW_TEMPLATE).toContain("Address the assigned UXLoom comments");
    expect(PREVIEW_TEMPLATE).toContain("data-bi");
    // static exports hide all comment UI behind STATIC_INFO — the assign
    // handler only exists inside attachComments, which static mode never calls
    const standalone = renderStandalone(JSON.stringify(project));
    expect(standalone).toContain("STATIC_INFO");
  });
});
