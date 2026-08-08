import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  parseProject,
  resolveTransition,
  type Journey,
  type Project,
  type Screen,
  type ScreenComponent,
  type Tokens,
  type Transition,
} from "@uxloom/journeygraph";

/**
 * `uxloom diff` — semantic design diffs (RFC 0004 R8).
 *
 * Compares two project files as designs, not as JSON: journeys/screens/
 * states added or removed, transition changes (guards, roles), contract
 * vs designed deltas, exemptions, tokens, components, layout. A
 * thousand-line JSON diff becomes ten meaningful lines.
 */

export interface DesignDiff {
  changes: DiffChange[];
  summary: { added: number; removed: number; changed: number };
}

export interface DiffChange {
  kind:
    | "journey-added" | "journey-removed"
    | "screen-added" | "screen-removed"
    | "state-added" | "state-removed"
    | "contract-state-added" | "contract-state-removed"
    | "designed-state-added" | "designed-state-removed"
    | "transition-added" | "transition-removed" | "transition-changed"
    | "exemption-added" | "exemption-removed"
    | "tokens-changed"
    | "component-added" | "component-removed" | "component-changed"
    | "layout-changed"
    | "platforms-changed";
  journey?: string;
  screen?: string;
  state?: string;
  event?: string;
  /** One human sentence, e.g. 'transition PAY on payment: target "confirm" → "review"'. */
  detail: string;
}

// ── comparison helpers ──────────────────────────────────────────────

/** Deterministic stringify (sorted keys) for structural equality. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function sortedUnion(a: Iterable<string>, b: Iterable<string>): string[] {
  return [...new Set([...a, ...b])].sort();
}

function fmt(v: unknown): string {
  return typeof v === "string" ? `"${v}"` : String(v);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ── transitions ─────────────────────────────────────────────────────

function rolesKey(roles?: string[]): string {
  return roles && roles.length ? [...roles].sort().join(",") : "";
}

function describeTransition(t: Transition): string {
  let s = `"${t.target}"`;
  if (t.guard) s += ` when ${t.guard}`;
  if (t.roles?.length) s += ` for roles [${t.roles.join(", ")}]`;
  return s;
}

function transitionChangeParts(before: Transition, after: Transition): string[] {
  const parts: string[] = [];
  if (before.target !== after.target) parts.push(`target "${before.target}" → "${after.target}"`);
  if ((before.guard ?? "") !== (after.guard ?? "")) {
    if (!before.guard) parts.push(`guard added "${after.guard}"`);
    else if (!after.guard) parts.push(`guard removed (was "${before.guard}")`);
    else parts.push(`guard "${before.guard}" → "${after.guard}"`);
  }
  if (rolesKey(before.roles) !== rolesKey(after.roles)) {
    if (!before.roles?.length) parts.push(`roles added [${after.roles!.join(", ")}]`);
    else if (!after.roles?.length) parts.push(`roles removed (was [${before.roles.join(", ")}])`);
    else parts.push(`roles [${before.roles.join(", ")}] → [${after.roles.join(", ")}]`);
  }
  return parts;
}

// ── journeys ────────────────────────────────────────────────────────

function diffPlatforms(
  before: string[] | undefined,
  after: string[] | undefined,
  loc: Pick<DiffChange, "journey" | "screen">,
  changes: DiffChange[],
): void {
  const show = (p?: string[]) => (p ? p.join(", ") : "(all)");
  if ((before ? [...before].sort().join(",") : "") === (after ? [...after].sort().join(",") : "")) return;
  changes.push({ kind: "platforms-changed", ...loc, detail: `platforms ${show(before)} → ${show(after)}` });
}

function diffJourney(before: Journey, after: Journey, changes: DiffChange[]): void {
  const journey = before.id;
  diffPlatforms(before.platforms, after.platforms, { journey }, changes);

  for (const name of sortedUnion(Object.keys(before.states), Object.keys(after.states))) {
    const o = before.states[name];
    const n = after.states[name];
    if (!o) {
      changes.push({ kind: "state-added", journey, state: name, detail: `state "${name}" added (screen "${n!.screen}")` });
      continue;
    }
    if (!n) {
      changes.push({ kind: "state-removed", journey, state: name, detail: `state "${name}" removed (screen "${o.screen}")` });
      continue;
    }
    if (o.screen !== n.screen) {
      // The state was redefined onto another screen: report as replace.
      changes.push({ kind: "state-removed", journey, state: name, detail: `state "${name}" removed (screen "${o.screen}")` });
      changes.push({ kind: "state-added", journey, state: name, detail: `state "${name}" added (screen "${n.screen}")` });
      continue;
    }
    for (const event of sortedUnion(Object.keys(o.on ?? {}), Object.keys(n.on ?? {}))) {
      const ot = o.on?.[event] === undefined ? undefined : resolveTransition(o.on[event]);
      const nt = n.on?.[event] === undefined ? undefined : resolveTransition(n.on[event]);
      if (!ot && nt) {
        changes.push({
          kind: "transition-added", journey, state: name, event,
          detail: `transition ${event} on ${name} added → ${describeTransition(nt)}`,
        });
      } else if (ot && !nt) {
        changes.push({
          kind: "transition-removed", journey, state: name, event,
          detail: `transition ${event} on ${name} removed (was → ${describeTransition(ot)})`,
        });
      } else if (ot && nt) {
        const parts = transitionChangeParts(ot, nt);
        if (parts.length) {
          changes.push({
            kind: "transition-changed", journey, state: name, event,
            detail: `transition ${event} on ${name}: ${parts.join(", ")}`,
          });
        }
      }
    }
  }
}

// ── screens ─────────────────────────────────────────────────────────

/** Key components by id when present, else by semantic + occurrence. */
function componentEntries(components: ScreenComponent[] = []): Map<string, ScreenComponent> {
  const map = new Map<string, ScreenComponent>();
  const seen = new Map<string, number>();
  for (const comp of components) {
    let key = comp.id;
    if (!key) {
      const n = (seen.get(comp.semantic) ?? 0) + 1;
      seen.set(comp.semantic, n);
      key = n === 1 ? comp.semantic : `${comp.semantic}#${n}`;
    }
    map.set(key, comp);
  }
  return map;
}

