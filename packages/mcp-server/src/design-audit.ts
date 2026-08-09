/**
 * RFC 0007 R28 — reverse design audit.
 *
 * Consumes a design *export* a designer produces — Figma/Penpot SVG or JSON,
 * or a uxloom `--manifest` index.json — with zero API coupling, and diffs its
 * coverage against the JourneyGraph contract: which contracted screens and
 * required states have no frame in the design.
 *
 * Identity is recovered the same way the forward export writes it (R26): the
 * manifest is authoritative; the naming grammar is the fallback for files a
 * designer exported or renamed by hand. A name that is a block-layer name is
 * never mistaken for a frame — the grammar module discriminates the two.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type { Project } from "@uxloom/journeygraph";
import { parseBlockLayerName, parseFrameName } from "./design-naming.js";

/** A screen×state frame recovered from a design export. */
export interface DesignFrame {
  screen: string;
  state: string;
  journey?: string;
  /** Where it was found: manifest entry, or a file path relative to the export root. */
  source: string;
}

export interface DesignAuditFinding {
  code: "design-screen-unmapped" | "design-state-missing" | "design-frame-unmapped";
  severity: "error" | "warning";
  screen?: string;
  state?: string;
  journey?: string;
  message: string;
  fix: string;
}

export interface DesignAuditResult {
  frames: DesignFrame[];
  findings: DesignAuditFinding[];
  /** A draft `{ screens }` fragment for frames not in the contract (R28 --scaffold). */
  scaffold: { screens: Array<{ id: string; requiredStates: string[]; designedStates: string[] }> };
  summary: {
    screens: number;
    requiredStates: number;
    framesFound: number;
    coveredStates: number;
    missingStates: number;
    unmappedScreens: number;
    unmappedFrames: number;
  };
}

/* --------------------------- name extraction --------------------------- */

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Candidate layer/frame names carried by an SVG file (titles + name attrs). */
function svgNames(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/g)) names.push(unescapeXml(m[1].trim()));
  for (const m of text.matchAll(/(?:data-name|aria-label|inkscape:label|sodipodi:label)\s*=\s*"([^"]*)"/g)) {
    names.push(unescapeXml(m[1].trim()));
  }
  return names;
}

/** Recursively collect string values under `name`/`title` keys (Figma/Penpot trees). */
function jsonNames(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) jsonNames(item, acc);
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if ((key === "name" || key === "title") && typeof v === "string") acc.push(v.trim());
      else jsonNames(v, acc);
    }
  }
  return acc;
}

/** True when the parsed JSON is a uxloom manifest (array of {screen,state}). */
function asManifest(data: unknown, source: string): DesignFrame[] | null {
  if (!Array.isArray(data)) return null;
  const frames: DesignFrame[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.screen !== "string" || typeof e.state !== "string") return null;
    frames.push({
      screen: e.screen,
      state: e.state,
      ...(typeof e.journey === "string" ? { journey: e.journey } : {}),
      source: typeof e.file === "string" ? e.file : source,
    });
  }
  return frames;
}

/** Turn candidate names into frames, skipping block-layer names (R26 discriminator). */
function framesFromNames(names: string[], source: string): DesignFrame[] {
  const frames: DesignFrame[] = [];
  for (const name of names) {
    if (!name || parseBlockLayerName(name)) continue; // a block, not a frame
    const id = parseFrameName(name);
    if (id) frames.push({ ...id, source });
  }
  return frames;
}

function framesFromFile(path: string, source: string): DesignFrame[] {
  const ext = extname(path).toLowerCase();
  const text = readFileSync(path, "utf8");
  if (ext === ".json") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }
    return asManifest(data, source) ?? framesFromNames(jsonNames(data), source);
  }
  if (ext === ".svg") return framesFromNames(svgNames(text), source);
  return [];
}

function walk(dir: string, root: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, acc);
    else if (/\.(svg|json)$/i.test(entry.name)) acc.push(full);
  }
  return acc;
}

/**
 * Parse a design export (file or directory) into frames. A manifest, if
 * present at `<dir>/index.json`, is authoritative and short-circuits parsing.
 * Frames are de-duplicated by screen×state and returned in deterministic order.
 */
