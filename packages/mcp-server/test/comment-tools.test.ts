import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, ProjectStore } from "uxloom";

const PROJECT = {
  name: "t", formatVersion: "0.1", platforms: ["web"],
  journeys: [{
    id: "buy", goal: "Complete a purchase", entry: "cart",
    states: {
      cart: { screen: "CartScreen", on: { CHECKOUT: "pay" } },
      pay: { screen: "PayScreen", final: true },
    },
  }],
  screens: [
    {
      id: "CartScreen",
      requiredStates: ["default", "empty", "loading", "error.network"],
      designedStates: ["default", "empty", "loading", "error.network"],
      layout: { blocks: [{ type: "header", label: "Cart" }, { type: "list", label: "Items" }, { type: "button", label: "Checkout" }] },
    },
    {
      id: "PayScreen",
      requiredStates: ["default", "empty", "loading", "error.network"],
      designedStates: ["default", "empty", "loading", "error.network"],
    },
  ],
};

const COMMENTS = {
  comments: [
    // legacy comment: no status field → effective status "open"
    { id: "c-legacy", screen: "PayScreen", state: "default", x: 10, y: 10, text: "older note", resolved: false, createdAt: "2026-08-01T00:00:00.000Z" },
    {
      id: "c-assigned", screen: "CartScreen", state: "default", x: 50, y: 60,
      text: "This checkout button label is unclear", resolved: false, createdAt: "2026-08-08T00:00:00.000Z",
      status: "assigned", assignedAt: "2026-08-08T00:05:00.000Z",
      block: { index: 2, type: "button", label: "Checkout" },
    },
    { id: "c-done", screen: "CartScreen", state: "default", x: 5, y: 5, text: "done already", resolved: true, createdAt: "2026-08-01T00:00:00.000Z", status: "resolved" },
  ],
};

