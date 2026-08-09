import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditDesign, parseDesignExport, type DesignFrame } from "uxloom/dist/design-audit.js";
import { buildScreenSvg, orderedFrames, type SvgProject } from "uxloom/dist/export-svg.js";

const project = {
  name: "shop",
  formatVersion: "0.1",
  platforms: ["web"],
  journeys: [],
  screens: [
    { id: "Cart", requiredStates: ["default", "empty", "loading"], designedStates: [] },
    { id: "Payment", requiredStates: ["default", "error.declined"], designedStates: [] },
  ],
} as unknown as Parameters<typeof auditDesign>[0];

describe("auditDesign (R28 diff)", () => {
  it("flags a screen with no frame in the design", () => {
    const frames: DesignFrame[] = [
      { screen: "Cart", state: "default", source: "a.svg" },
      { screen: "Cart", state: "empty", source: "b.svg" },
      { screen: "Cart", state: "loading", source: "c.svg" },
    ];
    const r = auditDesign(project, frames);
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain("design-screen-unmapped"); // Payment absent entirely
    expect(r.findings.find((f) => f.code === "design-screen-unmapped")?.screen).toBe("Payment");
    expect(r.summary.unmappedScreens).toBe(1);
  });

  it("flags a required state missing from a present screen", () => {
    const frames: DesignFrame[] = [
      { screen: "Cart", state: "default", source: "x" },
      { screen: "Cart", state: "empty", source: "x" },
      { screen: "Cart", state: "loading", source: "x" },
      { screen: "Payment", state: "default", source: "x" }, // missing error.declined
    ];
    const r = auditDesign(project, frames);
    const missing = r.findings.filter((f) => f.code === "design-state-missing");
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ screen: "Payment", state: "error.declined", severity: "error" });
  });

  it("flags frames the contract does not have, and scaffolds them", () => {
    const frames: DesignFrame[] = [
      ...["default", "empty", "loading"].map((state) => ({ screen: "Cart", state, source: "x" })),
      ...["default", "error.declined"].map((state) => ({ screen: "Payment", state, source: "x" })),
      { screen: "Wishlist", state: "default", source: "x" },
      { screen: "Wishlist", state: "empty", source: "x" },
    ];
    const r = auditDesign(project, frames);
    const unmapped = r.findings.filter((f) => f.code === "design-frame-unmapped");
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].screen).toBe("Wishlist");
    expect(r.scaffold.screens).toEqual([
      { id: "Wishlist", requiredStates: ["default", "empty"], designedStates: ["default", "empty"] },
    ]);
  });

  it("passes clean when the design covers the whole contract", () => {
    const frames: DesignFrame[] = [
      ...["default", "empty", "loading"].map((state) => ({ screen: "Cart", state, source: "x" })),
      ...["default", "error.declined"].map((state) => ({ screen: "Payment", state, source: "x" })),
    ];
    const r = auditDesign(project, frames);
    expect(r.findings.filter((f) => f.severity === "error")).toHaveLength(0);
    expect(r.summary.missingStates).toBe(0);
  });

  it("is deterministic — findings sort stably", () => {
    const frames: DesignFrame[] = [{ screen: "Zed", state: "x", source: "x" }];
    expect(JSON.stringify(auditDesign(project, frames))).toBe(JSON.stringify(auditDesign(project, frames)));
  });
});

describe("parseDesignExport (R28 name recovery)", () => {
  const dirs: string[] = [];
  const mkTmp = (): string => {
    const d = mkdtempSync(join(tmpdir(), "uxloom-design-"));
    dirs.push(d);
    return d;
  };
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it("recovers frames from SVG <title> without a manifest", () => {
    const dir = mkTmp();
    const svgProject: SvgProject = {
      name: "shop",
      platforms: ["web"],
      screens: [{ id: "Payment", requiredStates: ["default", "error.declined"] }],
    };
    writeFileSync(join(dir, "a.svg"), buildScreenSvg(svgProject, "Payment", "default"));
    writeFileSync(join(dir, "b.svg"), buildScreenSvg(svgProject, "Payment", "error.declined"));
    const frames = parseDesignExport(dir);
    expect(frames).toEqual([
      { screen: "Payment", state: "default", source: "a.svg" },
      { screen: "Payment", state: "error.declined", source: "b.svg" },
    ]);
    // block-group <title>s (e.g. "0 · header") must NOT become phantom frames
    expect(frames.every((f) => f.screen === "Payment")).toBe(true);
  });

  it("prefers a uxloom manifest and carries the journey", () => {
    const dir = mkTmp();
    const manifest = [
      { file: "Payment--default.svg", journey: "Checkout", screen: "Payment", state: "default" },
    ];
    writeFileSync(join(dir, "index.json"), JSON.stringify(manifest));
    writeFileSync(join(dir, "Payment--default.svg"), "<svg><title>ignored / when-manifest</title></svg>");
    const frames = parseDesignExport(dir);
    expect(frames).toEqual([{ screen: "Payment", state: "default", journey: "Checkout", source: "Payment--default.svg" }]);
  });

  it("recovers frames from a Figma/Penpot-style JSON name tree", () => {
    const dir = mkTmp();
    const tree = {
      document: {
        name: "Page 1",
        children: [
          { name: "Checkout ▸ Payment / default", type: "FRAME" },
          { name: "0 · header", type: "GROUP" }, // block layer — must be skipped
        ],
      },
    };
    writeFileSync(join(dir, "figma.json"), JSON.stringify(tree));
    const frames = parseDesignExport(dir);
    expect(frames).toEqual([{ screen: "Payment", state: "default", journey: "Checkout", source: "figma.json" }]);
  });
});

describe("forward → reverse round-trip", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it("an exported --manifest re-audits clean against its own contract", () => {
    const dir = mkdtempSync(join(tmpdir(), "uxloom-rt-"));
    dirs.push(dir);
    const full = {
      name: "shop",
      formatVersion: "0.1",
      platforms: ["web"],
      journeys: [
        { id: "Checkout", entry: "cart", states: { cart: { screen: "Cart", on: { pay: "pay" } }, pay: { screen: "Payment", final: true } } },
      ],
      screens: [
        { id: "Cart", requiredStates: ["default", "empty", "loading"], designedStates: [] },
        { id: "Payment", requiredStates: ["default", "error.declined"], designedStates: [] },
      ],
    };

    // Reproduce what `export --svg --manifest` writes: SVG per frame + index.json.
    const frames = orderedFrames(full as unknown as SvgProject);
    for (const f of frames) writeFileSync(join(dir, f.file), buildScreenSvg(full as unknown as SvgProject, f.screen, f.state));
    writeFileSync(join(dir, "index.json"), JSON.stringify(frames, null, 2));

    const recovered = parseDesignExport(dir);
    const r = auditDesign(full as unknown as Parameters<typeof auditDesign>[0], recovered);
    expect(r.findings.filter((f) => f.severity === "error")).toHaveLength(0);
    expect(r.summary.missingStates).toBe(0);
    // journey attribution survived the manifest round-trip
    expect(recovered.find((f) => f.screen === "Payment")?.journey).toBe("Checkout");
  });
});
