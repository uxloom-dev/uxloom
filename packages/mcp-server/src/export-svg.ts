/**
 * `uxloom export --svg <dir>` — the Figma/Penpot bridge (R14).
 *
 * One SVG per screen × requiredState, generated with zero dependencies by
 * a small pure layout engine that mirrors the HTML wireframe renderer:
 * same block stack, same heights heuristics, same state treatments
 * (loading → gray bars, empty → dashed box, error.* → banner, custom →
 * overlay), same design tokens. All copy, labels, and table columns are
 * real <text> elements, so they stay editable after import.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { globToRegExp } from "./preview-export.js";

/* Structural types: schema fields may land in parallel lanes, so access
   stays optional/structural rather than importing the nominal types. */
export interface SvgBlock {
  type: string;
  label?: string;
  count?: number;
  columns?: string[];
  copy?: string;
  source?: string;
  sort?: string[];
  filter?: string[];
  children?: SvgBlock[];
}
export interface SvgComponent {
  semantic?: string;
  label?: { en?: string };
}
export interface SvgScreen {
  id?: string;
  intent?: string;
  requiredStates?: string[];
  components?: SvgComponent[];
  layout?: { blocks?: SvgBlock[] };
}
export interface SvgProject {
  name?: string;
  platforms?: string[];
  screens?: SvgScreen[];
  tokens?: {
    colors?: { accent?: string; bg?: string; surface?: string; text?: string; muted?: string };
    radius?: number;
    font?: string;
  };
  include?: string[];
  [key: string]: unknown;
}

/* ------------------------------ theme ------------------------------ */

interface Theme {
  accent: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  radius: number;
  font: string;
}

const BLOCKLINE = "#c4c9c4";
const BAR = "#e0e3e0";
const SOFT = "#f1f3f1";
const ERR = "#b04338";
const ERR_BG = "#fdf3f2";

function themeOf(project: SvgProject): Theme {
  const t = project.tokens ?? {};
  const c = t.colors ?? {};
  return {
    accent: c.accent ?? "#2a2e2a", // HTML button falls back to --ink
    bg: c.bg ?? "#ffffff",
    surface: c.surface ?? "#ffffff",
    text: c.text ?? "#2a2e2a",
    muted: c.muted ?? "#6b706b",
    radius: typeof t.radius === "number" ? t.radius : 8,
    font: t.font ?? "-apple-system, 'Segoe UI', system-ui, sans-serif",
  };
}

/* ------------------------------ utils ------------------------------ */

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** `Checkout--error.network` → `Checkout--error-network.svg` (dots→dashes,
 *  anything path-hostile → dash). */
export function svgFileName(screenId: string, stateId: string): string {
  const clean = (s: string): string => s.replace(/\./g, "-").replace(/[^\w-]+/g, "-");
  return clean(screenId) + "--" + clean(stateId) + ".svg";
}