async function connect(comments: unknown = COMMENTS) {
  const dir = mkdtempSync(join(tmpdir(), "uxloom-ctools-"));
  const path = join(dir, "uxloom.project.json");
  writeFileSync(path, JSON.stringify(PROJECT));
  writeFileSync(join(dir, "uxloom.project.comments.json"), JSON.stringify(comments));
  const server = createServer(new ProjectStore(path));
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" });
  await Promise.all([client.connect(ct), server.connect(st)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return JSON.parse((res.content as Array<{ text: string }>)[0].text);
  };
  return { call, dir, close: () => client.close() };
}

describe("comments_list — the agent's work queue", () => {
  it("defaults to unresolved, assigned first, with counts and legacy comments treated as open", async () => {
    const { call, close } = await connect();
    const r = await call("comments_list");
    expect(r.comments.map((c: { id: string }) => c.id)).toEqual(["c-assigned", "c-legacy"]);
    expect(r.comments[0].status).toBe("assigned");
    expect(r.comments[1].status).toBe("open"); // legacy: no status field on disk
    expect(r.counts).toEqual({ open: 1, assigned: 1, resolved: 1 });
    expect(r.next).toMatch(/comment_context/);
    await close();
  });

  it("filters by status, including resolved and all", async () => {
    const { call, close } = await connect();
    expect((await call("comments_list", { status: "assigned" })).comments).toHaveLength(1);
    expect((await call("comments_list", { status: "resolved" })).comments.map((c: { id: string }) => c.id)).toEqual(["c-done"]);
    expect((await call("comments_list", { status: "all" })).comments).toHaveLength(3);
    await close();
  });
});

describe("comment_context — the work packet", () => {
  it("returns the anchored block, full screen, journey refs, and screen findings", async () => {
    const { call, close } = await connect();
    const r = await call("comment_context", { id: "c-assigned" });
    expect(r.comment.status).toBe("assigned");
    expect(r.anchoredBlock).toEqual({ type: "button", label: "Checkout" });
    expect(r.screen.id).toBe("CartScreen");
    expect(r.journeyRefs).toEqual([{ journey: "buy", state: "cart", final: false, on: { CHECKOUT: "pay" } }]);
    expect(Array.isArray(r.screenFindings)).toBe(true);
    expect(r.instruction).toMatch(/comment_resolve/);
    await close();
  });

  it("flags an out-of-range block anchor instead of returning the wrong block", async () => {
    const stale = {
      comments: [{
        id: "c-stale", screen: "CartScreen", state: "default", x: 1, y: 1, text: "stale", resolved: false,
        createdAt: "2026-08-08T00:00:00.000Z", block: { index: 9, type: "button", label: "Checkout" },
      }],
    };
    const { call, close } = await connect(stale);
    const r = await call("comment_context", { id: "c-stale" });
    expect(r.anchoredBlock.note).toMatch(/stale anchor/);
    expect(r.anchoredBlock.recorded).toEqual({ index: 9, type: "button", label: "Checkout" });
    await close();
  });

  it("flags a reordered anchor (index in range but wrong block) instead of returning it silently", async () => {
    // index 0 in the layout is the header, not the recorded button — a reorder.
    const reordered = {
      comments: [{
        id: "c-reorder", screen: "CartScreen", state: "default", x: 1, y: 1, text: "reordered", resolved: false,
        createdAt: "2026-08-08T00:00:00.000Z", block: { index: 0, type: "button", label: "Checkout" },
      }],
    };
    const { call, close } = await connect(reordered);
    const r = await call("comment_context", { id: "c-reorder" });
    expect(r.anchoredBlock.note).toMatch(/reordered or edited/);
    expect(r.anchoredBlock.blockNowAtIndex.type).toBe("header");
    expect(r.anchoredBlock.recorded.type).toBe("button");
    await close();
  });

  it("rejects an unknown id and lists the valid unresolved ids", async () => {
    const { call, close } = await connect();
    const r = await call("comment_context", { id: "nope" });
    expect(r.error).toMatch(/no comment/);
    expect(r.unresolvedIds).toEqual(["c-legacy", "c-assigned"]);
    await close();
  });
});

describe("comment_resolve — closing the loop", () => {
  it("persists resolvedBy agent + resolution to the sidecar and keeps the legacy boolean in sync", async () => {
    const { call, dir, close } = await connect();
    const r = await call("comment_resolve", { id: "c-assigned", resolution: "Renamed the button to 'Pay securely' and added a helper line under it." });
    expect(r.ok).toBe(true);
    expect(r.remaining).toEqual({ open: 1, assigned: 0 });
    const sidecar = JSON.parse(readFileSync(join(dir, "uxloom.project.comments.json"), "utf8"));
    const saved = sidecar.comments.find((c: { id: string }) => c.id === "c-assigned");
    expect(saved.status).toBe("resolved");
    expect(saved.resolved).toBe(true);
    expect(saved.resolvedBy).toBe("agent");
    expect(saved.resolution).toMatch(/Pay securely/);
    expect(saved.resolvedAt).toBeTruthy();
    await close();
  });

  it("points at the next assigned comment when more remain", async () => {
    const two = {
      comments: [
        { id: "a1", screen: "CartScreen", state: "default", x: 1, y: 1, text: "first", resolved: false, createdAt: "2026-08-08T00:00:00.000Z", status: "assigned" },
        { id: "a2", screen: "PayScreen", state: "default", x: 2, y: 2, text: "second", resolved: false, createdAt: "2026-08-08T00:01:00.000Z", status: "assigned" },
      ],
    };
    const { call, close } = await connect(two);
    const r = await call("comment_resolve", { id: "a1", resolution: "Addressed the first note with a copy change." });
    expect(r.next).toContain("a2");
    await close();
  });

  it("errors on already-resolved and unknown ids, and rejects trivial resolution notes", async () => {
    const { call, close } = await connect();
    expect((await call("comment_resolve", { id: "c-done", resolution: "already handled before this call" })).error).toMatch(/already resolved/);
    expect((await call("comment_resolve", { id: "nope", resolution: "long enough resolution note" })).error).toMatch(/no comment/);
    // schema-level rejection surfaces as a thrown protocol error
    await expect(call("comment_resolve", { id: "c-legacy", resolution: "short" })).rejects.toThrow();
    await close();
  });
});

describe("project_validate — assigned comments surface in the summary", () => {
  it("counts assigned separately from all unresolved and marks the finding message", async () => {
    const { call, close } = await connect();
    const r = await call("project_validate");
    expect(r.summary.openReviewerComments).toBe(2);
    expect(r.summary.assignedComments).toBe(1);
    const messages = r.findings.filter((f: { code?: string }) => f.code === "reviewer-comment").map((f: { message: string }) => f.message);
    expect(messages.some((m: string) => m.includes("ASSIGNED TO AGENT"))).toBe(true);
    await close();
  });
});
