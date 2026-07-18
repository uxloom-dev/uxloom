/**
 * `uxloom audit` — design-vs-implementation drift detection (RFC 0001).
 *
 * Tier ladder as a list of evidence-collecting strategies (lightweight
 * Strategy pattern: plain functions, one shared Evidence type). Verdicts
 * are computed afterward by a pure reducer, so adding tier 3 (AST) or
 * tier 4 (fixture rendering) later means appending a function — no
 * changes to existing tiers or the reducer's contract.
 *
 * Tier 1 — registry: uxloom.map.json maps screen ids to path globs.
 * Tier 2 — markers: data-ux-screen / data-ux-state attributes in source.
 *
 * Verdict policy (deterministic, honesty-first):
 *  - screen with no mapped/marked files            → error   screen-unmapped
 *  - marker found for a contracted state            → implemented (file:line)
 *  - screen uses markers, contracted state absent   → error   state-unimplemented
 *  - screen has files but no markers at all         → warning state-unproven
 *    (static evidence without markers never proves implementation)
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Project, Screen } from "@uxloom/journeygraph";

export interface Evidence {
  tier: 1 | 2;
  kind: "registry-map" | "marker-screen" | "marker-state";
  screen: string;
  state?: string;
  file: string;
  line?: number;
}

export interface StateVerdict {
  screen: string;
  state: string;
  verdict: "implemented" | "unimplemented" | "unproven";
  evidence?: string;
}

export interface AuditFinding {
  code: "screen-unmapped" | "state-unimplemented" | "state-unproven";
  severity: "error" | "warning";
  screen: string;
  state?: string;
  message: string;
  fix: string;
}

export interface AuditResult {
  verdicts: StateVerdict[];
  findings: AuditFinding[];
  summary: {
    screens: number;
    states: number;
    implemented: number;
    unimplemented: number;
    unproven: number;
    unmappedScreens: string[];
    markerAdoption: number; // screens with >=1 state marker / mapped screens
  };
}

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|html|astro|mdx)$/;
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", ".turbo"]);
const MAX_FILE_BYTES = 512 * 1024;

/** Minimal glob -> RegExp: supports **, *, and literal path segments. */
export function globToRegExp(glob: string): RegExp {
  const DEEP = "\u0000"; // placeholder so * replacement cannot touch **
  const pattern = glob
    .replace(/\*\*\//g, `${DEEP}/`)
    .replace(/\*\*/g, DEEP)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(new RegExp(`${DEEP}/`, "g"), "(?:.*/)?")
    .replace(new RegExp(DEEP, "g"), ".*");
  return new RegExp(`^${pattern}$`);
}

function walk(dir: string, root: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, root, acc);
    else if (SOURCE_EXT.test(entry) && stat.size <= MAX_FILE_BYTES) acc.push(relative(root, full));
  }
  return acc;
}

interface AuditContext {
  project: Project;
  root: string;
  files: string[];
  map: Record<string, { paths: string[] }>;
  contents: Map<string, string>;
}

const read = (ctx: AuditContext, file: string): string => {
  if (!ctx.contents.has(file)) ctx.contents.set(file, readFileSync(join(ctx.root, file), "utf8"));
  return ctx.contents.get(file)!;
};

/* ------------------------------ tiers ---------------------------------- */

/** Tier 1: the checked-in registry maps screens to files. */
function tierRegistry(ctx: AuditContext): Evidence[] {
  const evidence: Evidence[] = [];
  for (const screen of ctx.project.screens) {
    const globs = ctx.map[screen.id]?.paths ?? [];
    const regexes = globs.map(globToRegExp);
    for (const file of ctx.files) {
      if (regexes.some((r) => r.test(file))) {
        evidence.push({ tier: 1, kind: "registry-map", screen: screen.id, file });
      }
    }
  }
  return evidence;
}