/** Greedy word wrap by an approximate character budget per line. */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter((w) => w !== "")) {
      const candidate = line === "" ? word : line + " " + word;
      if (candidate.length > maxChars && line !== "") {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

/** Round to 2 decimals so computed positions stay tidy and deterministic. */
function num(v: number): number {
  return Math.round(v * 100) / 100;
}

function rect(x: number, y: number, w: number, h: number, attrs: string): string {
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${attrs}/>`;
}

function text(x: number, y: number, content: string, attrs: string): string {
  return `<text x="${num(x)}" y="${num(y)}" ${attrs}>${escapeXml(content)}</text>`;
}

/* -------------------- block layout + rendering ---------------------- */

const GAP = 10;
const PAD = 14;

interface Rendered {
  h: number;
  s: string;
}

/**
 * Render one block at (x, y) with width w. Heights mirror the HTML
 * renderer's heuristics (header 44, table rows 32, buttons 34, ...).
 */
function blockSvg(b: SvgBlock, x: number, y: number, w: number, th: Theme): Rendered {
  const r = th.radius;
  const label = b.label ?? "";
  const parts: string[] = [];
  let h = 0;

  switch (b.type) {
    case "header":
    case "nav":
    case "footer": {
      h = 44;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${SOFT}" stroke="${BLOCKLINE}" stroke-width="1.5"`));
      parts.push(text(x + 12, y + 27, label || b.type, `font-size="12" fill="${th.muted}"`));
      parts.push(rect(x + w - 140, y + 18, 54, 8, `rx="4" fill="${BLOCKLINE}"`));
      parts.push(rect(x + w - 76, y + 18, 54, 8, `rx="4" fill="${BLOCKLINE}"`));
      break;
    }
    case "hero": {
      h = 90;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${BLOCKLINE}" stroke-width="1.5"`));
      if (b.copy) {
        parts.push(text(x + w / 2, y + h / 2 + 6, b.copy, `font-size="17" font-weight="600" fill="${th.text}" text-anchor="middle"`));
      } else {
        parts.push(text(x + w / 2, y + h / 2 + 4, label || "Hero", `font-size="12" fill="${th.muted}" text-anchor="middle"`));
      }
      break;
    }
    case "text": {
      let cy = y + 10;
      if (label !== "") {
        parts.push(text(x + 12, cy + 10, label, `font-size="12" fill="${th.muted}"`));
        cy += 18;
      }
      if (b.copy) {
        const lines = wrapText(b.copy, Math.max(10, Math.floor((w - 24) / 7.5)));
        for (const line of lines) {
          parts.push(text(x + 12, cy + 13, line, `font-size="13" fill="${th.text}"`));
          cy += 18;
        }
      } else {
        parts.push(rect(x + 12, cy + 4, w - 24, 8, `rx="4" fill="${BAR}"`));
        parts.push(rect(x + 12, cy + 19, (w - 24) * 0.6, 8, `rx="4" fill="${BAR}"`));
        cy += 30;
      }
      h = cy + 10 - y;
      parts.unshift(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${BLOCKLINE}" stroke-width="1.5"`));
      break;
    }
    case "button": {
      h = 34;
      const bw = Math.min(w, 36 + (label || "Action").length * 7.5);
      parts.push(rect(x, y, bw, h, `rx="${r}" fill="${th.accent}"`));
      parts.push(text(x + bw / 2, y + 21, label || "Action", `font-size="13" fill="#ffffff" text-anchor="middle"`));
      break;
    }
    case "field": {
      h = 58;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${BLOCKLINE}" stroke-width="1.5"`));
      parts.push(text(x + 12, y + 18, label || "Field", `font-size="12" fill="${th.muted}"`));
      parts.push(rect(x + 10, y + 24, w - 20, 26, `rx="6" fill="#fdfdfd" stroke="${BLOCKLINE}" stroke-width="1.5"`));
      break;
    }
    case "image": {
      h = 80;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="#eef0ee" stroke="${BLOCKLINE}" stroke-width="1.5"`));
      parts.push(`<line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y}" stroke="${BLOCKLINE}" stroke-width="1"/>`);
      parts.push(`<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${BLOCKLINE}" stroke-width="1"/>`);
      parts.push(text(x + w / 2, y + h / 2 + 4, label || "image", `font-size="12" fill="${th.muted}" text-anchor="middle"`));
      break;
    }
    case "list": {
      const n = b.count ?? 3;
      const rowH = 44;
      for (let i = 0; i < n; i++) {
        const ry = y + i * (rowH + 8);
        parts.push(rect(x, ry, w, rowH, `rx="${r}" fill="${th.surface}" stroke="${BLOCKLINE}" stroke-width="1.5"`));
        parts.push(`<circle cx="${x + 25}" cy="${ry + 22}" r="13" fill="${BAR}"/>`);
        parts.push(rect(x + 48, ry + 18, w - 60, 8, `rx="4" fill="${BAR}"`));
      }
      h = n * rowH + (n - 1) * 8;
      break;
    }
    case "card": {
      const n = b.count ?? 2;
      const cols = Math.min(n, Math.max(1, Math.floor(w / 160)));
      const cardW = (w - (cols - 1) * GAP) / cols;
      const cardH = 70;
      const rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) {
        const cx = x + (i % cols) * (cardW + GAP);
        const cyy = y + Math.floor(i / cols) * (cardH + GAP);
        parts.push(rect(cx, cyy, cardW, cardH, `rx="${r}" fill="${th.surface}" stroke="${BLOCKLINE}" stroke-width="1.5"`));
        parts.push(text(cx + 12, cyy + 22, label || "Card", `font-size="12" fill="${th.muted}"`));
        parts.push(rect(cx + 12, cyy + 36, cardW - 24, 8, `rx="4" fill="${BAR}"`));
      }
      h = rows * cardH + (rows - 1) * GAP;
      break;
    }
    case "table": {
      const cols = b.columns && b.columns.length > 0 ? b.columns : null;
      const ncol = cols ? cols.length : 3;
      const rowH = 32;
      const n = b.count ?? 3;
      const colW = w / ncol;
      h = (n + 1) * rowH;
      parts.push(rect(x, y, w, rowH, `fill="${SOFT}"`));
      for (let j = 0; j < ncol; j++) {
        if (cols) {
          parts.push(text(x + j * colW + 8, y + 20, cols[j].toUpperCase(),
            `font-size="11" font-weight="600" letter-spacing=".04em" fill="${th.muted}"`));
        } else {
          parts.push(rect(x + j * colW + 8, y + 12, colW - 16, 8, `rx="4" fill="${BAR}"`));
        }
      }
      for (let i = 1; i <= n; i++) {
        const ry = y + i * rowH;
        parts.push(`<line x1="${x}" y1="${ry}" x2="${x + w}" y2="${ry}" stroke="#e4e7e4" stroke-width="1"/>`);
        for (let j = 0; j < ncol; j++) {
          parts.push(rect(x + j * colW + 8, ry + 12, colW - 16, 8, `rx="4" fill="${BAR}"`));
        }
      }
      parts.push(rect(x, y, w, h, `rx="${r}" fill="none" stroke="${BLOCKLINE}" stroke-width="1.5"`));
      break;
    }
    case "form": {
      const children = b.children && b.children.length > 0
        ? b.children
        : [{ type: "field" }, { type: "field" }, { type: "button", label: "Submit" }];
      let cy = y + 26;
      const inner: string[] = [];
      for (const child of children) {
        const rendered = blockSvg(child, x + 10, cy, w - 20, th);
        inner.push(rendered.s);
        cy += rendered.h + 8;
      }
      h = cy - 8 + 10 - y;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${BLOCKLINE}" stroke-width="1.5"`));
      parts.push(text(x + 12, y + 18, label || "Form", `font-size="12" fill="${th.muted}"`));
      parts.push(...inner);
      break;
    }
    default: { // custom + unknown
      h = 44;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${BLOCKLINE}" stroke-width="1.5"`));
      parts.push(text(x + 12, y + 27, label || b.type, `font-size="12" fill="${th.muted}"`));
    }
  }

  // Non-form children stack below the block, indented — same as .kids.
  if (b.children && b.children.length > 0 && b.type !== "form") {
    let cy = y + h + 8;
    for (const child of b.children) {
      const rendered = blockSvg(child, x + 10, cy, w - 20, th);
      parts.push(rendered.s);
      cy += rendered.h + 8;
    }
    h = cy - 8 - y;
  }

  return { h, s: parts.join("\n") };
}

