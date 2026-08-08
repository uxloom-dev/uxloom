import { describe, expect, it } from "vitest";
import { analyzeMarkerQuality } from "uxloom/dist/audit-tier3.js";
import type { MarkerQualityFinding } from "uxloom/dist/audit-tier3.js";

/** Analyze a single fixture file. */
const analyze = (text: string) => analyzeMarkerQuality([{ path: "app/page.tsx", text }]);
const analyzeAt = (path: string, text: string) => analyzeMarkerQuality([{ path, text }]);
const ofCode = (findings: MarkerQualityFinding[], code: MarkerQualityFinding["code"]) =>
  findings.filter((f) => f.code === code);

describe("state-marker-thin", () => {
  it("flags a bare self-closing marker, with 1-based line and screen from the file", () => {
    const findings = analyze(`export function Inbox() {
  return (
    <main data-ux-screen="Inbox">
      {isLoading && <div data-ux-state="loading" />}
    </main>
  );
}`);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "state-marker-thin",
      severity: "warning",
      screen: "Inbox",
      state: "loading",
      file: "app/page.tsx",
      line: 4,
    });
    expect(findings[0].message).toContain('data-ux-state="loading"');
    expect(findings[0].fix).toContain("actually renders");
  });

  it("flags a bare element whose body is whitespace-only", () => {
    const findings = analyze(`{ok ? null : <section data-ux-state="empty">
</section>}`);
    expect(ofCode(findings, "state-marker-thin")).toHaveLength(1);
    expect(findings[0].line).toBe(1);
  });

  it("does NOT flag a marker with className and children", () => {
    const findings = analyze(
      `{isLoading && <div className="skeleton" data-ux-state="loading">Loading rows…</div>}`,
    );
    expect(findings).toEqual([]);
  });

  it("does NOT flag a self-closing element that carries other props", () => {
    const findings = analyze(`{isLoading && <Skeleton rows={3} data-ux-state="loading" />}`);
    expect(ofCode(findings, "state-marker-thin")).toEqual([]);
  });
});

describe("state-marker-duplicate", () => {
  it("flags one element carrying two data-ux-state attributes, each state once", () => {
    const findings = analyze(`{busy && <div data-ux-state="loading" data-ux-state="empty" />}`);
    const dups = ofCode(findings, "state-marker-duplicate");
    expect(dups.map((f) => f.state).sort()).toEqual(["empty", "loading"]);
    expect(dups[0].message).toContain("cannot render two distinct states");
  });

  it("flags two states on textually identical bare elements in the same file", () => {
    const findings = analyze(`{a && <Panel data-ux-state="loading" />}
{b && <Panel data-ux-state="empty" />}`);
    const dups = ofCode(findings, "state-marker-duplicate");
    expect(dups.map((f) => f.state).sort()).toEqual(["empty", "loading"]);
  });

  it("does NOT flag bare elements with different tags, or identical elements across files", () => {
    const sameFile = analyze(`{a && <Skeleton data-ux-state="loading" />}
{b && <EmptyCard data-ux-state="empty" />}`);
    expect(ofCode(sameFile, "state-marker-duplicate")).toEqual([]);

    const acrossFiles = analyzeMarkerQuality([
      { path: "a.tsx", text: `{a && <Panel data-ux-state="loading" />}` },
      { path: "b.tsx", text: `{b && <Panel data-ux-state="empty" />}` },
    ]);
    expect(ofCode(acrossFiles, "state-marker-duplicate")).toEqual([]);
  });
});

describe("state-marker-static", () => {
  it("flags a loading marker rendered unconditionally in JSX", () => {
    const findings = analyze(`export function Page() {
  return (
    <main>
      <section className="spin" data-ux-state="loading">Loading…</section>
    </main>
  );
}`);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: "state-marker-static", state: "loading", line: 4 });
    expect(findings[0].message).toContain("data-ux-state=\"loading\"");
    expect(findings[0].fix).toContain("condition");
  });

  it("flags an unconditional error.* state (prefix match)", () => {
    const findings = analyze(`export function Page() {
  return (
    <main>
      <div className="err" data-ux-state="error.network">Something broke</div>
    </main>
  );
}`);
    expect(ofCode(findings, "state-marker-static").map((f) => f.state)).toEqual(["error.network"]);
  });

  it("does NOT flag a loading marker gated by &&", () => {
    const findings = analyze(
      `{isLoading && <Spinner className="s" data-ux-state="loading">Loading…</Spinner>}`,
    );
    expect(findings).toEqual([]);
  });

  it("does NOT flag an error marker inside a ternary", () => {
    const findings = analyze(`{error ? (
  <ErrorPanel className="e" data-ux-state="error.network">Retry</ErrorPanel>
) : null}`);
    expect(findings).toEqual([]);
  });

  it("does NOT flag a marker inside a component named after the state", () => {
    const findings = analyze(`export function LoadingSkeleton() {
  return (
    <div className="skeleton" data-ux-state="loading">
      <Bar /><Bar />
    </div>
  );
}`);
    expect(findings).toEqual([]);
  });

  it("never checks 'default' or custom states for staticness", () => {
    const findings = analyze(`export function Feed() {
  return (
    <main data-ux-screen="Feed">
      <List className="l" data-ux-state="default">rows</List>
      <Notice className="n" data-ux-state="parked">Parked</Notice>
    </main>
  );
}`);
    expect(findings).toEqual([]);
  });
});

