import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyBaseline,
  commentFindings,
  fingerprint,
  loadWorkspace,
} from "uxloom/dist/workspace.js";
import { renderGithub, renderSarif } from "uxloom/dist/reporters.js";

const SCREEN = {
  id: "A",
  requiredStates: ["default", "empty", "loading", "error.network"],
  designedStates: ["default", "empty", "loading", "error.network"],
};

function workspaceWith(extra: Record<string, unknown>, fragments: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "uxloom-ws-"));
  const base = {
    name: "t", formatVersion: "0.1", platforms: ["web"],
    journeys: [], screens: [SCREEN], ...extra,
  };
  writeFileSync(join(dir, "uxloom.project.json"), JSON.stringify(base));
  for (const [name, content] of Object.entries(fragments)) {
    mkdirSync(join(dir, "designs"), { recursive: true });
    writeFileSync(join(dir, "designs", name), JSON.stringify(content));
  }
  return { dir, path: join(dir, "uxloom.project.json") };
}

describe("workspace loading", () => {
  it("merges fragment files via include globs", () => {
    const { path } = workspaceWith(
      { include: ["designs/*.json"] },
      { "billing.json": { screens: [{ ...SCREEN, id: "B" }] } },
    );
    const ws = loadWorkspace(path);
    expect(ws.project.screens.map((s) => s.id).sort()).toEqual(["A", "B"]);
    expect(ws.fragments).toEqual(["designs/billing.json"]);
    expect(ws.loadFindings).toEqual([]);
  });

  it("errors on duplicate ids across base and fragments", () => {
    const { path } = workspaceWith(
      { include: ["designs/*.json"] },
      { "dupe.json": { screens: [SCREEN] } },
    );
    const ws = loadWorkspace(path);
    expect(ws.loadFindings).toContainEqual(
      expect.objectContaining({ code: "duplicate-id", severity: "error", screen: "A" }),
    );
  });

  it("reads config thresholds and comments when present", () => {
    const { dir, path } = workspaceWith({});
    writeFileSync(join(dir, "uxloom.config.json"), JSON.stringify({ thresholds: { contrastRatio: 7 } }));
    writeFileSync(join(dir, "uxloom.project.comments.json"), JSON.stringify({
      comments: [{ id: "1", screen: "A", state: "default", x: 10, y: 20, text: "make it pop less", resolved: false, createdAt: "2026-08-08T00:00:00Z" }],
    }));
    const ws = loadWorkspace(path);
    expect(ws.config.thresholds?.contrastRatio).toBe(7);
    const findings = commentFindings(ws.comments);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: "reviewer-comment", severity: "warning", screen: "A" });
  });
});

describe("baseline", () => {
  it("suppresses fingerprinted findings and keeps fresh ones", () => {
    const known = { code: "state-undesigned", screen: "A", state: "empty" };
    const fresh = { code: "state-undesigned", screen: "B", state: "empty" };
    const result = applyBaseline([known, fresh], [fingerprint(known)]);
    expect(result.suppressed).toBe(1);
    expect(result.fresh).toEqual([fresh]);
  });

  it("fingerprints are stable and location-sensitive", () => {
    const a = { code: "x", screen: "S", state: "empty" };
    expect(fingerprint(a)).toBe(fingerprint({ ...a }));
    expect(fingerprint(a)).not.toBe(fingerprint({ ...a, state: "loading" }));
  });
});

describe("reporters", () => {
  const envelope = {
    tool: "uxloom" as const, command: "check" as const, version: "0.0.0",
    summary: { errors: 1 },
    findings: [{
      code: "state-undesigned", severity: "error" as const,
      message: "Screen \"A\" requires state \"empty\"\nsecond line",
      fix: "design it", file: "uxloom.project.json", screen: "A", state: "empty",
    }],
  };

  it("emits valid SARIF 2.1.0 structure", () => {
    const sarif = JSON.parse(renderSarif(envelope));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.name).toBe("uxloom-check");
    expect(sarif.runs[0].results[0]).toMatchObject({
      ruleId: "state-undesigned",
      level: "error",
      locations: [{ physicalLocation: { artifactLocation: { uri: "uxloom.project.json" } } }],
    });
  });

  it("escapes newlines in GitHub annotations", () => {
    const out = renderGithub(envelope);
    expect(out.startsWith("::error file=uxloom.project.json")).toBe(true);
    expect(out).toContain("%0A");
    expect(out.split("\n")).toHaveLength(1);
  });
});
