import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, ProjectStore } from "uxloom";

const PROJECT = {
  name: "t", formatVersion: "0.1", platforms: ["web"],
  rationale: {
    decision: "Overview-first IA",
    reasoning: "Admin tools land on what needs attention; settings-first landing buries the product's value behind chores.",
    alternatives: [{ option: "Settings-first", pros: ["setup completion"], cons: ["hides value", "diverges from category convention"] }],
  },
  journeys: [],
  screens: [{
    id: "S", requiredStates: ["default", "empty", "loading", "error.network"],
    designedStates: ["default", "empty", "loading", "error.network"],
  }],
};

async function connect() {
  const dir = mkdtempSync(join(tmpdir(), "uxloom-review-"));
  const path = join(dir, "uxloom.project.json");
  writeFileSync(path, JSON.stringify(PROJECT));
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

describe("design_review — the bounded iteration loop", () => {
  it("runs three rounds with rubric, deltas, and persistence — then refuses round 4", async () => {
    const { call, dir, close } = await connect();

    const r1 = await call("design_review", { notes: "initial review" });
    expect(r1.allowed).toBe(true);
    expect(r1.round).toBe(1);
    expect(r1.delta).toBeNull();
    expect(r1.rubric).toHaveLength(6);
    expect(r1.rubric.join(" ")).toMatch(/MARKET FIT/);
    expect(r1.rationaleCoverage.optedIn).toBe(true);
    expect(r1.instruction).toContain("Round 1 of 3");

    const r2 = await call("design_review", {});
    expect(r2.round).toBe(2);
    expect(r2.delta).toEqual({ errors: 0, warnings: 0, rationaleDocumented: 0 });

    const r3 = await call("design_review", {});
    expect(r3.round).toBe(3);
    expect(r3.instruction).toContain("present the design");

    const r4 = await call("design_review", {});
    expect(r4.allowed).toBe(false);
    expect(r4.roundsUsed).toBe(3);
    expect(r4.message).toMatch(/user/i);

    // Rounds are persisted and auditable.
    const sidecar = JSON.parse(readFileSync(join(dir, "uxloom.project.reviews.json"), "utf8"));
    expect(sidecar.rounds).toHaveLength(3);
    expect(sidecar.rounds[0].notes).toBe("initial review");
    await close();
  });

  it("surfaces rationale gaps in the review payload", async () => {
    const { call, close } = await connect();
    const r1 = await call("design_review", {});
    // Screen S has no rationale while the project opted in → finding present.
    expect(r1.openFindings.some((f: { code?: string }) => f.code === "rationale-missing")).toBe(true);
    await close();
  });
});