function componentChangeParts(before: ScreenComponent, after: ScreenComponent): string[] {
  const parts: string[] = [];
  if (before.semantic !== after.semantic) parts.push(`semantic "${before.semantic}" → "${after.semantic}"`);
  const ol = before.label;
  const nl = after.label;
  if (stable(ol) !== stable(nl)) {
    if (!ol) parts.push(`label added "${nl!.en}"`);
    else if (!nl) parts.push(`label removed (was "${ol.en}")`);
    else {
      if (ol.en !== nl.en) parts.push(`label "${ol.en}" → "${nl.en}"`);
      if (ol.key !== nl.key) parts.push(`label key "${ol.key}" → "${nl.key}"`);
      if (ol.maxChars !== nl.maxChars) parts.push(`label budget ${ol.maxChars ?? "(none)"} → ${nl.maxChars ?? "(none)"}`);
    }
  }
  for (const field of ["fg", "bg", "minTargetPx", "interactive"] as const) {
    const ov = before[field];
    const nv = after[field];
    if (ov !== nv) parts.push(`${field} ${ov === undefined ? "(unset)" : fmt(ov)} → ${nv === undefined ? "(unset)" : fmt(nv)}`);
  }
  return parts;
}

function diffLayout(
  before: Screen["layout"],
  after: Screen["layout"],
  screen: string,
  changes: DiffChange[],
): void {
  const ob = before?.blocks ?? [];
  const nb = after?.blocks ?? [];
  if (stable(ob) === stable(nb)) return;
  const oTypes = ob.map((b) => b.type).join(", ") || "(none)";
  const nTypes = nb.map((b) => b.type).join(", ") || "(none)";
  const detail = oTypes !== nTypes
    ? `layout blocks ${oTypes} → ${nTypes}`
    : `layout content changed in ${plural(nb.filter((b, i) => stable(b) !== stable(ob[i])).length, "block")}`;
  changes.push({ kind: "layout-changed", screen, detail });
}

