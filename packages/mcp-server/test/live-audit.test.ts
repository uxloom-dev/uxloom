/**
 * Lane F tests — must be green WITHOUT Playwright installed (the core is
 * zero-dependency; Playwright is an optional enhancement). The graceful-
 * degradation suite runs only when Playwright is absent; the real-DOM
 * suite runs only when it is present. Either way the whole file passes.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { parseProject } from "@uxloom/journeygraph";
import { loadPlaywright, PLAYWRIGHT_HINT } from "uxloom/dist/optional-browser.js";
import {
  runLiveAudit,
  summarizeLiveAudit,
  type LiveAuditResult,
  type RouteMap,
} from "uxloom/dist/live-audit.js";
import { pngFileName, runPngExport, sanitizeForFilename } from "uxloom/dist/export-png.js";
import { loadMap } from "uxloom/dist/audit.js";

const hasPlaywright = (await loadPlaywright()) !== null;

const project = parseProject({
  name: "live-t",
  formatVersion: "0.1",
  platforms: ["web"],
  journeys: [],
  screens: [
    {
      id: "Inbox",
      requiredStates: ["default", "empty", "error.network"],
      designedStates: ["default", "empty", "error.network"],
    },
    { id: "Ghost", requiredStates: ["default"], designedStates: ["default"] },
  ],
});

describe("PLAYWRIGHT_HINT", () => {
  it("tells the user exactly how to enable the optional features", () => {
    expect(PLAYWRIGHT_HINT).toContain("npm i -D playwright");
    expect(PLAYWRIGHT_HINT).toContain("npx playwright install chromium");
    expect(PLAYWRIGHT_HINT).toContain("--live");
    expect(PLAYWRIGHT_HINT).toContain("--png");
  });
});

describe("route map typing", () => {
  it("loadMap passes optional route keys through and assigns to RouteMap", () => {
    const dir = mkdtempSync(join(tmpdir(), "uxloom-live-map-"));
    const mapPath = join(dir, "uxloom.map.json");
    writeFileSync(
      mapPath,
      JSON.stringify({
        Inbox: { paths: ["app/inbox/**"], route: "/inbox" },
        Ghost: { paths: ["app/ghost/**"] },
      }),
    );
    const map: RouteMap = loadMap(mapPath);
    expect(map.Inbox.route).toBe("/inbox");
    expect(map.Inbox.paths).toEqual(["app/inbox/**"]);
    expect(map.Ghost.route).toBeUndefined();
  });
});

describe("png filename sanitization", () => {
  it("turns state dots into dashes", () => {
    expect(sanitizeForFilename("error.network")).toBe("error-network");
    expect(sanitizeForFilename("error.card.declined")).toBe("error-card-declined");
  });
  it("neutralizes path-hostile characters", () => {
    expect(sanitizeForFilename("a/b\\c:d e")).toBe("a-b-c-d-e");
    expect(sanitizeForFilename("..")).toBe("--");
  });
  it("composes screen--state.png", () => {
    expect(pngFileName("Checkout", "error.card.declined")).toBe(
      "Checkout--error-card-declined.png",
    );
  });
});

describe.skipIf(hasPlaywright)("graceful degradation without playwright", () => {
  it("loadPlaywright resolves null", async () => {
    expect(await loadPlaywright()).toBeNull();
  });

  it("runLiveAudit reports unavailable with the install hint, no exit", async () => {
    const map: RouteMap = { Inbox: { paths: ["app/**"], route: "/inbox" } };
    const result = await runLiveAudit(project, "/nowhere", map, "http://127.0.0.1:1");
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/playwright is not installed/);
    expect(result.hint).toBe(PLAYWRIGHT_HINT);
    expect(result.screens).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("summarizeLiveAudit prints the hint for an unavailable result", async () => {
    const result = await runLiveAudit(project, "/nowhere", {}, "http://127.0.0.1:1");
    const lines = summarizeLiveAudit(result);
    expect(lines[0]).toContain("live audit unavailable");
    expect(lines.join("\n")).toContain(PLAYWRIGHT_HINT);
  });

  it("runPngExport throws with the install hint", async () => {
    await expect(runPngExport(undefined, join(tmpdir(), "uxloom-png-out"))).rejects.toThrow(
      PLAYWRIGHT_HINT,
    );
  });
});

describe.skipIf(!hasPlaywright)("live DOM verification with playwright", () => {
  const PAGE = `<!DOCTYPE html><html><body>
    <div data-ux-screen="Inbox">
      <div data-ux-state="default">Inbox content</div>
      <div data-ux-state="error.network" style="display:none">You are offline</div>
    </div>
  </body></html>`;

  function listen(server: Server): Promise<string> {
    return new Promise((resolvePort) => {
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resolvePort(`http://127.0.0.1:${port}`);
      });
    });
  }

  it(
    "verifies rendered / present / absent against a real DOM and skips unrouted screens",
    { timeout: 60_000 },
    async () => {
      const server = createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(PAGE);
      });
      const baseUrl = await listen(server);
      let result: LiveAuditResult;
      try {
        const map: RouteMap = { Inbox: { paths: ["app/inbox/**"], route: "/inbox" } };
        result = await runLiveAudit(project, "/nowhere", map, baseUrl);
      } finally {
        server.close();
      }
      expect(result.available).toBe(true);
      expect(result.skipped).toEqual(["Ghost"]);
      expect(result.screens).toHaveLength(1);
      const inbox = result.screens[0];
      expect(inbox.screen).toBe("Inbox");
      expect(inbox.route).toBe("/inbox");
      expect(inbox.screenFound).toBe(true);
      const dom = Object.fromEntries(inbox.states.map((s) => [s.state, s.dom]));
      expect(dom).toEqual({
        default: "rendered", // visible, non-zero size
        "error.network": "present", // in DOM but display:none
        empty: "absent", // never rendered
      });
      const lines = summarizeLiveAudit(result);
      expect(lines.join("\n")).toContain("Inbox @ /inbox");
      expect(lines.join("\n")).toContain("skipped (no route");
    },
  );
});