/** Same fallback the HTML preview uses when a screen has no layout. */
function autoBlocks(screen: SvgScreen): SvgBlock[] {
  const blocks: SvgBlock[] = [{ type: "header", label: screen.id }];
  if (screen.intent) blocks.push({ type: "text", label: screen.intent });
  let hasList = false;
  for (const c of screen.components ?? []) {
    const s = (c.semantic ?? "").toLowerCase();
    const label = c.label?.en ?? c.semantic;
    if (s.startsWith("button")) blocks.push({ type: "button", label });
    else if (s.startsWith("input") || s.startsWith("field")) blocks.push({ type: "field", label });
    else if (s.startsWith("list") || s.startsWith("table")) { blocks.push({ type: "list", label: c.semantic }); hasList = true; }
    else if (s.startsWith("nav")) blocks.splice(1, 0, { type: "nav", label: c.semantic });
    else blocks.push({ type: "card", label: c.semantic });
  }
  if (!hasList) blocks.push({ type: "list", label: "Content", count: 3 });
  return blocks;
}

/* --------------------------- screen × state -------------------------- */

/**
 * Pure SVG for one screen in one state — deterministic (no dates, no
 * randomness), tokens applied, copy/labels/columns as editable <text>.
 */
export function buildScreenSvg(project: SvgProject, screenId: string, stateId: string): string {
  const screen = (project.screens ?? []).find((s) => s.id === screenId);
  if (!screen) throw new Error(`no screen "${screenId}" in the project`);

  const th = themeOf(project);
  const width = (project.platforms ?? []).includes("web") ? 960 : 390;
  const innerW = width - 2 * PAD;
  const x = PAD;
  const blocks = screen.layout?.blocks && screen.layout.blocks.length > 0
    ? screen.layout.blocks
    : autoBlocks(screen);

  const isError = stateId.startsWith("error");
  const isBaseline = stateId === "default" || stateId === "empty" || stateId === "loading";
  const body: string[] = [];
  let y = PAD;

  if (isError) {
    body.push(rect(x, y, innerW, 40, `rx="8" fill="${ERR_BG}" stroke="${ERR}" stroke-width="1.5"`));
    body.push(text(x + 12, y + 25, `⚠ ${stateId} — what went wrong and how to fix it`, `font-size="13" fill="${ERR}"`));
    y += 40 + GAP;
  }

  const content: string[] = [];
  if (stateId === "empty") {
    for (const b of blocks.filter((bb) => bb.type === "header" || bb.type === "nav")) {
      const rendered = blockSvg(b, x, y, innerW, th);
      content.push(rendered.s);
      y += rendered.h + GAP;
    }
    const eh = 110;
    content.push(rect(x, y, innerW, eh, `rx="10" fill="none" stroke="${BLOCKLINE}" stroke-width="2" stroke-dasharray="6 4"`));
    content.push(text(x + innerW / 2, y + 48, "Nothing here yet", `font-size="14" fill="${th.muted}" text-anchor="middle"`));
    content.push(text(x + innerW / 2, y + 70, screen.intent ?? "Empty state — first-run guidance goes here",
      `font-size="12" fill="${th.muted}" text-anchor="middle"`));
    y += eh + GAP;
  } else if (stateId === "loading") {
    // gray bars: block-shaped shimmer placeholders, no text
    for (const b of blocks) {
      const measured = blockSvg(b, x, y, innerW, th);
      content.push(rect(x, y, innerW, measured.h, `rx="${th.radius}" fill="#ececec"`));
      y += measured.h + GAP;
    }
  } else {
    for (const b of blocks) {
      const rendered = blockSvg(b, x, y, innerW, th);
      content.push(rendered.s);
      y += rendered.h + GAP;
    }
  }

  const contentTop = isError ? PAD + 40 + GAP : PAD;
  const contentSvg = content.join("\n");
  body.push(isError ? `<g opacity="0.35">\n${contentSvg}\n</g>` : contentSvg);

  let height = Math.max(y - GAP + PAD, 420);

  if (!isBaseline && !isError) {
    // custom states render as an overlay + modal over the default content
    const mw = Math.min(340, innerW - 40);
    const mh = 130;
    const mx = (width - mw) / 2;
    const my = contentTop + 60;
    height = Math.max(height, my + mh + PAD);
    body.push(rect(0, 0, width, height, `fill="#2a2e2a" opacity="0.35"`));
    body.push(rect(mx, my, mw, mh, `rx="${Math.max(th.radius, 12)}" fill="${th.surface}"`));
    body.push(text(mx + 18, my + 28, stateId, `font-size="13" font-weight="600" fill="${th.text}"`));
    body.push(rect(mx + 18, my + 44, mw - 36, 8, `rx="4" fill="${BAR}"`));
    body.push(rect(mx + 18, my + 70, 92, 34, `rx="${th.radius}" fill="${th.accent}"`));
    body.push(text(mx + 18 + 46, my + 91, "Confirm", `font-size="13" fill="#ffffff" text-anchor="middle"`));
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escapeXml(th.font)}">`,
    `<title>${escapeXml(`${screenId} — ${stateId}`)}</title>`,
    rect(0, 0, width, height, `fill="${th.bg}"`),
    body.join("\n"),
    `</svg>`,
  ].join("\n") + "\n";
}

