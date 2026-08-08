/**
 * `uxloom audit` tier 2.5 — marker-quality heuristics (RFC 0003, R5).
 *
 * Tiers 1–2 grant IMPLEMENTED when a data-ux-state marker exists, but a
 * marker on an empty element proves nothing. The pure static heuristics
 * here CHALLENGE marker credibility — they emit warnings with file:line
 * evidence and never upgrade a verdict. They are conservative by design:
 * when the source is ambiguous they stay silent, because false positives
 * kill linters.
 *
 *  - state-marker-thin       marker on a bare element that renders nothing
 *  - state-marker-duplicate  one element (or identical bare elements)
 *                            claiming states it cannot distinguish
 *  - state-marker-static     conditional-natured state (loading/empty/
 *                            error*) with no conditional-rendering signal
 *
 * Marker forms (RFC 0004, R9): attribute markers get all three checks.
 * Comment and identifier markers (native platforms) get ONLY the static
 * check — a comment or an accessibility identifier cannot prove that an
 * element is empty or bare, so thin/duplicate would be guesses, and
 * guesses are exactly what this module refuses to make.
 *
 * Integration into runAudit happens in audit.ts; this module exports pure
 * functions over `{ path, text }` inputs and touches no filesystem.
 */
import type { MarkerForm } from "./audit.js";

export interface MarkerQualityFinding {
  code: "state-marker-thin" | "state-marker-duplicate" | "state-marker-static";
  severity: "warning";
  screen?: string; // when determinable from data-ux-screen in the same file
  state: string;
  file: string;
  line: number;
  message: string;
  fix: string;
}

