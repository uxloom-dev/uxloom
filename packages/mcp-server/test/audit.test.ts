import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProject } from "@uxloom/journeygraph";
import { runAudit } from "uxloom/dist/audit.js";

const project = parseProject({
  name: "t",
  formatVersion: "0.1",
  platforms: ["web"],
  journeys: [],
  screens: [
    { id: "Inbox", requiredStates: ["default", "empty", "loading"], designedStates: ["default", "empty", "loading"] },
    { id: "Settings", requiredStates: ["default", "loading"], designedStates: ["default", "loading"] },
    { id: "Ghost", requiredStates: ["default"], designedStates: ["default"] },
  ],
});

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "uxloom-audit-"));
  mkdirSync(join(root, "app", "inbox"), { recursive: true });
  mkdirSync(join(root, "app", "settings"), { recursive: true });
  // Inbox: full marker adoption, but "loading" marker missing.
  writeFileSync(
    join(root, "app", "inbox", "page.tsx"),
    `export default function Inbox() {
      return <main data-ux-screen="Inbox">
        <List data-ux-state="default" />
        <Empty data-ux-state="empty" />
      </main>;
    }`,
  );
  // Settings: mapped by registry, no markers at all.
  writeFileSync(join(root, "app", "settings", "page.tsx"), `export default function Settings() { return <form/>; }`);
  return root;
}

const map = { Settings: { paths: ["app/settings/**"] } };

describe("uxloom audit (tiers 1-2)", () => {
  const result = runAudit(project, workspace(), map);

  it("grants implemented only with marker evidence, with file:line", () => {
    const impl = result.verdicts.filter((v) => v.verdict === "implemented");
    expect(impl.map((v) => `${v.screen}:${v.state}`).sort()).toEqual(["Inbox:default", "Inbox:empty"]);
    expect(impl[0].evidence).toMatch(/app\/inbox\/page\.tsx:\d+/);
  });

  it("flags a missing state as unimplemented when the screen uses markers", () => {
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "state-unimplemented", screen: "Inbox", state: "loading", severity: "error" }),
    );
  });

  it("marks registry-mapped-but-unmarked screens as unproven (never implemented)", () => {
    const settings = result.verdicts.filter((v) => v.screen === "Settings");
    expect(settings.every((v) => v.verdict === "unproven")).toBe(true);
    expect(result.findings.filter((f) => f.code === "state-unproven" && f.screen === "Settings")).toHaveLength(2);
  });

  it("errors on screens with no implementation at all", () => {
    expect(result.summary.unmappedScreens).toEqual(["Ghost"]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "screen-unmapped", screen: "Ghost", severity: "error" }),
    );
  });

  it("summarizes counts consistently", () => {
    const s = result.summary;
    expect(s.implemented + s.unimplemented + s.unproven).toBe(s.states);
    expect(s.states).toBe(6);
  });
});