export function parseDesignExport(path: string): DesignFrame[] {
  const stat = statSync(path);
  let raw: DesignFrame[] = [];
  if (stat.isDirectory()) {
    const indexPath = join(path, "index.json");
    let manifest: DesignFrame[] | null = null;
    try {
      manifest = asManifest(JSON.parse(readFileSync(indexPath, "utf8")), "index.json");
    } catch {
      manifest = null;
    }
    if (manifest) {
      raw = manifest;
    } else {
      for (const file of walk(path, path)) raw.push(...framesFromFile(file, relative(path, file)));
    }
  } else {
    raw = framesFromFile(path, path);
  }
  // De-dup by screen×state (first source wins), then sort deterministically.
  const seen = new Map<string, DesignFrame>();
  for (const f of raw) {
    const key = `${f.screen}\u0000${f.state}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()].sort((a, b) =>
    a.screen === b.screen ? a.state.localeCompare(b.state) : a.screen.localeCompare(b.screen),
  );
}

/* ------------------------------- diff --------------------------------- */

/** Diff a design's frame coverage against the contract. Pure and deterministic. */
export function auditDesign(project: Project, frames: DesignFrame[]): DesignAuditResult {
  const contractScreens = new Set(project.screens.map((s) => s.id));
  const byScreen = new Map<string, Set<string>>();
  for (const f of frames) {
    if (!byScreen.has(f.screen)) byScreen.set(f.screen, new Set());
    byScreen.get(f.screen)!.add(f.state);
  }

  const findings: DesignAuditFinding[] = [];
  let requiredStates = 0;
  let coveredStates = 0;
  let unmappedScreens = 0;

  for (const screen of project.screens) {
    const designStates = byScreen.get(screen.id);
    requiredStates += screen.requiredStates.length;
    if (!designStates) {
      unmappedScreens++;
      findings.push({
        code: "design-screen-unmapped",
        severity: "error",
        screen: screen.id,
        message: `Screen "${screen.id}" has no frame in the design — the contract requires ${screen.requiredStates.length} state(s), the design draws none.`,
        fix: `Add a frame named "${screen.id} / default" (and one per required state) in Figma/Penpot, or export with names following "<Screen> / <state>".`,
      });
      continue;
    }
    for (const state of screen.requiredStates) {
      if (designStates.has(state)) {
        coveredStates++;
      } else {
        findings.push({
          code: "design-state-missing",
          severity: "error",
          screen: screen.id,
          state,
          message: `Screen "${screen.id}" is in the design but its required "${state}" state has no frame.`,
          fix: `Draw the "${state}" state and name the frame "${screen.id} / ${state}".`,
        });
      }
    }
  }

  // Frames the design has that the contract does not — scaffold candidates.
  const unmapped = new Map<string, string[]>();
  for (const [screen, states] of byScreen) {
    if (contractScreens.has(screen)) continue;
    unmapped.set(screen, [...states].sort());
  }
  for (const screen of [...unmapped.keys()].sort()) {
    findings.push({
      code: "design-frame-unmapped",
      severity: "warning",
      screen,
      message: `The design has a "${screen}" frame with no matching screen in the contract (state(s): ${unmapped.get(screen)!.join(", ")}).`,
      fix: `Register it (screen_register / --scaffold) if it belongs in the contract, or rename the frame if it's a mislabel.`,
    });
  }

  findings.sort((a, b) =>
    codeRank(a.code) - codeRank(b.code) ||
    (a.screen ?? "").localeCompare(b.screen ?? "") ||
    (a.state ?? "").localeCompare(b.state ?? ""),
  );

  const scaffold = {
    screens: [...unmapped.keys()].sort().map((id) => ({
      id,
      requiredStates: unmapped.get(id)!,
      designedStates: unmapped.get(id)!,
    })),
  };

  return {
    frames,
    findings,
    scaffold,
    summary: {
      screens: project.screens.length,
      requiredStates,
      framesFound: frames.length,
      coveredStates,
      missingStates: requiredStates - coveredStates,
      unmappedScreens,
      unmappedFrames: unmapped.size,
    },
  };
}

function codeRank(code: DesignAuditFinding["code"]): number {
  return code === "design-screen-unmapped" ? 0 : code === "design-state-missing" ? 1 : 2;
}