const STATE_ATTR = /data-ux-state\s*=\s*[{"'\s]*["']([\w.\-]+)["']/g;
const SCREEN_ATTR = /data-ux-screen\s*=\s*[{"'\s]*["']([\w.\-]+)["']/g;
const STATE_COMMENT = /(?:\/\/|\/\*)\s*data-ux-state\s*:\s*([\w.\-]+)/g;
const SCREEN_COMMENT = /(?:\/\/|\/\*)\s*data-ux-screen\s*:\s*([\w.\-]+)/g;
const STATE_IDENTIFIER = /\b(?:accessibilityIdentifier|testTag)\s*\(\s*"ux-state:([\w.\-]+)"\s*\)/g;
const SCREEN_IDENTIFIER = /\b(?:accessibilityIdentifier|testTag)\s*\(\s*"ux-screen:([\w.\-]+)"\s*\)/g;
/** Any data-ux-* attribute with a quoted or braced value — for stripping. */
const UX_ATTRS = /data-ux-[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\})/g;

/**
 * Signals that the surrounding code renders conditionally. Covers JSX,
 * template dialects, and Swift/Kotlin/Dart control flow (`if `, `guard `,
 * `when(`/`when `, `?:` and optional chaining via `?`, `.let`, `switch`).
 */
const CONDITIONAL_SIGNAL =
  /&&|\?|if\s*\(|\bif\s|\bguard\s|switch|\bwhen\s*\(|\bwhen\s|\.let\b|v-if|\*ngIf|\{#if|\.map\(|\)\s*:\s*\(|:\s*</;

const STATIC_WINDOW_LINES = 3; // lines before the marker scanned for signals
const NAME_WINDOW_LINES = 10; // lines scanned for an enclosing state-named component
const MAX_BACK_SCAN = 500; // chars scanned backward for the opening '<'
const MAX_TAG_SCAN = 2000; // chars scanned forward for the tag's '>'
const SNIPPET_MAX = 120;

/** A state id that is conditional by nature — shown only sometimes. */
function isConditionalByNature(state: string): boolean {
  return state === "loading" || state === "empty" || state.startsWith("error");
}

/* --------------------------- tag resolution ----------------------------- */

interface Tag {
  start: number; // index of '<' in the file text
  name: string;
  text: string; // the full opening tag, '<' through '>'
  selfClosing: boolean;
  attributeBare: boolean; // no attributes besides data-ux-*
  rendersNothing: boolean; // self-closing, or closes with only whitespace inside
  states: string[]; // data-ux-state values carried by this tag, in order
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the opening tag containing the character at `markerIndex`.
 * Returns null whenever the surrounding text is not verifiably a simple
 * tag (quotes with angle brackets, unbalanced braces, no '<' nearby) —
 * callers must treat null as "don't know", never as evidence.
 */
function parseTagAt(text: string, markerIndex: number): Tag | null {
  let start = -1;
  for (let i = markerIndex, floor = Math.max(0, markerIndex - MAX_BACK_SCAN); i >= floor; i--) {
    const c = text[i];
    if (c === ">") return null; // marker not inside an opening tag we can trust
    if (c === "<") {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const nameMatch = /^[A-Za-z][\w.\-]*/.exec(text.slice(start + 1, start + 128));
  if (!nameMatch) return null; // '</', '<!', fragments — not an opening tag
  const name = nameMatch[0];

  // Walk to the tag's closing '>' — quote- and JSX-brace-aware.
  let end = -1;
  let quote: string | null = null;
  let depth = 0;
  for (let i = start + 1, limit = Math.min(text.length, start + MAX_TAG_SCAN); i < limit; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      if (--depth < 0) return null;
    } else if (depth === 0) {
      if (c === "<") return null; // another '<' before '>' — malformed, bail
      if (c === ">") {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;

  const tagText = text.slice(start, end + 1);
  const selfClosing = /\/\s*>$/.test(tagText);
  const attrText = tagText
    .slice(1 + name.length, -1) // drop '<name' and '>'
    .replace(/\/\s*$/, "") // drop self-closing '/'
    .replace(UX_ATTRS, "");
  const attributeBare = !/\S/.test(attrText);

  const closesImmediately = new RegExp(`^\\s*</\\s*${escapeRegExp(name)}\\s*>`).test(
    text.slice(end + 1, end + 1 + 128),
  );

  return {
    start,
    name,
    text: tagText,
    selfClosing,
    attributeBare,
    rendersNothing: selfClosing || closesImmediately,
    states: [...tagText.matchAll(STATE_ATTR)].map((m) => m[1]),
  };
}

/** One-line, length-capped quote of an element for messages. */
function snippet(tag: Tag): string {
  const oneLine = tag.text.replace(/\s+/g, " ");
  return oneLine.length > SNIPPET_MAX ? `${oneLine.slice(0, SNIPPET_MAX)}…` : oneLine;
}

/** Normalized tag text with markers removed — identical bare elements collide. */
function shapeKey(tag: Tag): string {
  return tag.text.replace(UX_ATTRS, "").replace(/\s+/g, " ").trim();
}

/* ----------------------------- per-file scan ---------------------------- */

interface Marker {
  state: string;
  index: number;
  line: number; // 1-based
  form: MarkerForm;
  tag: Tag | null; // resolved for attribute markers only
}

function lineOffsets(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

function lineAt(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * True when the marker sits inside a component whose name spells out the
 * state (function LoadingSkeleton, const EmptyState = …, struct LoadingView,
 * fun EmptyState, class ErrorBanner) — the conditional then lives at the
 * call site, so the marker is not "static".
 */
function insideStateNamedComponent(lines: string[], markerLine: number, state: string): boolean {
  const words = state.toLowerCase().match(/[a-z]+/g);
  if (!words || words.length === 0) return false;
  const window = lines.slice(Math.max(0, markerLine - 1 - NAME_WINDOW_LINES), markerLine).join("\n");
  for (const decl of window.matchAll(/(?:function|const|struct|fun|class)\s+([A-Za-z_$][\w$]*)/g)) {
    const name = decl[1].toLowerCase();
    if (words.every((w) => name.includes(w))) return true;
  }
  return false;
}

function analyzeFile(path: string, text: string): MarkerQualityFinding[] {
  const lines = text.split("\n");
  const starts = lineOffsets(text);

  const screenIds = new Set(
    [SCREEN_ATTR, SCREEN_COMMENT, SCREEN_IDENTIFIER].flatMap((re) => [...text.matchAll(re)].map((m) => m[1])),
  );
  const screen = screenIds.size === 1 ? [...screenIds][0] : undefined;

  const tags = new Map<number, Tag>(); // keyed by tag start — shared across markers
  const markers: Marker[] = [];
  for (const m of text.matchAll(STATE_ATTR)) {
    const parsed = parseTagAt(text, m.index);
    if (parsed && !tags.has(parsed.start)) tags.set(parsed.start, parsed);
    markers.push({
      state: m[1],
      index: m.index,
      line: lineAt(starts, m.index),
      form: "attribute",
      tag: parsed ? tags.get(parsed.start)! : null,
    });
  }
  // Comment / identifier markers: no element to resolve, so tag stays null
  // and only the static check may apply to them.
  for (const [regex, form] of [
    [STATE_COMMENT, "comment"],
    [STATE_IDENTIFIER, "identifier"],
  ] as const) {
    for (const m of text.matchAll(regex)) {
      markers.push({ state: m[1], index: m.index, line: lineAt(starts, m.index), form, tag: null });
    }
  }
  markers.sort((a, b) => a.index - b.index);
  if (markers.length === 0) return [];

  const findings: MarkerQualityFinding[] = [];
  const emit = (
    code: MarkerQualityFinding["code"],
    state: string,
    line: number,
    message: string,
    fix: string,
  ) => findings.push({ code, severity: "warning", ...(screen && { screen }), state, file: path, line, message, fix });

  /* 1 — thin: marker on a verifiably bare element that renders nothing.
     Attribute form only — a comment or identifier marker says nothing
     about the element it annotates, so emptiness is unprovable. */
  const thinSeen = new Set<string>();
  for (const m of markers) {
    if (m.form !== "attribute") continue;
    if (!m.tag || !m.tag.attributeBare || !m.tag.rendersNothing) continue;
    const key = `${m.tag.start}:${m.state}`;
    if (thinSeen.has(key)) continue;
    thinSeen.add(key);
    emit(
      "state-marker-thin",
      m.state,
      m.line,
      `data-ux-state="${m.state}" sits on a bare element that renders nothing: ${snippet(m.tag)} — the marker proves nothing.`,
      `Render the "${m.state}" UI inside this element, or move the marker to the element that actually renders it.`,
    );
  }

  /* 2 — duplicate: states an element (or identical bare elements) cannot
     render distinctly. Each state is flagged at most once per file. */
  const dupSeen = new Set<string>();
  for (const tag of tags.values()) {
    const distinct = [...new Set(tag.states)];
    if (distinct.length < 2) continue;
    for (const state of distinct) {
      if (dupSeen.has(state)) continue;
      dupSeen.add(state);
      const at = markers.find((m) => m.tag === tag && m.state === state)!;
      emit(
        "state-marker-duplicate",
        state,
        at.line,
        `One element claims states ${distinct.map((s) => `"${s}"`).join(", ")}: ${snippet(tag)} — one element cannot render two distinct states distinctly.`,
        `Give each state its own element with its own render path, and mark each where it actually renders.`,
      );
    }
  }
  const bareByShape = new Map<string, Marker[]>();
  for (const m of markers) {
    if (m.form !== "attribute") continue; // bareness is unprovable for comment/identifier forms
    if (!m.tag || !m.tag.attributeBare || !m.tag.rendersNothing) continue;
    const key = shapeKey(m.tag);
    bareByShape.set(key, [...(bareByShape.get(key) ?? []), m]);
  }
  for (const group of bareByShape.values()) {
    const distinct = [...new Set(group.map((m) => m.state))];
    if (distinct.length < 2) continue;
    for (const state of distinct) {
      if (dupSeen.has(state)) continue;
      dupSeen.add(state);
      const at = group.find((m) => m.state === state)!;
      emit(
        "state-marker-duplicate",
        state,
        at.line,
        `States ${distinct.map((s) => `"${s}"`).join(", ")} are marked on textually identical bare elements (${snippet(at.tag!)}) — identical elements cannot render distinct states.`,
        `Give each state its own element with its own render path, and mark each where it actually renders.`,
      );
    }
  }

  /* 3 — static: conditional-by-nature state with no conditional signal.
     Applies to every marker form — an unconditional loading/empty/error
     render path is suspicious no matter how it is marked. */
  const staticSeen = new Set<string>();
  for (const m of markers) {
    if (!isConditionalByNature(m.state)) continue;
    const key = `${m.line}:${m.state}`;
    if (staticSeen.has(key)) continue;
    staticSeen.add(key);
    const window = lines.slice(Math.max(0, m.line - 1 - STATIC_WINDOW_LINES), m.line).join("\n");
    if (CONDITIONAL_SIGNAL.test(window)) continue;
    if (insideStateNamedComponent(lines, m.line, m.state)) continue;
    const spelled =
      m.form === "attribute"
        ? `data-ux-state="${m.state}"`
        : m.form === "comment"
          ? `the "data-ux-state: ${m.state}" comment marker`
          : `the "ux-state:${m.state}" identifier marker`;
    const gate =
      m.form === "attribute"
        ? `(e.g. {isLoading && <Skeleton data-ux-state="loading" />})`
        : `(e.g. if isLoading { … } / when (state) { … })`;
    emit(
      "state-marker-static",
      m.state,
      m.line,
      `${spelled} has no conditional-rendering signal nearby (found: ${JSON.stringify(lines[m.line - 1].trim())}) — a "${m.state}" state rendered unconditionally is either always or never shown.`,
      `Gate the marked render path behind the condition that produces "${m.state}" ${gate}, or move the marker into a dedicated state-named component rendered from a conditional call site.`,
    );
  }

  return findings;
}

/* ------------------------------ entry point ------------------------------ */

/**
 * Pure marker-quality analysis over already-read source files.
 * Never upgrades a verdict — warnings only, each with file + 1-based line.
 */
export function analyzeMarkerQuality(files: Array<{ path: string; text: string }>): MarkerQualityFinding[] {
  const findings: MarkerQualityFinding[] = [];
  for (const file of files) {
    if (!/data-ux-state|ux-state:/.test(file.text)) continue;
    findings.push(...analyzeFile(file.path, file.text));
  }
  return findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code) || a.state.localeCompare(b.state),
  );
}
