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