function diffScreen(before: Screen, after: Screen, changes: DiffChange[]): void {
  const screen = before.id;
  diffPlatforms(before.platforms, after.platforms, { screen }, changes);

  for (const state of sortedUnion(before.requiredStates, after.requiredStates)) {
    const had = before.requiredStates.includes(state);
    const has = after.requiredStates.includes(state);
    if (!had && has) changes.push({ kind: "contract-state-added", screen, state, detail: `required state "${state}" added to contract` });
    else if (had && !has) changes.push({ kind: "contract-state-removed", screen, state, detail: `required state "${state}" removed from contract` });
  }

  for (const state of sortedUnion(before.designedStates, after.designedStates)) {
    const had = before.designedStates.includes(state);
    const has = after.designedStates.includes(state);
    if (!had && has) changes.push({ kind: "designed-state-added", screen, state, detail: `designed state "${state}" added` });
    else if (had && !has) changes.push({ kind: "designed-state-removed", screen, state, detail: `designed state "${state}" removed` });
  }

  const oEx = new Map((before.exemptions ?? []).map((e) => [e.state, e.reason]));
  const nEx = new Map((after.exemptions ?? []).map((e) => [e.state, e.reason]));
  for (const state of sortedUnion(oEx.keys(), nEx.keys())) {
    const or = oEx.get(state);
    const nr = nEx.get(state);
    if (or === nr) continue;
    if (or !== undefined) changes.push({ kind: "exemption-removed", screen, state, detail: `exemption removed for "${state}" (was "${or}")` });
    if (nr !== undefined) changes.push({ kind: "exemption-added", screen, state, detail: `exemption added for "${state}": "${nr}"` });
  }

  const oComp = componentEntries(before.components);
  const nComp = componentEntries(after.components);
  for (const key of sortedUnion(oComp.keys(), nComp.keys())) {
    const o = oComp.get(key);
    const n = nComp.get(key);
    if (!o) {
      changes.push({ kind: "component-added", screen, detail: `component "${key}" (${n!.semantic}) added` });
    } else if (!n) {
      changes.push({ kind: "component-removed", screen, detail: `component "${key}" (${o.semantic}) removed` });
    } else {
      const parts = componentChangeParts(o, n);
      if (parts.length) changes.push({ kind: "component-changed", screen, detail: `component "${key}": ${parts.join(", ")}` });
    }
  }

  diffLayout(before.layout, after.layout, screen, changes);
}

// ── tokens ──────────────────────────────────────────────────────────

function flattenTokens(tokens: Tokens = {}): Map<string, string | number> {
  const map = new Map<string, string | number>();
  for (const [key, value] of Object.entries(tokens.colors ?? {})) {
    if (value !== undefined) map.set(`colors.${key}`, value);
  }
  if (tokens.radius !== undefined) map.set("radius", tokens.radius);
  if (tokens.font !== undefined) map.set("font", tokens.font);
  return map;
}

function diffTokens(before: Tokens | undefined, after: Tokens | undefined, changes: DiffChange[]): void {
  const o = flattenTokens(before);
  const n = flattenTokens(after);
  const parts: string[] = [];
  for (const key of sortedUnion(o.keys(), n.keys())) {
    const ov = o.get(key);
    const nv = n.get(key);
    if (ov === nv) continue;
    if (ov === undefined) parts.push(`${key} set to ${fmt(nv)}`);
    else if (nv === undefined) parts.push(`${key} removed (was ${fmt(ov)})`);
    else parts.push(`${key} ${fmt(ov)} → ${fmt(nv)}`);
  }
  if (parts.length) changes.push({ kind: "tokens-changed", detail: `tokens changed: ${parts.join(", ")}` });
}