/* -------------------- include-fragment merging ----------------------- */

interface Fragment {
  journeys?: unknown[];
  screens?: unknown[];
}

/** All file paths under dir, relative, posix-separated, sorted. */
function listFiles(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.isFile()) out.push(relative(base, full).split(sep).join("/"));
  }
  return out.sort();
}

/** Read the project and merge include fragments — same rules as the HTML
 *  export (deterministic file order, project file never self-merged). */
export function loadMergedProject(projectPath: string): SvgProject {
  const project = JSON.parse(readFileSync(projectPath, "utf8")) as SvgProject;
  const includes = Array.isArray(project.include)
    ? project.include.filter((g): g is string => typeof g === "string")
    : [];
  if (includes.length === 0) return project;

  console.log("note: this project uses include fragments — merging them into the export");
  const dir = dirname(projectPath);
  const files = listFiles(dir);
  const journeys: unknown[] = Array.isArray(project.journeys) ? (project.journeys as unknown[]) : [];
  const screens: unknown[] = Array.isArray(project.screens) ? (project.screens as unknown[]) : [];
  const matched = new Set<string>();
  for (const pattern of includes) {
    const rx = globToRegExp(pattern);
    for (const rel of files) {
      if (!rx.test(rel) || matched.has(rel)) continue;
      const full = resolve(dir, rel);
      if (full === projectPath) continue;
      matched.add(rel);
      let fragment: Fragment;
      try {
        fragment = JSON.parse(readFileSync(full, "utf8")) as Fragment;
      } catch (error) {
        throw new Error(`include fragment ${rel} is not valid JSON: ${String(error instanceof Error ? error.message : error)}`);
      }
      if (Array.isArray(fragment.journeys)) journeys.push(...fragment.journeys);
      if (Array.isArray(fragment.screens)) screens.push(...fragment.screens);
    }
  }
  project.journeys = journeys;
  project.screens = screens as SvgScreen[];
  delete project.include;
  return project;
}

