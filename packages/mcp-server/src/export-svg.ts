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
import { blockLayerName, frameName } from "./design-naming.js";

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
  variant?: "primary" | "secondary" | "danger" | "ghost";
  state?: "default" | "error" | "disabled";
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
export interface SvgJourneyState {
  screen?: string;
  on?: Record<string, string | { target?: string }>;
}
export interface SvgJourney {
  id?: string;
  entry?: string;
  states?: Record<string, SvgJourneyState>;
}
export interface SvgProject {
  name?: string;
  platforms?: string[];
  screens?: SvgScreen[];
  journeys?: SvgJourney[];
  tokens?: {
    colors?: {
      accent?: string; bg?: string; surface?: string; text?: string; muted?: string;
      border?: string; success?: string; warning?: string; danger?: string;
    };
    radius?: number;
    font?: string;
    mode?: "light" | "dark";
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
  /* R34 derived, opaque, theme-adaptive — computed from the tokens so a
     theme change restyles the whole export (mirrors the preview's color-mix). */
  hair: string;      // hairline border
  sunken: string;    // input / header-bar fill, slightly off the surface
  accentSoft: string; // accent tint for chips, badges, hero
  zebra: string;     // alternating table row
  success: string;   // R32 semantic status colors
  warning: string;
  danger: string;
  mode: "light" | "dark"; // R32 — auto-detected from bg unless overridden
}

const ERR = "#b04338";
const ERR_BG = "#fdf3f2";
/* legacy grayscale fallbacks, still used by the empty/loading/custom state
   treatments in buildScreenSvg */
const BLOCKLINE = "#c4c9c4";
const BAR = "#e0e3e0";
const SOFT = "#f1f3f1";

/* -------- deterministic color mixing (opaque, for SVG/Figma import) -------- */
function clampByte(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }
function toHex2(n: number): string { return clampByte(n).toString(16).padStart(2, "0"); }
function parseHex(c: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec((c ?? "").trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
/** a·(1-t) + b·t, returned as an opaque hex; falls back to `a` if unparseable. */
function mix(a: string, b: string, t: number): string {
  const A = parseHex(a), B = parseHex(b);
  if (!A || !B) return a;
  return "#" + toHex2(A[0] + (B[0] - A[0]) * t) + toHex2(A[1] + (B[1] - A[1]) * t) + toHex2(A[2] + (B[2] - A[2]) * t);
}
/** Relative luminance (0 dark … 1 light) for auto light/dark detection. */
function luminance(c: string): number {
  const rgb = parseHex(c);
  if (!rgb) return 1;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

function themeOf(project: SvgProject): Theme {
  const t = project.tokens ?? {};
  const c = t.colors ?? {};
  const accent = c.accent ?? "#2a2e2a";
  const bg = c.bg ?? "#ffffff";
  const surface = c.surface ?? "#ffffff";
  const text = c.text ?? "#2a2e2a";
  return {
    accent, bg, surface, text,
    muted: c.muted ?? "#6b706b",
    radius: typeof t.radius === "number" ? t.radius : 8,
    font: t.font ?? "-apple-system, 'Segoe UI', system-ui, sans-serif",
    hair: c.border ?? mix(bg, text, 0.16),
    sunken: mix(surface, text, 0.06),
    accentSoft: mix(surface, accent, 0.16),
    zebra: mix(surface, text, 0.03),
    success: c.success ?? "#22c55e",
    warning: c.warning ?? "#f59e0b",
    danger: c.danger ?? "#ef4444",
    mode: t.mode ?? (luminance(bg) < 0.5 ? "dark" : "light"),
  };
}

/** Map a status word to a semantic color (R32). */
function statusColor(word: string, th: Theme): string {
  const w = (word || "").toLowerCase();
  if (hasWord(w, ["done", "active", "ship", "complete", "approved", "live", "success"])) return th.success;
  if (hasWord(w, ["block", "error", "fail", "reject", "overdue", "denied"])) return th.danger;
  if (hasWord(w, ["review", "pending", "wait", "progress", "draft"])) return th.warning;
  return th.accent;
}

/* --------- deterministic sample content (identical to the preview) --------- */
const SAMPLE_NAMES = ["Alex Rivera", "Sam Chen", "Jordan Lee", "Taylor Kim", "Morgan Diaz", "Casey Park", "Riley Fox", "Jamie Wu"];
const ITEM_TITLES = ["Onboarding flow", "Payment retry logic", "Search indexing", "Mobile navigation", "Export API", "Billing settings", "Auth token refresh", "Dark mode polish"];
const SAMPLE_SUBS = ["Updated 2h ago", "In review", "Due Friday", "3 comments", "Blocked on API", "Ready to ship"];
const CARD_SUBS = ["Cross-team initiative with three active workstreams.", "On track for the Q3 milestone.", "Waiting on design sign-off.", "Recently reopened after QA."];
const CARD_METAS = ["12 tasks", "3 members", "Due Aug 30", "8 open"];
const STATUS_WORDS = ["Active", "In review", "Done", "Pending", "Blocked"];
function pick<T>(a: T[], i: number): T { return a[((i % a.length) + a.length) % a.length]; }
function initials(s: string): string { s = (s || "").trim(); if (!s) return "U"; const p = s.split(" "); return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")).toUpperCase(); }
function hasWord(c: string, list: string[]): boolean { return list.some((w) => c.indexOf(w) >= 0); }
function isGhost(l: string): boolean { return hasWord((l || "").toLowerCase(), ["cancel", "back", "skip", "learn", "secondary", "dismiss", "later"]); }
function placeholderFor(l: string): string { l = (l || "").toLowerCase(); if (l.indexOf("email") >= 0) return "you@company.com"; if (l.indexOf("password") >= 0) return "••••••••••"; if (l.indexOf("search") >= 0) return "Search…"; if (l.indexOf("name") >= 0) return "Jane Doe"; return "Enter " + (l || "value"); }
function navItems(label: string): string[] {
  if (label) {
    const parts = label.split("·").join("|").split("/").join("|").split(",").join("|").split("|").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts.slice(0, 5);
  }
  return ["Home", "Projects", "Activity", "Settings"];
}
function money(i: number): string { const v = ((i * 734 + 128) % 9000) + 240; const s = String(v); return v >= 1000 ? "$" + s.slice(0, s.length - 3) + "," + s.slice(s.length - 3) : "$" + s; }
function cellFor(col: string, i: number): string | null {
  const c = (col || "").toLowerCase();
  if (hasWord(c, ["amount", "price", "cost", "total", "revenue", "budget"])) return money(i);
  if (hasWord(c, ["date", "day", "created", "updated", "due", "when"])) return pick(["Aug 9", "Aug 12", "Sep 1", "Jul 28", "Aug 30"], i);
  if (hasWord(c, ["status", "state"])) return null; // caller renders a badge
  if (hasWord(c, ["name", "user", "owner", "assignee", "member", "author", "people", "contact"])) return pick(SAMPLE_NAMES, i);
  if (hasWord(c, ["email"])) return pick(SAMPLE_NAMES, i).toLowerCase().split(" ").join(".") + "@acme.co";
  if (hasWord(c, ["qty", "count", "number", "tasks", "items"])) return String(((i * 7 + 3) % 40) + 1);
  if (hasWord(c, ["priority"])) return pick(["High", "Medium", "Low", "Urgent"], i);
  if (hasWord(c, ["id", "key", "ticket", "ref"])) return "TP-" + (101 + i);
  return pick(["Acme Corp", "North Star", "Blue Ridge", "Vertex Labs", "Harbor", "Summit Co"], i);
}
/** Trim a string to roughly fit `widthPx`, adding an ellipsis. */
function truncate(s: string, widthPx: number): string {
  const max = Math.max(4, Math.floor((widthPx - 26) / 6.7));
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
/** A rounded, semantically-colored status pill: returns its SVG and pixel width. */
function badgeSvg(txt: string, x: number, cy: number, th: Theme): { s: string; w: number } {
  const color = statusColor(txt, th);
  const bg = mix(th.surface, color, th.mode === "dark" ? 0.26 : 0.18);
  const w = 20 + txt.length * 6.6;
  const s = [
    rect(x, cy - 10, w, 20, `rx="10" fill="${bg}"`),
    `<circle cx="${num(x + 9)}" cy="${num(cy)}" r="3" fill="${color}"/>`,
    text(x + 16, cy + 4, txt, `font-size="11.5" font-weight="600" fill="${color}"`),
  ].join("\n");
  return { s, w };
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

/**
 * Wrap a block's markup in a named `<g>` (R27). The `<title>` carries the
 * R26 layer name — Figma/Penpot read it as the layer/group name on import,
 * so a repeated block is one click from becoming a component.
 */
function group(name: string, id: string, inner: string): string {
  return `<g id="${id}"><title>${escapeXml(name)}</title>\n${inner}\n</g>`;
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
    case "header": {
      h = 56;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${th.hair}" stroke-width="1"`));
      parts.push(text(x + 16, y + 34, label || "App", `font-size="15" font-weight="700" fill="${th.text}"`));
      const av = 30, ax = x + w - 16 - av, ay = y + (h - av) / 2;
      parts.push(`<circle cx="${num(ax + av / 2)}" cy="${num(ay + av / 2)}" r="${num(av / 2)}" fill="${th.accent}"/>`);
      parts.push(text(ax + av / 2, ay + av / 2 + 4, initials(pick(SAMPLE_NAMES, 0)), `font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle"`));
      break;
    }
    case "nav": {
      h = 44;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.sunken}"`));
      let nx = x + 6;
      navItems(label).forEach((t, k) => {
        const tw = 22 + t.length * 7;
        if (k === 0) parts.push(rect(nx, y + 6, tw, h - 12, `rx="7" fill="${th.surface}" stroke="${th.hair}" stroke-width="1"`));
        parts.push(text(nx + tw / 2, y + h / 2 + 4, t, k === 0
          ? `font-size="13" font-weight="600" fill="${th.text}" text-anchor="middle"`
          : `font-size="13" fill="${th.muted}" text-anchor="middle"`));
        nx += tw + 6;
      });
      break;
    }
    case "footer": {
      h = 44;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${th.hair}" stroke-width="1"`));
      parts.push(text(x + w / 2, y + h / 2 + 4, ["Privacy", "Terms", "Status", "© " + (label || "App")].join("      "), `font-size="12" fill="${th.muted}" text-anchor="middle"`));
      break;
    }
    case "hero": {
      h = 156;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${mix(th.surface, th.accent, 0.10)}" stroke="${th.hair}" stroke-width="1"`));
      parts.push(text(x + w / 2, y + 58, b.copy || label || "Build something great", `font-size="22" font-weight="750" fill="${th.text}" text-anchor="middle"`));
      parts.push(text(x + w / 2, y + 84, "A clear, benefit-led subheadline that sets up the primary action.", `font-size="13" fill="${th.muted}" text-anchor="middle"`));
      const l1 = "Get started", l2 = "Learn more";
      const w1 = 40 + l1.length * 7.5, w2 = 40 + l2.length * 7.5, gap = 10, bh = 38;
      let bx = x + (w - (w1 + w2 + gap)) / 2; const by = y + 106;
      parts.push(rect(bx, by, w1, bh, `rx="${Math.max(0, r - 2)}" fill="${th.accent}"`));
      parts.push(text(bx + w1 / 2, by + 24, l1, `font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle"`));
      bx += w1 + gap;
      parts.push(rect(bx, by, w2, bh, `rx="${Math.max(0, r - 2)}" fill="none" stroke="${th.hair}" stroke-width="1"`));
      parts.push(text(bx + w2 / 2, by + 24, l2, `font-size="13" font-weight="600" fill="${th.text}" text-anchor="middle"`));
      break;
    }
    case "text": {
      let cy = y + 14;
      const inner: string[] = [];
      if (label !== "") { inner.push(text(x + 16, cy, label.toUpperCase(), `font-size="11" font-weight="600" letter-spacing=".04em" fill="${th.muted}"`)); cy += 18; }
      if (b.copy) {
        for (const line of wrapText(b.copy, Math.max(10, Math.floor((w - 32) / 7)))) {
          inner.push(text(x + 16, cy + 8, line, `font-size="13.5" fill="${th.text}"`)); cy += 20;
        }
      } else {
        inner.push(rect(x + 16, cy, w - 32, 9, `rx="5" fill="${th.hair}"`));
        inner.push(rect(x + 16, cy + 15, (w - 32) * 0.6, 9, `rx="5" fill="${th.hair}"`));
        cy += 30;
      }
      h = cy + 14 - y;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${th.hair}" stroke-width="1"`));
      parts.push(...inner);
      break;
    }
    case "button": {
      h = 38;
      const lbl = label || "Action";
      const bw = Math.min(w, 40 + lbl.length * 7.5);
      const rr = `rx="${Math.max(0, r - 2)}"`;
      // R33 — explicit variant wins; else infer ghost from the label.
      const variant = b.state === "disabled" ? "disabled"
        : (b.variant ?? (isGhost(label) ? "ghost" : "primary"));
      if (variant === "primary") {
        parts.push(rect(x, y, bw, h, `${rr} fill="${th.accent}"`));
        parts.push(text(x + bw / 2, y + 24, lbl, `font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle"`));
      } else if (variant === "danger") {
        parts.push(rect(x, y, bw, h, `${rr} fill="${th.danger}"`));
        parts.push(text(x + bw / 2, y + 24, lbl, `font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle"`));
      } else if (variant === "secondary") {
        parts.push(rect(x, y, bw, h, `${rr} fill="${th.accentSoft}"`));
        parts.push(text(x + bw / 2, y + 24, lbl, `font-size="13" font-weight="600" fill="${th.accent}" text-anchor="middle"`));
      } else if (variant === "disabled") {
        parts.push(rect(x, y, bw, h, `${rr} fill="${th.sunken}" stroke="${th.hair}" stroke-width="1"`));
        parts.push(text(x + bw / 2, y + 24, lbl, `font-size="13" font-weight="600" fill="${th.muted}" text-anchor="middle"`));
      } else { // ghost
        parts.push(rect(x, y, bw, h, `${rr} fill="none" stroke="${th.hair}" stroke-width="1"`));
        parts.push(text(x + bw / 2, y + 24, lbl, `font-size="13" font-weight="600" fill="${th.text}" text-anchor="middle"`));
      }
      break;
    }
    case "field": {
      const error = b.state === "error", disabled = b.state === "disabled";
      const border = error ? th.danger : th.hair;
      h = error ? 84 : 66;
      parts.push(text(x, y + 14, label || "Field", `font-size="12.5" font-weight="600" fill="${disabled ? th.muted : th.text}"`));
      parts.push(rect(x, y + 22, w, 40, `rx="${Math.max(0, r - 2)}" fill="${th.sunken}" stroke="${border}" stroke-width="${error ? 1.5 : 1}"`));
      parts.push(text(x + 13, y + 47, placeholderFor(label), `font-size="13" fill="${th.muted}"`));
      if (error) parts.push(text(x, y + 78, "Please check this field.", `font-size="12" fill="${th.danger}"`));
      break;
    }
    case "image": {
      h = 130;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.accentSoft}" stroke="${th.hair}" stroke-width="1"`));
      parts.push(text(x + w / 2, y + h / 2 + 4, label || "Image", `font-size="12" fill="${th.muted}" text-anchor="middle"`));
      break;
    }
    case "list": {
      const n = b.count ?? 3, rowH = 56, gap = 10;
      for (let i = 0; i < n; i++) {
        const ry = y + i * (rowH + gap);
        parts.push(rect(x, ry, w, rowH, `rx="${r}" fill="${th.surface}" stroke="${th.hair}" stroke-width="1"`));
        const av = 34, ax = x + 14, ay = ry + (rowH - av) / 2;
        parts.push(`<circle cx="${num(ax + av / 2)}" cy="${num(ay + av / 2)}" r="${num(av / 2)}" fill="${th.accent}"/>`);
        parts.push(text(ax + av / 2, ay + av / 2 + 4, initials(pick(SAMPLE_NAMES, i)), `font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle"`));
        const tx = ax + av + 12;
        parts.push(text(tx, ry + 24, pick(ITEM_TITLES, i), `font-size="14" font-weight="650" fill="${th.text}"`));
        parts.push(text(tx, ry + 42, pick(SAMPLE_NAMES, i) + " · " + pick(SAMPLE_SUBS, i), `font-size="12.5" fill="${th.muted}"`));
        parts.push(text(x + w - 18, ry + rowH / 2 + 6, "›", `font-size="18" fill="${th.muted}" text-anchor="middle" opacity="0.5"`));
      }
      h = n * rowH + (n - 1) * gap;
      break;
    }
    case "card": {
      const n = b.count ?? 3;
      const cols = Math.max(1, Math.min(n, Math.floor((w + GAP) / (180 + GAP))));
      const cardW = (w - (cols - 1) * GAP) / cols, cardH = 118;
      const rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) {
        const cx = x + (i % cols) * (cardW + GAP);
        const cyy = y + Math.floor(i / cols) * (cardH + GAP);
        parts.push(rect(cx, cyy, cardW, cardH, `rx="${r}" fill="${th.surface}" stroke="${th.hair}" stroke-width="1"`));
        parts.push(rect(cx + 14, cyy + 14, 26, 26, `rx="7" fill="${th.accentSoft}"`));
        parts.push(text(cx + 14 + 35, cyy + 31, truncate(pick(ITEM_TITLES, i), cardW - 60), `font-size="14" font-weight="650" fill="${th.text}"`));
        parts.push(text(cx + 14, cyy + 60, truncate(pick(CARD_SUBS, i), cardW), `font-size="12.5" fill="${th.muted}"`));
        parts.push(badgeSvg(pick(STATUS_WORDS, i), cx + 14, cyy + cardH - 18, th).s);
        parts.push(text(cx + cardW - 14, cyy + cardH - 14, pick(CARD_METAS, i), `font-size="12" fill="${th.muted}" text-anchor="end"`));
      }
      h = rows * cardH + (rows - 1) * GAP;
      break;
    }
    case "table": {
      const cols = b.columns && b.columns.length > 0 ? b.columns : ["Name", "Status", "Updated"];
      const ncol = cols.length, headH = 38, rowH = 40, n = b.count ?? 3, colW = w / ncol;
      h = headH + n * rowH;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${th.hair}" stroke-width="1"`));
      for (let j = 0; j < ncol; j++) {
        parts.push(text(x + j * colW + 12, y + 24, cols[j].toUpperCase(), `font-size="11" font-weight="700" letter-spacing=".04em" fill="${th.muted}"`));
      }
      for (let i = 0; i < n; i++) {
        const ry = y + headH + i * rowH;
        parts.push(`<line x1="${num(x)}" y1="${num(ry)}" x2="${num(x + w)}" y2="${num(ry)}" stroke="${th.hair}" stroke-width="1"/>`);
        for (let j = 0; j < ncol; j++) {
          const cxp = x + j * colW + 12, cyc = ry + rowH / 2;
          const val = cellFor(cols[j], i);
          if (val === null) parts.push(badgeSvg(pick(STATUS_WORDS, i), cxp, cyc, th).s);
          else parts.push(text(cxp, cyc + 4, truncate(val, colW), `font-size="13" fill="${th.text}"`));
        }
      }
      break;
    }
    case "form": {
      const children = b.children && b.children.length > 0
        ? b.children
        : [{ type: "field" }, { type: "field" }, { type: "button", label: "Submit" }];
      let cy = y + 34;
      const inner: string[] = [];
      for (const child of children) {
        const rendered = blockSvg(child, x + 16, cy, w - 32, th);
        inner.push(rendered.s);
        cy += rendered.h + 10;
      }
      h = cy - 10 + 14 - y;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${th.hair}" stroke-width="1"`));
      parts.push(text(x + 16, y + 22, (label || "Form").toUpperCase(), `font-size="11" font-weight="600" letter-spacing=".04em" fill="${th.muted}"`));
      parts.push(...inner);
      break;
    }
    default: { // custom + unknown
      h = 48;
      parts.push(rect(x, y, w, h, `rx="${r}" fill="${th.surface}" stroke="${th.hair}" stroke-width="1"`));
      parts.push(text(x + 16, y + 29, label || b.type, `font-size="13" fill="${th.text}"`));
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
    for (const [i, b] of blocks.entries()) {
      if (b.type !== "header" && b.type !== "nav") continue;
      const rendered = blockSvg(b, x, y, innerW, th);
      content.push(group(blockLayerName(i, b.type, b.label), `block-${i}`, rendered.s));
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
    for (const [i, b] of blocks.entries()) {
      const rendered = blockSvg(b, x, y, innerW, th);
      content.push(group(blockLayerName(i, b.type, b.label), `block-${i}`, rendered.s));
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
    `<title>${escapeXml(frameName(screenId, stateId))}</title>`,
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
  project.journeys = journeys as SvgJourney[];
  project.screens = screens as SvgScreen[];
  delete project.include;
  return project;
}

/* --------------------- journey-ordered frame set --------------------- */

/** One emitted frame: its file plus the R26 identity, journey included. */
export interface FrameRef {
  file: string;
  journey?: string;
  screen: string;
  state: string;
}

/**
 * Every screen×state frame the export writes, ordered by journey traversal
 * (R27): BFS from each journey's entry through its transitions, then screens
 * no journey references, in declared order. Each screen is emitted once,
 * attributed to the first journey that reaches it. The *set* of frames is
 * identical to the flat per-screen×state export — only the order and the
 * journey attribution are added, so `--manifest` is the machine-readable
 * "page per journey" without changing which files are written.
 */
export function orderedFrames(project: SvgProject): FrameRef[] {
  const screens = project.screens ?? [];
  const byId = new Map<string, SvgScreen>();
  for (const s of screens) if (typeof s.id === "string" && s.id !== "") byId.set(s.id, s);
  const statesOf = (s: SvgScreen): string[] =>
    Array.isArray(s.requiredStates) && s.requiredStates.length > 0 ? s.requiredStates : ["default"];

  const emitted = new Set<string>();
  const frames: FrameRef[] = [];
  const emit = (screenId: string, journey?: string): void => {
    if (emitted.has(screenId)) return;
    const screen = byId.get(screenId);
    if (!screen) return;
    emitted.add(screenId);
    for (const state of statesOf(screen)) {
      frames.push({ file: svgFileName(screenId, state), journey, screen: screenId, state });
    }
  };

  for (const journey of project.journeys ?? []) {
    const states = journey.states ?? {};
    const stateIds = Object.keys(states);
    const visited = new Set<string>();
    const order: string[] = [];
    const queue: string[] =
      journey.entry && states[journey.entry] ? [journey.entry] : [...stateIds];
    while (queue.length > 0) {
      const st = queue.shift()!;
      if (visited.has(st)) continue;
      visited.add(st);
      order.push(st);
      for (const target of Object.values(states[st]?.on ?? {})) {
        const ref = typeof target === "string" ? target : target?.target;
        if (!ref) continue;
        const next = ref.split("#")[0]; // "payment#error.declined" → "payment"
        if (states[next] && !visited.has(next)) queue.push(next);
      }
    }
    for (const st of stateIds) if (!visited.has(st)) order.push(st); // never drop
    for (const st of order) {
      const screenId = states[st]?.screen;
      if (typeof screenId === "string" && screenId !== "") emit(screenId, journey.id);
    }
  }
  for (const s of screens) if (typeof s.id === "string" && s.id !== "") emit(s.id);
  return frames;
}

/* ------------------------------- CLI -------------------------------- */

export function runSvgExport(
  fileArg: string | undefined,
  outDir: string,
  opts: { manifest?: boolean } = {},
): never {
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
  const frames = orderedFrames(project);
  const manifest: FrameRef[] = [];
  for (const f of frames) {
    let svg: string;
    try {
      svg = buildScreenSvg(project, f.screen, f.state);
    } catch (error) {
      console.error(`✖ svg export failed: ${String(error instanceof Error ? error.message : error)}`);
      process.exit(2);
    }
    writeFileSync(join(dir, f.file), svg);
    console.log(`  wrote  ${join(dir, f.file)}`);
    manifest.push(f);
  }
  if (opts.manifest) {
    // Plain array per RFC 0007 R27: [{ file, journey?, screen, state }].
    const manifestPath = join(dir, "index.json");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`  wrote  ${manifestPath}  (manifest — the reverse-audit key)`);
  }
  const count = manifest.length;
  console.log(`\n${count} SVG file${count === 1 ? "" : "s"} in ${dir}`);
  console.log("Import into Figma/Penpot: drag the SVGs in — text stays editable.");
  if (!opts.manifest) console.log("Tip: add --manifest to write index.json for `uxloom audit --design`.");
  process.exit(0);
}