describe("conservatism and edges", () => {
  it("returns nothing for empty input and files without markers", () => {
    expect(analyzeMarkerQuality([])).toEqual([]);
    expect(analyze("")).toEqual([]);
    expect(analyze(`export const x = 1; // no markers here`)).toEqual([]);
  });

  it("stays silent when the containing tag cannot be resolved safely", () => {
    // '>' inside the title attribute defeats simple backward scanning —
    // the heuristic must bail rather than guess.
    const findings = analyze(`{show && <div title="a > b" data-ux-state="empty" />}`);
    expect(findings).toEqual([]);
  });

  it("omits screen when the file declares several screens", () => {
    const findings = analyze(`<main data-ux-screen="A">
  <div data-ux-screen="B">
    {x && <div data-ux-state="loading" />}
  </div>
</main>`);
    expect(ofCode(findings, "state-marker-thin")).toHaveLength(1);
    expect(findings[0].screen).toBeUndefined();
  });

  it("sorts findings by file then line for deterministic output", () => {
    const findings = analyzeMarkerQuality([
      {
        path: "b.tsx",
        text: `{x && <div data-ux-state="loading" />}`,
      },
      {
        path: "a.tsx",
        text: `<main>
  <div/>
  {x && <div data-ux-state="empty" />}
</main>`,
      },
    ]);
    expect(findings.map((f) => `${f.file}:${f.line}`)).toEqual(["a.tsx:3", "b.tsx:1"]);
  });
});

describe("native marker forms (comment / identifier)", () => {
  it("never flags a comment marker as thin — comments cannot prove emptiness", () => {
    const findings = analyzeAt(
      "android/Detail.kt",
      `// data-ux-screen: Detail
if (items.isEmpty()) {
  // data-ux-state: empty
  EmptyCard()
}`,
    );
    expect(findings).toEqual([]);
  });

  it("never flags identifier markers as duplicate-bare, even on identical call shapes", () => {
    const findings = analyzeAt(
      "ios/Panel.swift",
      `if a {
  Panel().accessibilityIdentifier("ux-state:loading")
}
if b {
  Panel().accessibilityIdentifier("ux-state:empty")
}`,
    );
    expect(ofCode(findings, "state-marker-duplicate")).toEqual([]);
    expect(ofCode(findings, "state-marker-thin")).toEqual([]);
  });

  it("does NOT flag a comment marker as static when Swift `if ` is nearby", () => {
    const findings = analyzeAt(
      "ios/Inbox.swift",
      `var body: some View {
  if isLoading {
    // data-ux-state: loading
    ProgressView()
  }
}`,
    );
    expect(findings).toEqual([]);
  });

  it("flags an unconditional loading comment marker in .swift as static", () => {
    const findings = analyzeAt(
      "ios/Splash.swift",
      `struct SplashView: View {
  var body: some View {
    // data-ux-state: loading
    ProgressView()
  }
}`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "state-marker-static",
      state: "loading",
      file: "ios/Splash.swift",
      line: 3,
    });
    expect(findings[0].message).toContain("data-ux-state: loading");
  });

  it("flags an unconditional loading identifier marker as static", () => {
    const findings = analyzeAt(
      "ios/Root.swift",
      `struct RootView: View {
  var body: some View {
    ProgressView().accessibilityIdentifier("ux-state:loading")
  }
}`,
    );
    expect(ofCode(findings, "state-marker-static")).toHaveLength(1);
    expect(findings[0].message).toContain("ux-state:loading");
  });

  it("suppresses static inside `struct LoadingView`", () => {
    const findings = analyzeAt(
      "ios/Loading.swift",
      `struct LoadingView: View {
  var body: some View {
    // data-ux-state: loading
    ProgressView()
  }
}`,
    );
    expect(findings).toEqual([]);
  });

  it("suppresses static inside `fun EmptyState(`", () => {
    const findings = analyzeAt(
      "android/Empty.kt",
      `@Composable
fun EmptyState(modifier: Modifier) {
  Card(modifier.testTag("ux-state:empty"))
}`,
    );
    expect(findings).toEqual([]);
  });

  it("treats Kotlin `when (` as a conditional signal", () => {
    const findings = analyzeAt(
      "android/Feed.kt",
      `@Composable
fun Feed(state: UiState) {
  when (state) {
    UiState.Loading -> Spinner(Modifier.testTag("ux-state:loading"))
  }
}`,
    );
    expect(findings).toEqual([]);
  });

  it("treats Kotlin `.let` as a conditional signal", () => {
    const findings = analyzeAt(
      "android/Banner.kt",
      `fun render(err: Failure) {
  err.let {
    // data-ux-state: error.network
    ErrorCard(it)
  }
}`,
    );
    expect(findings).toEqual([]);
  });

  it("resolves the screen for a static warning from a .dart comment marker", () => {
    const findings = analyzeAt(
      "lib/home.dart",
      `// data-ux-screen: Home
Widget build() {
  return Spinner(); // data-ux-state: loading
}`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "state-marker-static",
      screen: "Home",
      state: "loading",
      file: "lib/home.dart",
      line: 3,
    });
  });
});
