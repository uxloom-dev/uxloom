/**
 * `uxloom export --png <dir>` — render every screen × requiredState to PNG
 * (RFC 0004 R10, Lane F). Optional Playwright enhancement: throws with the
 * install hint when Playwright is absent — the core stays zero-dependency.
 *
 * How it works: buildExportHtml() produces the same standalone preview the
 * plain export ships; we write it to a temp file, load it over file:// in
 * headless Chromium, and drive the page's OWN JavaScript — the template is
 * a classic <script>, so its `pick(screenId, stateId)` / `render()` /
 * `viewport` / `data` are page globals. For each screen × state we call
 * pick() and screenshot the `.frame` element (browser chrome + mock).
 * No selectors are guessed from tab labels; pick() is the template's real
 * navigation entry point.
 *
 * Viewport: desktop by default; mobile when the project targets no "web"
 * platform (matching the template's own boot() behavior).
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildExportHtml } from "./preview-export.js";
import { loadPlaywright, PLAYWRIGHT_HINT, type BrowserLike } from "./optional-browser.js";

/** Filesystem-safe filename part: dots (and anything exotic) → dashes. */
export function sanitizeForFilename(part: string): string {
  return part.replace(/[^A-Za-z0-9_-]/g, "-");
}

/** `Checkout--error-card-declined.png` for screen "Checkout", state "error.card.declined". */
export function pngFileName(screen: string, state: string): string {
  return `${sanitizeForFilename(screen)}--${sanitizeForFilename(state)}.png`;
}

/** Reads the embedded project from the loaded standalone page. */
const PLAN_SCRIPT = `(() => JSON.stringify({
  platforms: (data && data.platforms) || [],
  screens: ((data && data.screens) || []).map(function (s) {
    return { id: s.id, states: s.requiredStates || [] };
  })
}))()`;

interface ShotPlan {
  platforms: string[];
  screens: Array<{ id: string; states: string[] }>;
}

/**
 * Render every screen × requiredState of the project to
 * `<outDir>/<screen>--<state>.png`. Returns the number of PNGs written.
 * Throws (never process.exit) with a descriptive message — including
 * PLAYWRIGHT_HINT when Playwright is missing.
 */
export async function runPngExport(fileArg: string | undefined, outDir: string): Promise<number> {
  const pw = await loadPlaywright();
  if (!pw) {
    throw new Error(`--png export needs Playwright, which is not installed. ${PLAYWRIGHT_HINT}`);
  }

  const projectPath = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  if (!existsSync(projectPath)) {
    throw new Error(`no project file at ${projectPath} — pass a path: uxloom export --png <dir> ./uxloom.project.json — or run: uxloom init`);
  }

  const html = buildExportHtml(projectPath); // throws descriptively on bad input

  const tempDir = mkdtempSync(join(tmpdir(), "uxloom-png-"));
  const htmlPath = join(tempDir, "preview.html");
  writeFileSync(htmlPath, html);
  const out = resolve(outDir);
  mkdirSync(out, { recursive: true });

  let browser: BrowserLike | null = null;
  try {
    browser = await pw.chromium.launch();
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 10_000 });

    const plan = JSON.parse((await page.evaluate(PLAN_SCRIPT)) as string) as ShotPlan;
    const desktop = plan.platforms.includes("web");
    const viewport = desktop ? "desktop" : "mobile";
    await page.setViewportSize(desktop ? { width: 1280, height: 1000 } : { width: 480, height: 1000 });

    let count = 0;
    for (const screen of plan.screens) {
      for (const state of screen.states) {
        await page.evaluate(
          `(() => { viewport = ${JSON.stringify(viewport)}; pick(${JSON.stringify(screen.id)}, ${JSON.stringify(state)}); })()`,
        );
        await page.locator(".frame").screenshot({
          path: join(out, pngFileName(screen.id, state)),
          animations: "disabled", // freeze the loading-skeleton shimmer
        });
        count++;
      }
    }
    return count;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    rmSync(tempDir, { recursive: true, force: true });
  }
}