/** Tier 2: data-ux-screen / data-ux-state markers in source files. */
function tierMarkers(ctx: AuditContext): Evidence[] {
  const evidence: Evidence[] = [];
  const screenIds = new Set(ctx.project.screens.map((s) => s.id));
  const marker = /data-ux-(screen|state)\s*=\s*[{"'\s]*["']([\w.\-]+)["']/g;

  for (const file of ctx.files) {
    const text = read(ctx, file);
    if (!text.includes("data-ux-")) continue;
    // Track the screens this file declares, to scope its state markers.
    const fileScreens = new Set<string>();
    const stateHits: Array<{ state: string; line: number }> = [];
    for (const line of text.split("\n").entries()) {
      const [lineNo, content] = line;
      for (const m of content.matchAll(marker)) {
        if (m[1] === "screen" && screenIds.has(m[2])) {
          fileScreens.add(m[2]);
          evidence.push({ tier: 2, kind: "marker-screen", screen: m[2], file, line: lineNo + 1 });
        } else if (m[1] === "state") {
          stateHits.push({ state: m[2], line: lineNo + 1 });
        }
      }
    }
    // State markers attach to the file's declared screens, or — when the
    // file declares none — to every screen the registry maps it to.
    const owners = fileScreens.size
      ? [...fileScreens]
      : ctx.project.screens
          .filter((s) => (ctx.map[s.id]?.paths ?? []).map(globToRegExp).some((r) => r.test(file)))
          .map((s) => s.id);
    for (const owner of owners) {
      for (const hit of stateHits) {
        evidence.push({ tier: 2, kind: "marker-state", screen: owner, state: hit.state, file, line: hit.line });
      }
    }
  }
  return evidence;
}

const TIERS: Array<(ctx: AuditContext) => Evidence[]> = [tierRegistry, tierMarkers];

/* ----------------------------- reducer ---------------------------------- */

function screenStates(screen: Screen): string[] {
  return screen.requiredStates;
}

export function runAudit(
  project: Project,
  root: string,
  map: Record<string, { paths: string[] }> = {},
): AuditResult {
  const ctx: AuditContext = {
    project,
    root: resolve(root),
    files: walk(resolve(root), resolve(root)),
    map,
    contents: new Map(),
  };
  const evidence = TIERS.flatMap((tier) => tier(ctx));

  const verdicts: StateVerdict[] = [];
  const findings: AuditFinding[] = [];
  const unmappedScreens: string[] = [];
  let markerScreens = 0;

  for (const screen of project.screens) {
    const screenEvidence = evidence.filter((e) => e.screen === screen.id);
    const hasFiles = screenEvidence.length > 0;
    const stateMarkers = screenEvidence.filter((e) => e.kind === "marker-state");
    const usesMarkers = stateMarkers.length > 0;
    if (usesMarkers) markerScreens++;

    if (!hasFiles) {
      unmappedScreens.push(screen.id);
      findings.push({
        code: "screen-unmapped",
        severity: "error",
        screen: screen.id,
        message: `Screen "${screen.id}" has no implementation files — not in uxloom.map.json and no data-ux-screen marker found.`,
        fix: `Map it (uxloom.map.json: { "${screen.id}": { "paths": ["app/route/**"] } }) or add data-ux-screen="${screen.id}" to its component — or remove it from the contract if it was cut.`,
      });
      for (const state of screenStates(screen)) {
        verdicts.push({ screen: screen.id, state, verdict: "unimplemented" });
      }
      continue;
    }

    for (const state of screenStates(screen)) {
      const proof = stateMarkers.find((e) => e.state === state);
      if (proof) {
        verdicts.push({
          screen: screen.id,
          state,
          verdict: "implemented",
          evidence: `${proof.file}:${proof.line}`,
        });
      } else if (usesMarkers) {
        verdicts.push({ screen: screen.id, state, verdict: "unimplemented" });
        findings.push({
          code: "state-unimplemented",
          severity: "error",
          screen: screen.id,
          state,
          message: `Screen "${screen.id}" marks its states but has no data-ux-state="${state}" — the contracted state is not implemented (or not marked where it renders).`,
          fix: `Implement the "${state}" render path and mark it: data-ux-state="${state}".`,
        });
      } else {
        verdicts.push({ screen: screen.id, state, verdict: "unproven" });
        findings.push({
          code: "state-unproven",
          severity: "warning",
          screen: screen.id,
          state,
          message: `Screen "${screen.id}" has implementation files but no state markers — "${state}" cannot be verified statically.`,
          fix: `Adopt the marker convention: add data-ux-state="${state}" where each contracted state renders. Static analysis never grants "implemented" without it.`,
        });
      }
    }
  }

  const counts = { implemented: 0, unimplemented: 0, unproven: 0 };
  for (const v of verdicts) counts[v.verdict]++;

  return {
    verdicts,
    findings,
    summary: {
      screens: project.screens.length,
      states: verdicts.length,
      ...counts,
      unmappedScreens,
      markerAdoption: project.screens.length
        ? Math.round((100 * markerScreens) / project.screens.length) / 100
        : 0,
    },
  };
}

/** Load the optional registry file. */
export function loadMap(path: string): Record<string, { paths: string[] }> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}