/* ------------------------------- CLI -------------------------------- */

export function runSvgExport(fileArg: string | undefined, outDir: string): never {
  const projectPath = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  if (!existsSync(projectPath)) {
    console.error(`✖ no project file at ${projectPath}`);
    console.error("  pass a path: uxloom export --svg ./out ./uxloom.project.json — or run: uxloom init");
    process.exit(2);
  }

  let project: SvgProject;
  try {
    project = loadMergedProject(projectPath);
  } catch (error) {
    console.error(`✖ svg export failed: ${String(error instanceof Error ? error.message : error)}`);
    process.exit(2);
  }

  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });

  console.log(`\nuxloom export --svg — vector wireframes, one per screen × state`);
  let count = 0;
  for (const screen of project.screens ?? []) {
    if (typeof screen.id !== "string" || screen.id === "") continue;
    const states = Array.isArray(screen.requiredStates) && screen.requiredStates.length > 0
      ? screen.requiredStates
      : ["default"];
    for (const state of states) {
      let svg: string;
      try {
        svg = buildScreenSvg(project, screen.id, state);
      } catch (error) {
        console.error(`✖ svg export failed: ${String(error instanceof Error ? error.message : error)}`);
        process.exit(2);
      }
      const file = join(dir, svgFileName(screen.id, state));
      writeFileSync(file, svg);
      console.log(`  wrote  ${file}`);
      count++;
    }
  }
  console.log(`\n${count} SVG file${count === 1 ? "" : "s"} in ${dir}`);
  console.log("Import into Figma/Penpot: drag the SVGs in — text stays editable.");
  process.exit(0);
}
