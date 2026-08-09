import { afterEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commentsPathFor, createPreviewServer } from "uxloom/dist/preview.js";
import { PREVIEW_TEMPLATE, renderStandalone } from "uxloom/dist/preview-template.js";
import { buildExportHtml, globToRegExp } from "uxloom/dist/preview-export.js";

const project = {
  name: "meridian",
  formatVersion: "0.1",
  platforms: ["web"],
  journeys: [
    {
      id: "browse",
      entry: "home",
      states: { home: { screen: "Home", final: true } },
    },
  ],
  screens: [{ id: "Home", requiredStates: ["default"], designedStates: ["default"] }],
};

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "uxloom-preview-"));
  writeFileSync(join(dir, "uxloom.project.json"), JSON.stringify(project, null, 2));
  return dir;
}

describe("comments API", () => {
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

  it("round-trips comments through the file next to the project", async () => {
    const dir = workspace();
    const base = await start(dir);
    const commentsFile = join(dir, "uxloom.project.comments.json");
    expect(commentsPathFor(join(dir, "uxloom.project.json"))).toBe(commentsFile);

    // empty until the first comment lands
    let res = await fetch(`${base}/comments`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comments: [] });
    expect(existsSync(commentsFile)).toBe(false);

    // create
    res = await fetch(`${base}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen: "Home", state: "default", x: 42.5, y: 61.2, text: "tighten this spacing" }),
    });
    expect(res.status).toBe(200);
    const created = (await res.json()) as Record<string, unknown>;
    expect(created.id).toBeTypeOf("string");
    expect(created.createdAt).toBeTypeOf("string");
    expect(created).toMatchObject({
      screen: "Home", state: "default", x: 42.5, y: 61.2,
      text: "tighten this spacing", resolved: false,
    });

    // persisted next to the project, and served back
    const onDisk = JSON.parse(readFileSync(commentsFile, "utf8")) as { comments: unknown[] };
    expect(onDisk.comments).toHaveLength(1);
    res = await fetch(`${base}/comments`);
    expect(((await res.json()) as { comments: unknown[] }).comments).toEqual([created]);

    // resolve
    res = await fetch(`${base}/comments/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: created.id }),
    });
    expect(res.status).toBe(200);
    const resolved = JSON.parse(readFileSync(commentsFile, "utf8")) as { comments: { resolved: boolean }[] };
    expect(resolved.comments[0].resolved).toBe(true);
  });

  it("rejects malformed bodies with 400 and unknown ids with 404", async () => {
    const base = await start(workspace());

    let res = await fetch(`${base}/comments`, { method: "POST", body: "not json" });
    expect(res.status).toBe(400);

    res = await fetch(`${base}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen: "Home" }), // missing state/x/y/text
    });
    expect(res.status).toBe(400);

    res = await fetch(`${base}/comments/resolve`, { method: "POST", body: "{{{" });
    expect(res.status).toBe(400);

    res = await fetch(`${base}/comments/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("structured edit mode (/edit)", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise((res) => server!.close(res));
    server = undefined;
  });

  const editableProject = {
    name: "meridian",
    formatVersion: "0.1",
    platforms: ["web"],
    journeys: [
      { id: "browse", entry: "home", states: { home: { screen: "Home", final: true } } },
    ],
    screens: [
      {
        id: "Home",
        requiredStates: ["default"],
        designedStates: ["default"],
        layout: {
          blocks: [
            { type: "header", label: "Home" },
            { type: "text", copy: "Welcome back" },
            { type: "button", label: "Continue" },
          ],
        },
      },
      { id: "Bare", requiredStates: ["default"], designedStates: [] }, // no layout
    ],
  };

  async function start(): Promise<{ base: string; projectFile: string }> {
    const dir = mkdtempSync(join(tmpdir(), "uxloom-edit-"));
    const projectFile = join(dir, "uxloom.project.json");
    writeFileSync(projectFile, JSON.stringify(editableProject, null, 2));
    server = createPreviewServer(projectFile, 0);
    await once(server, "listening");
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("no address");
    return { base: `http://127.0.0.1:${address.port}`, projectFile };
  }

  function post(base: string, payload: unknown): Promise<Response> {
    return fetch(`${base}/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function blocksOnDisk(projectFile: string): Record<string, unknown>[] {
    const project = JSON.parse(readFileSync(projectFile, "utf8")) as {
      screens: { id: string; layout?: { blocks: Record<string, unknown>[] } }[];
    };
    return project.screens.find((s) => s.id === "Home")!.layout!.blocks;
  }

  it("set-copy round-trips to the project file", async () => {
    const { base, projectFile } = await start();
    const res = await post(base, { op: "set-copy", screen: "Home", blockIndex: 1, copy: "New headline" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, op: "set-copy" });
    expect(blocksOnDisk(projectFile)[1].copy).toBe("New headline");
  });

  it("set-label writes the block label", async () => {
    const { base, projectFile } = await start();
    const res = await post(base, { op: "set-label", screen: "Home", blockIndex: 2, label: "Pay now" });
    expect(res.status).toBe(200);
    expect(blocksOnDisk(projectFile)[2].label).toBe("Pay now");
  });

  it("move-block reorders and remove-block deletes", async () => {
    const { base, projectFile } = await start();
    let res = await post(base, { op: "move-block", screen: "Home", from: 2, to: 0 });
    expect(res.status).toBe(200);
    expect(blocksOnDisk(projectFile).map((b) => b.type)).toEqual(["button", "header", "text"]);

    res = await post(base, { op: "remove-block", screen: "Home", blockIndex: 0 });
    expect(res.status).toBe(200);
    expect(blocksOnDisk(projectFile).map((b) => b.type)).toEqual(["header", "text"]);
  });

  it("add-block inserts a validated block at the index", async () => {
    const { base, projectFile } = await start();
    const res = await post(base, { op: "add-block", screen: "Home", index: 3, block: { type: "field", label: "Email" } });
    expect(res.status).toBe(200);
    expect(blocksOnDisk(projectFile)[3]).toEqual({ type: "field", label: "Email" });
  });

  it("set-token writes tokens and rejects unknown paths", async () => {
    const { base, projectFile } = await start();
    let res = await post(base, { op: "set-token", path: "colors.accent", value: "#ff0055" });
    expect(res.status).toBe(200);
    res = await post(base, { op: "set-token", path: "radius", value: 12 });
    expect(res.status).toBe(200);
    const project = JSON.parse(readFileSync(projectFile, "utf8")) as { tokens: Record<string, unknown> };
    expect(project.tokens).toEqual({ colors: { accent: "#ff0055" }, radius: 12 });

    res = await post(base, { op: "set-token", path: "colors.evil", value: "#000000" });
    expect(res.status).toBe(400);
    res = await post(base, { op: "set-token", path: "radius", value: "12" }); // wrong primitive
    expect(res.status).toBe(400);
  });

  it("rejects malformed requests with 400", async () => {
    const { base } = await start();
    let res = await fetch(`${base}/edit`, { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
    res = await post(base, { op: "explode", screen: "Home" });
    expect(res.status).toBe(400);
    res = await post(base, { op: "set-copy", screen: "Home", blockIndex: -1, copy: "x" });
    expect(res.status).toBe(400);
    res = await post(base, { op: "set-copy", screen: "Home", blockIndex: 99, copy: "x" });
    expect(res.status).toBe(400);
    res = await post(base, { op: "add-block", screen: "Home", index: 0, block: "field" });
    expect(res.status).toBe(400);
  });

  it("returns 422 and writes nothing when the edit breaks validation", async () => {
    const { base, projectFile } = await start();
    const before = readFileSync(projectFile, "utf8");
    const res = await post(base, { op: "add-block", screen: "Home", index: 0, block: { type: "nonsense" } });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTypeOf("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(readFileSync(projectFile, "utf8")).toBe(before); // untouched
  });

  it("rejects block ops on screens without an explicit layout with 409", async () => {
    const { base } = await start();
    const res = await post(base, { op: "set-copy", screen: "Bare", blockIndex: 0, copy: "x" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(
      "screen has no explicit layout — ask your agent to add one (auto-derived layouts are not editable)"
    );
  });

  it("returns 404 for unknown screens", async () => {
    const { base } = await start();
    const res = await post(base, { op: "remove-block", screen: "Ghost", blockIndex: 0 });
    expect(res.status).toBe(404);
  });
});

describe("renderStandalone", () => {
  it("embeds the project and strips the live-reload wiring", () => {
    // the live template streams; the marker must exist for the export to strip
    expect(PREVIEW_TEMPLATE).toContain("EventSource");

    const html = renderStandalone(JSON.stringify(project));
    expect(html).toContain("meridian");
    expect(html).toContain("STATIC_INFO = {");
    expect(html).not.toContain("EventSource");
  });

  it("keeps embedded JSON inert inside the script tag", () => {
    const sneaky = { ...project, name: "x</script><script>alert(1)" };
    const html = renderStandalone(JSON.stringify(sneaky));
    expect(html).not.toContain("</script><script>alert(1)");
  });

  it("strips the structured edit mode entirely from static exports", () => {
    // the live template ships edit mode; the standalone must not
    expect(PREVIEW_TEMPLATE).toContain('"/edit"');
    expect(PREVIEW_TEMPLATE).toContain("set-token");

    const html = renderStandalone(JSON.stringify(project));
    expect(html).not.toContain('"/edit"');
    expect(html).not.toContain("set-token");
    expect(html).toContain("var EDIT = null"); // stays null → no edit UI renders
  });
});

describe("static export with include fragments", () => {
  it("matches * within a segment and ** across segments", () => {
    expect(globToRegExp("fragments/*.json").test("fragments/a.json")).toBe(true);
    expect(globToRegExp("fragments/*.json").test("fragments/deep/a.json")).toBe(false);
    expect(globToRegExp("fragments/**/*.json").test("fragments/deep/a.json")).toBe(true);
    expect(globToRegExp("fragments/**/*.json").test("fragments/a.json")).toBe(true);
    expect(globToRegExp("*.json").test("uxloom.project.json")).toBe(true);
  });

  it("merges fragment journeys and screens into the exported HTML", () => {
    const dir = mkdtempSync(join(tmpdir(), "uxloom-export-"));
    const projectPath = join(dir, "uxloom.project.json");
    writeFileSync(projectPath, JSON.stringify({ ...project, include: ["fragments/**/*.json"] }, null, 2));
    mkdirSync(join(dir, "fragments", "deep"), { recursive: true });
    writeFileSync(
      join(dir, "fragments", "settings.json"),
      JSON.stringify({ screens: [{ id: "SettingsFragmentScreen", requiredStates: ["default"], designedStates: [] }] })
    );
    writeFileSync(
      join(dir, "fragments", "deep", "admin.json"),
      JSON.stringify({ journeys: [{ id: "admin-journey", entry: "root", states: { root: { screen: "Home", final: true } } }] })
    );

    const html = buildExportHtml(projectPath);
    expect(html).toContain("meridian");
    expect(html).toContain("SettingsFragmentScreen");
    expect(html).toContain("admin-journey");
    expect(html).not.toContain('"include"');
  });

  it("does not swallow its own project file when a glob matches it", () => {
    const dir = mkdtempSync(join(tmpdir(), "uxloom-export-self-"));
    const projectPath = join(dir, "uxloom.project.json");
    writeFileSync(projectPath, JSON.stringify({ ...project, include: ["*.json"] }, null, 2));

    const html = buildExportHtml(projectPath);
    expect(html).toContain("meridian"); // merged once, no self-duplication blowup
  });
});

describe("mobile & tablet viewports render as devices", () => {
  it("ships the phone bezel + dynamic island", () => {
    // A rounded dark bezel so the mobile viewport reads as a device, not a narrow browser.
    expect(PREVIEW_TEMPLATE).toMatch(/\.frame\.mobile\s*\{[^}]*border-radius:\s*52px/);
    expect(PREVIEW_TEMPLATE).toContain(".frame.mobile .island");
    expect(PREVIEW_TEMPLATE).toContain(".frame.mobile .home-ind");
  });

  it("ships the tablet bezel + camera dot", () => {
    expect(PREVIEW_TEMPLATE).toMatch(/\.frame\.tablet\s*\{[^}]*border-radius:\s*34px/);
    expect(PREVIEW_TEMPLATE).toContain(".frame.tablet .cam");
    expect(PREVIEW_TEMPLATE).toContain(".frame.tablet .home-ind");
  });

  it("builds an iOS-style status bar + home indicator for both device viewports", () => {
    expect(PREVIEW_TEMPLATE).toContain('h("span", "st-time", "9:41")');
    expect(PREVIEW_TEMPLATE).toContain('vp === "mobile" ? "island" : "cam"');
    expect(PREVIEW_TEMPLATE).toContain('h("div", "home-ind")');
    // both mobile and tablet get the status bar and home indicator
    expect(PREVIEW_TEMPLATE).toContain('vp === "mobile" || vp === "tablet"');
    expect(PREVIEW_TEMPLATE).toContain('viewport === "mobile" || viewport === "tablet"');
  });
});
