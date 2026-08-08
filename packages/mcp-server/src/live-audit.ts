/**
 * `uxloom audit --live <baseUrl>` — audit tier 4: live DOM verification
 * (RFC 0004 R10, Lane F). Optional Playwright enhancement: when Playwright
 * is absent (or the browser cannot launch) the result says so honestly
 * with an install hint — the core stays zero-dependency.
 *
 * uxloom.map.json entries gain an optional `route`:
 *
 *   { "Inbox": { "paths": ["app/inbox/**"], "route": "/inbox" } }
 *
 * loadMap() in audit.ts is JSON.parse and passes unknown keys through, so
 * existing map files stay valid and its return value assigns directly to
 * RouteMap — audit.ts itself is untouched.
 *
 * HONEST SEMANTICS — read before wiring verdicts on top of this:
 *  - Live audit VERIFIES presence in a real DOM; it never judges screens
 *    it cannot reach. A screen without a `route` is SKIPPED, not failed.
 *  - `dom: "rendered"` — the marked element is in the DOM, visible, and
 *    has non-zero size. Default-visible states earn this.
 *  - `dom: "present"` — in the DOM but hidden or zero-sized. States that
 *    are invisible by default (error.*, loading behind a fast response)
 *    are EXPECTED to read "present"; that is not a failure.
 *  - `dom: "absent"` — no marked element found in the initial DOM.
 *    Conditional rendering can legitimately keep a state out of the DOM,
 *    so "absent" means "not verified live", not "not implemented" — the
 *    static tiers (markers) own that call.
 */
import type { Project } from "@uxloom/journeygraph";
import { loadPlaywright, PLAYWRIGHT_HINT, type PageLike } from "./optional-browser.js";

/** Tier-1 registry entry extended with the optional live-audit route. */
export type RouteMap = Record<string, { paths: string[]; route?: string }>;

export type DomVerdict = "rendered" | "present" | "absent";

export interface LiveStateCheck {
  state: string;
  dom: DomVerdict;
}

export interface LiveScreenResult {
  screen: string;
  route?: string;
  /** A `[data-ux-screen="<id>"]` element exists in the loaded page. */
  screenFound: boolean;
  states: LiveStateCheck[];
  /** Set when navigation failed; states are "absent" by fiat, not evidence. */
  error?: string;
}

export interface LiveAuditResult {
  /** False when Playwright is missing or the browser failed to launch. */
  available: boolean;
  /** Why the live tier is unavailable (only when available === false). */
  reason?: string;
  /** Install hint (only when available === false). */
  hint?: string;
  screens: LiveScreenResult[];
  /** Screens with no `route` in the map — unjudged, by design. */
  skipped: string[];
}

/** `base + route` with exactly one slash at the seam. */
function joinUrl(base: string, route: string): string {
  return base.replace(/\/+$/, "") + (route.startsWith("/") ? route : `/${route}`);
}

/**
 * Build the in-page probe as an expression string (the PageLike surface
 * only evaluates strings, keeping Node-side types Playwright-free).
 * Selectors are prebuilt here and carried in via JSON — no in-page string
 * splicing.
 */
function domProbeScript(screenId: string, states: string[]): string {
  const probe = {
    screenSel: `[data-ux-screen="${screenId}"]`,
    states: states.map((s) => ({ state: s, sel: `[data-ux-state="${s}"]` })),
  };
  return `(() => {
    var probe = ${JSON.stringify(probe)};
    var screenEl = document.querySelector(probe.screenSel);
    function verdict(sel) {
      // Scoped inside the screen element when we have one; page-wide fallback.
      var el = (screenEl && screenEl.querySelector(sel)) || document.querySelector(sel);
      if (!el) return "absent";
      var rect = el.getBoundingClientRect();
      var style = window.getComputedStyle(el);
      var visible = rect.width > 0 && rect.height > 0 &&
        style.display !== "none" && style.visibility !== "hidden";
      return visible ? "rendered" : "present";
    }
    return JSON.stringify({
      screenFound: !!screenEl,
      states: probe.states.map(function (s) { return { state: s.state, dom: verdict(s.sel) }; })
    });
  })()`;
}

async function probeScreen(
  page: PageLike,
  screenId: string,
  route: string,
  url: string,
  states: string[],
): Promise<LiveScreenResult> {
  try {
    await page.goto(url, { waitUntil: "load", timeout: 10_000 });
    // networkidle-ish: give SPAs a moment to settle, but never fail on
    // pages that are never network-idle (polling, sockets).
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
  } catch (error) {
    return {
      screen: screenId,
      route,
      screenFound: false,
      states: states.map((state) => ({ state, dom: "absent" as const })),
      error: `navigation failed: ${String(error instanceof Error ? error.message : error)}`,
    };
  }
  const raw = (await page.evaluate(domProbeScript(screenId, states))) as string;
  const parsed = JSON.parse(raw) as { screenFound: boolean; states: LiveStateCheck[] };
  return { screen: screenId, route, screenFound: parsed.screenFound, states: parsed.states };
}

/**
 * Audit tier 4: load each routable screen at `baseUrl + route` in headless
 * Chromium and verify the marker elements in the real DOM.
 *
 * `root` is unused here (parity with runAudit's signature — the live tier
 * needs no filesystem access). Never calls process.exit; degrades to
 * `{ available: false, reason, hint }` when Playwright is missing or the
 * browser cannot launch.
 */
export async function runLiveAudit(
  project: Project,
  root: string,
  map: RouteMap,
  baseUrl: string,
): Promise<LiveAuditResult> {
  void root;
  const unavailable = (reason: string): LiveAuditResult => ({
    available: false,
    reason,
    hint: PLAYWRIGHT_HINT,
    screens: [],
    skipped: [],
  });

  const pw = await loadPlaywright();
  if (!pw) return unavailable("playwright is not installed");

  let browser;
  try {
    browser = await pw.chromium.launch();
  } catch (error) {
    return unavailable(
      `browser launch failed: ${String(error instanceof Error ? error.message : error)}`,
    );
  }

  const screens: LiveScreenResult[] = [];
  const skipped: string[] = [];
  try {
    const page = await browser.newPage();
    for (const screen of project.screens) {
      const route = map[screen.id]?.route;
      if (!route) {
        skipped.push(screen.id);
        continue;
      }
      screens.push(
        await probeScreen(page, screen.id, route, joinUrl(baseUrl, route), screen.requiredStates),
      );
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  return { available: true, screens, skipped };
}

/**
 * Findings-style, printable lines for a live-audit result. Pure formatting
 * — no exit codes, no side effects; the caller decides what to do.
 */
export function summarizeLiveAudit(result: LiveAuditResult): string[] {
  if (!result.available) {
    return [
      `live audit unavailable — ${result.reason ?? "unknown reason"}`,
      `  hint: ${result.hint ?? PLAYWRIGHT_HINT}`,
    ];
  }
  const lines: string[] = [];
  for (const s of result.screens) {
    const mark = s.screenFound ? "✔" : "✖";
    const head = s.screenFound
      ? `screen marker found`
      : s.error ?? `no data-ux-screen="${s.screen}" in DOM`;
    const states = s.states.map((st) => `${st.state}: ${st.dom}`).join(" · ");
    lines.push(`${mark} ${s.screen} @ ${s.route ?? "?"} — ${head}${states ? ` · ${states}` : ""}`);
  }
  if (result.skipped.length) {
    lines.push(
      `— skipped (no route in uxloom.map.json): ${result.skipped.join(", ")} — not a failure; live audit only verifies routable screens`,
    );
  }
  return lines;
}
