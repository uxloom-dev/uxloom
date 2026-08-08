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

/* ----------------------- native platforms (R9) ------------------------- */

const nativeProject = parseProject({
  name: "native",
  formatVersion: "0.1",
  platforms: ["web"],
  journeys: [],
  screens: [
    { id: "Inbox", requiredStates: ["default", "loading"], designedStates: ["default", "loading"] },
    { id: "Compose", requiredStates: ["default", "empty"], designedStates: ["default", "empty"] },
    { id: "Profile", requiredStates: ["default"], designedStates: ["default"] },
    { id: "Feed", requiredStates: ["default", "error.network"], designedStates: ["default", "error.network"] },
  ],
});

function nativeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "uxloom-audit-native-"));
  for (const dir of ["ios", "android", "lib", "src"]) mkdirSync(join(root, dir), { recursive: true });
  // SwiftUI: identifier markers for both screen and states.
  writeFileSync(
    join(root, "ios", "InboxView.swift"),
    `struct InboxView: View {
  var body: some View {
    VStack {
      Text("Inbox").accessibilityIdentifier("ux-screen:Inbox")
      if isLoading {
        ProgressView().accessibilityIdentifier("ux-state:loading")
      }
      List(rows) { RowView($0) }.accessibilityIdentifier("ux-state:default")
    }
  }
}`,
  );
  // Compose: comment screen marker scoping testTag state markers.
  writeFileSync(
    join(root, "android", "ComposeScreen.kt"),
    `// data-ux-screen: Compose
@Composable
fun ComposeScreen(state: UiState) {
  when (state) {
    is UiState.Empty -> EmptyCard(Modifier.testTag("ux-state:empty"))
    else -> Editor(Modifier.testTag("ux-state:default"))
  }
}`,
  );
  // Dart: comment markers only.
  writeFileSync(
    join(root, "lib", "profile.dart"),
    `// data-ux-screen: Profile
Widget build(BuildContext context) {
  return ProfileBody(); // data-ux-state: default
}`,
  );
  // Java: single-line block-comment markers.
  writeFileSync(
    join(root, "src", "FeedActivity.java"),
    `/* data-ux-screen: Feed */
class FeedActivity {
  void render() {
    /* data-ux-state: default */
    show(list);
    if (failed) {
      /* data-ux-state: error.network */
      showError();
    }
  }
}`,
  );
  return root;
}

describe("uxloom audit — native platforms (Swift/Kotlin/Dart/Java)", () => {
  const result = runAudit(nativeProject, nativeWorkspace());
  const verdictOf = (screen: string, state: string) =>
    result.verdicts.find((v) => v.screen === screen && v.state === state)!;

  it("grants implemented from SwiftUI accessibilityIdentifier markers, with file:line", () => {
    const loading = verdictOf("Inbox", "loading");
    expect(loading.verdict).toBe("implemented");
    expect(loading.evidence).toMatch(/ios\/InboxView\.swift:6$/);
    expect(verdictOf("Inbox", "default").verdict).toBe("implemented");
  });

  it("grants implemented from Compose testTag markers", () => {
    expect(verdictOf("Compose", "empty").verdict).toBe("implemented");
    expect(verdictOf("Compose", "empty").evidence).toMatch(/android\/ComposeScreen\.kt:5$/);
    expect(verdictOf("Compose", "default").verdict).toBe("implemented");
  });

  it("scopes state markers to the screen declared by a // data-ux-screen comment", () => {
    // Compose's testTag states attach to Compose (declared only via comment),
    // never to the other screens.
    const composeEvidence = result.verdicts.filter((v) => v.evidence?.includes("ComposeScreen.kt"));
    expect(composeEvidence.map((v) => v.screen)).toEqual(["Compose", "Compose"]);
  });

  it("scans .dart sources and accepts // comment state markers", () => {
    const dart = verdictOf("Profile", "default");
    expect(dart.verdict).toBe("implemented");
    expect(dart.evidence).toMatch(/lib\/profile\.dart:3$/);
  });

  it("accepts single-line /* */ comment markers in .java sources", () => {
    expect(verdictOf("Feed", "default").verdict).toBe("implemented");
    const err = verdictOf("Feed", "error.network");
    expect(err.verdict).toBe("implemented");
    expect(err.evidence).toMatch(/src\/FeedActivity\.java:7$/);
  });

  it("fully implements the native project with no findings", () => {
    expect(result.summary.implemented).toBe(result.summary.states);
    expect(result.findings).toEqual([]);
  });
});