// ── the diff ────────────────────────────────────────────────────────

/**
 * Semantic diff of two projects. Both sides are validated with
 * parseProject (ZodError propagates). Arrays keyed by id / state name /
 * event compare order-insensitively; string transitions are normalized
 * to object form. Output ordering is deterministic: project-level
 * first, then journeys alphabetically, then screens alphabetically.
 */
export function diffProjects(oldProject: unknown, newProject: unknown): DesignDiff {
  const before = parseProject(oldProject);
  const after = parseProject(newProject);
  const changes: DiffChange[] = [];

  diffPlatforms(before.platforms, after.platforms, {}, changes);
  diffTokens(before.tokens, after.tokens, changes);

  const oJourneys = new Map(before.journeys.map((j) => [j.id, j]));
  const nJourneys = new Map(after.journeys.map((j) => [j.id, j]));
  for (const id of sortedUnion(oJourneys.keys(), nJourneys.keys())) {
    const o = oJourneys.get(id);
    const n = nJourneys.get(id);
    if (!o) changes.push({ kind: "journey-added", journey: id, detail: `journey "${id}" added (${plural(Object.keys(n!.states).length, "state")})` });
    else if (!n) changes.push({ kind: "journey-removed", journey: id, detail: `journey "${id}" removed (${plural(Object.keys(o.states).length, "state")})` });
    else diffJourney(o, n, changes);
  }

  const oScreens = new Map(before.screens.map((s) => [s.id, s]));
  const nScreens = new Map(after.screens.map((s) => [s.id, s]));
  for (const id of sortedUnion(oScreens.keys(), nScreens.keys())) {
    const o = oScreens.get(id);
    const n = nScreens.get(id);
    if (!o) changes.push({ kind: "screen-added", screen: id, detail: `screen "${id}" added (${plural(n!.requiredStates.length, "required state")})` });
    else if (!n) changes.push({ kind: "screen-removed", screen: id, detail: `screen "${id}" removed` });
    else diffScreen(o, n, changes);
  }

  const summary = { added: 0, removed: 0, changed: 0 };
  for (const change of changes) {
    if (change.kind.endsWith("-added")) summary.added++;
    else if (change.kind.endsWith("-removed")) summary.removed++;
    else summary.changed++;
  }
  return { changes, summary };
}

// ── renderers ───────────────────────────────────────────────────────

/** Group label per change, preserving first-appearance order. */
function groupChanges(changes: DiffChange[]): Map<string, DiffChange[]> {
  const groups = new Map<string, DiffChange[]>();
  for (const change of changes) {
    const label = change.journey ? `journey ${change.journey}` : change.screen ? `screen ${change.screen}` : "project";
    const list = groups.get(label) ?? [];
    list.push(change);
    groups.set(label, list);
  }
  return groups;
}

function marker(kind: DiffChange["kind"]): "+" | "−" | "~" {
  return kind.endsWith("-added") ? "+" : kind.endsWith("-removed") ? "−" : "~";
}

function summaryLine(diff: DesignDiff): string {
  const { added, removed, changed } = diff.summary;
  return `${added} added · ${removed} removed · ${changed} changed`;
}

/** Grouped terminal output; colors match `uxloom check`. */
export function renderHuman(diff: DesignDiff, useColor: boolean): string {
  const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
  const red = (s: string) => c("31", s);
  const yellow = (s: string) => c("33", s);
  const green = (s: string) => c("32", s);
  const bold = (s: string) => c("1", s);

  if (diff.changes.length === 0) return green("✔ no design changes");

  const lines: string[] = [];
  for (const [label, items] of groupChanges(diff.changes)) {
    lines.push(bold(label));
    for (const change of items) {
      const mark = marker(change.kind);
      const painted = mark === "+" ? green(mark) : mark === "−" ? red(mark) : yellow(mark);
      lines.push(`  ${painted} ${change.detail}`);
    }
    lines.push("");
  }
  lines.push(summaryLine(diff));
  return lines.join("\n");
}

