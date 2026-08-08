/**
 * Workspace loading (RFC 0003 R1/R3/R7): the merged view of a design.
 *
 *   uxloom.project.json      base file (MCP tools write here)
 *   include: ["designs/*"]   fragment globs merged at load (teams split files)
 *   uxloom.config.json       thresholds (optional)
 *   uxloom.baseline.json     acknowledged debt (optional)
 *   <project>.comments.json  reviewer comments from the preview (optional)
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  FragmentSchema,
  parseProject,
  type Finding,
  type Project,
} from "@uxloom/journeygraph";
import type { CriticOptions } from "@uxloom/critics";
import { globToRegExp } from "./audit.js";

export interface ReviewerComment {
  id: string;
  screen: string;
  state: string;
  x: number;
  y: number;
  text: string;
  resolved: boolean;
  createdAt: string;
}

export interface UxloomConfig {
  thresholds?: CriticOptions;
  /** "required" forces rationale enforcement before any rationale exists. */
  rationale?: "required";
}

/** Critic options derived from config (rationale mode folded in). */
export function criticOptionsFor(config: UxloomConfig): CriticOptions {
  return { ...config.thresholds, requireRationale: config.rationale === "required" };
}

export interface ReviewRound {
  round: number;
  at: string;
  errors: number;
  warnings: number;
  rationale: { documented: number; total: number };
  notes?: string;
}

export function reviewsPathFor(projectPath: string): string {
  return projectPath.replace(/\.json$/, "") + ".reviews.json";
}

export function loadReviews(path: string): ReviewRound[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { rounds?: ReviewRound[] };
    return Array.isArray(parsed.rounds) ? parsed.rounds : [];
  } catch {
    return [];
  }
}

export function saveReviews(path: string, rounds: ReviewRound[]): void {
  writeFileSync(path, JSON.stringify({ rounds }, null, 2) + "\n");
}

export interface Baseline {
  check: string[];
  audit: string[];
}

export interface Workspace {
  projectPath: string;
  dir: string;
  project: Project;
  /** Findings produced by loading itself (duplicate ids across fragments). */
  loadFindings: Finding[];
  config: UxloomConfig;
  baseline: Baseline;
  baselinePath: string;
  comments: ReviewerComment[];
  commentsPath: string;
  /** Fragment files that contributed to the merge (for reporting). */
  fragments: string[];
}

export function commentsPathFor(projectPath: string): string {
  return projectPath.replace(/\.json$/, "") + ".comments.json";
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function walkDir(dir: string, acc: string[] = [], root = dir): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkDir(full, acc, root);
    else if (entry.endsWith(".json")) acc.push(relative(root, full));
  }
  return acc;
}

export function loadWorkspace(projectPathArg: string): Workspace {
  const projectPath = resolve(projectPathArg);
  const dir = dirname(projectPath);
  const raw = readJson(projectPath) as Project;
  const loadFindings: Finding[] = [];
  const fragments: string[] = [];

  // Merge fragments; base always wins load order, duplicate ids are errors.
  if (raw.include?.length) {
    const candidates = walkDir(dir);
    const regexes = raw.include.map(globToRegExp);
    const matched = candidates.filter(
      (f) => regexes.some((r) => r.test(f)) && resolve(dir, f) !== projectPath,
    ).sort();
    const journeyIds = new Set(raw.journeys.map((j) => j.id));
    const screenIds = new Set(raw.screens.map((s) => s.id));
    for (const file of matched) {
      const fragment = FragmentSchema.parse(readJson(join(dir, file)));
      fragments.push(file);
      for (const journey of fragment.journeys ?? []) {
        if (journeyIds.has(journey.id)) {
          loadFindings.push({
            critic: "workspace",
            code: "duplicate-id",
            severity: "error",
            journey: journey.id,
            message: `Journey "${journey.id}" is defined in both the base project and fragment ${file}.`,
            fix: `Keep exactly one definition; fragments must not shadow the base file.`,
          });
        } else {
          journeyIds.add(journey.id);
          raw.journeys.push(journey as Project["journeys"][number]);
        }
      }
      for (const screen of fragment.screens ?? []) {
        if (screenIds.has(screen.id)) {
          loadFindings.push({
            critic: "workspace",
            code: "duplicate-id",
            severity: "error",
            screen: screen.id,
            message: `Screen "${screen.id}" is defined in both the base project and fragment ${file}.`,
            fix: `Keep exactly one definition; fragments must not shadow the base file.`,
          });
        } else {
          screenIds.add(screen.id);
          raw.screens.push(screen as Project["screens"][number]);
        }
      }
    }
  }
  const project = parseProject(raw);

  const configPath = join(dir, "uxloom.config.json");
  const config: UxloomConfig = existsSync(configPath)
    ? (readJson(configPath) as UxloomConfig)
    : {};

  const baselinePath = join(dir, "uxloom.baseline.json");
  const baseline: Baseline = existsSync(baselinePath)
    ? { check: [], audit: [], ...(readJson(baselinePath) as Partial<Baseline>) }
    : { check: [], audit: [] };

  const commentsPath = commentsPathFor(projectPath);
  const comments: ReviewerComment[] = existsSync(commentsPath)
    ? ((readJson(commentsPath) as { comments?: ReviewerComment[] }).comments ?? [])
    : [];

  return { projectPath, dir, project, loadFindings, config, baseline, baselinePath, comments, commentsPath, fragments };
}

/** Stable fingerprint of a finding for baselining. */
export function fingerprint(f: {
  code?: string;
  critic?: string;
  journey?: string;
  screen?: string;
  state?: string;
  component?: string;
}): string {
  const key = [f.code ?? f.critic, f.journey, f.screen, f.state, f.component]
    .map((x) => x ?? "")
    .join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** Split findings into fresh vs baselined. */
export function applyBaseline<T extends Parameters<typeof fingerprint>[0]>(
  findings: T[],
  baselined: string[],
): { fresh: T[]; suppressed: number } {
  const set = new Set(baselined);
  const fresh = findings.filter((f) => !set.has(fingerprint(f)));
  return { fresh, suppressed: findings.length - fresh.length };
}

export function saveBaseline(path: string, baseline: Baseline): void {
  writeFileSync(path, JSON.stringify(baseline, null, 2) + "\n");
}

/** Open reviewer comments become findings in the same loop agents iterate on. */
export function commentFindings(comments: ReviewerComment[]): Finding[] {
  return comments
    .filter((c) => !c.resolved)
    .map((c) => ({
      critic: "reviewer",
      code: "reviewer-comment",
      severity: "warning" as const,
      screen: c.screen,
      state: c.state,
      message: `Reviewer comment on ${c.screen}#${c.state}: "${c.text}"`,
      fix: `Address the feedback, then resolve the comment in the preview (or via ${"uxloom"} preview).`,
    }));
}
