import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, ProjectStore } from "uxloom";

async function connect() {
  const dir = mkdtempSync(join(tmpdir(), "uxloom-tools-"));
  const server = createServer(new ProjectStore(join(dir, "uxloom.project.json")));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return JSON.parse((res.content as Array<{ text: string }>)[0].text);
  };
  return { call, close: () => client.close() };
}

const project = {
  name: "demo",
  formatVersion: "0.1",
  platforms: ["web"],
  journeys: [
    {
      id: "j",
      entry: "a",
      states: {
        a: { screen: "A", on: { GO: "b", FAIL: "a#error.network" } },
        b: { screen: "B", final: true },
      },
    },
  ],
  screens: [
    { id: "A", requiredStates: ["default", "empty", "loading", "error.network"],
      designedStates: ["default", "empty", "loading", "error.network"] },
    { id: "B", requiredStates: ["default", "empty", "loading", "error.network"],
      designedStates: ["default", "empty", "loading", "error.network"] },
  ],
};

describe("project_import / project_export", () => {
  it("imports a whole project in one call and round-trips through export", async () => {
    const { call, close } = await connect();
    const imported = await call("project_import", { project });
    expect(imported.ok).toBe(true);
    expect(imported.screens).toEqual(["A", "B"]);
    expect(imported.validation.errors).toBe(0);
    const exported = await call("project_export");
    expect(exported).toEqual(project);
    await close();
  });

  it("rejects documents with unknown fields instead of stripping them", async () => {
    const { call, close } = await connect();
    // Strict schemas reject at the protocol layer — the call itself fails,
    // nothing is silently stripped or saved.
    await expect(
      call("project_import", { project: { ...project, sneaky: true } }),
    ).rejects.toThrow();
    const exported = await call("project_export").catch(() => null);
    expect(exported).toBeNull(); // nothing was persisted by the bad import
    await close();
  });
});

describe("palette_check", () => {
  it("reports ratios, failures, and thin-margin passes", async () => {
    const { call, close } = await connect();
    const res = await call("palette_check", {
      pairs: [
        { name: "ink on paper", fg: "#2B2725", bg: "#FAF9F6" },
        { name: "thin margin", fg: "#7A716B", bg: "#FAF9F6" },
        { name: "failing grey", fg: "#8A8F98", bg: "#F4F4F4" },
      ],
    });
    expect(res.failures).toBe(1);
    expect(res.thinMargins).toBe(1);
    const failing = res.results.find((r: { name: string }) => r.name === "failing grey");
    expect(failing.passesAA).toBe(false);
    expect(failing.ratio).toBeLessThan(4.5);
    await close();
  });
});

describe("brief_start with context", () => {
  it("switches instructions to extract-from-document mode", async () => {
    const { call, close } = await connect();
    const res = await call("brief_start", {
      prompt: "design a dashboard",
      context: "PRD: platforms are web and android. Brand color #2F6B52.",
    });
    expect(res.instructions).toMatch(/context document was provided/i);
    expect(res.inputRequests.length).toBeGreaterThan(0);
    await close();
  });
});