/** PR-comment-ready markdown. */
export function renderMarkdown(diff: DesignDiff): string {
  if (diff.changes.length === 0) return "No design changes.";
  const lines: string[] = ["## Design changes", ""];
  for (const [label, items] of groupChanges(diff.changes)) {
    const heading = label === "project" ? "project" : label.replace(/^(journey|screen) (.*)$/, "$1 `$2`");
    lines.push(`### ${heading}`, "");
    for (const change of items) lines.push(`- ${marker(change.kind)} ${change.detail}`);
    lines.push("");
  }
  lines.push(`**${summaryLine(diff)}**`);
  return lines.join("\n");
}

// ── CLI ─────────────────────────────────────────────────────────────

const USAGE =
  "usage: uxloom diff <oldFile> <newFile> [--json|--markdown]\n" +
  "       uxloom diff --git <ref> [file] [--json|--markdown]";

/**
 * `uxloom diff` entry point; receives the raw args after "diff".
 * Exit codes: 0 no changes, 3 changes present, 2 error. Never 1
 * (reserved for check/audit failures).
 */
export function runDiff(args: string[]): never {
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  const red = (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);
  const dim = (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s);
  const fail = (message: string): never => {
    console.error(red(`✖ ${message}`));
    console.error(dim(USAGE));
    process.exit(2);
  };

  const positionals: string[] = [];
  let gitRef: string | undefined;
  let format: "human" | "json" | "markdown" = "human";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--git") {
      gitRef = args[++i];
      if (!gitRef || gitRef.startsWith("--")) fail("--git requires a <ref>");
    } else if (arg === "--json") format = "json";
    else if (arg === "--markdown") format = "markdown";
    else if (arg.startsWith("--")) fail(`unknown flag ${arg}`);
    else positionals.push(arg);
  }

  const readJson = (path: string, label: string): unknown => {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      return fail(`cannot read ${label} at ${path}`);
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch (error) {
      return fail(`${label} is not valid JSON (${path}): ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  let oldData: unknown;
  let newData: unknown;
  if (gitRef) {
    if (positionals.length > 1) fail("--git takes at most one [file]");
    const file = resolve(positionals[0] ?? "uxloom.project.json");
    const dir = dirname(file);
    let prefix: string;
    try {
      prefix = execFileSync("git", ["rev-parse", "--show-prefix"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch {
      return fail(`not a git repository: ${dir}`);
    }
    const repoPath = prefix + basename(file);
    let oldRaw: string;
    try {
      oldRaw = execFileSync("git", ["show", `${gitRef}:${repoPath}`], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      return fail(`cannot read ${repoPath} at ${gitRef} — does the file exist in that ref?`);
    }
    try {
      oldData = JSON.parse(oldRaw) as unknown;
    } catch (error) {
      return fail(`${repoPath} at ${gitRef} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    newData = readJson(file, "project file");
  } else {
    if (positionals.length !== 2) fail("expected <oldFile> <newFile> (or --git <ref> [file])");
    oldData = readJson(resolve(positionals[0]), "old project");
    newData = readJson(resolve(positionals[1]), "new project");
  }

  let diff: DesignDiff;
  try {
    diff = diffProjects(oldData, newData);
  } catch (error) {
    return fail(`invalid project: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (format === "json") console.log(JSON.stringify(diff, null, 2));
  else if (format === "markdown") console.log(renderMarkdown(diff));
  else {
    console.log(renderHuman(diff, useColor));
    if (diff.changes.length > 0) console.log(dim("exit 3 = changes present"));
  }
  process.exit(diff.changes.length > 0 ? 3 : 0);
}
