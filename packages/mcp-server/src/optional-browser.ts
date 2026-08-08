/**
 * Optional Playwright loader (RFC 0004 R10, Lane F).
 *
 * UXLoom's core is zero-dependency: Playwright is NEVER declared in
 * package.json — not even devDependencies. It is loaded at runtime via an
 * indirect dynamic import (`new Function("return import(...)")()`), so tsc
 * never tries to resolve the module: a plain `import("playwright")` fails
 * type resolution (TS2307) when the package is absent. When the user has
 * installed Playwright, `--live` audit and `--png` export light up;
 * otherwise callers degrade gracefully and print PLAYWRIGHT_HINT.
 *
 * The Playwright surface is typed structurally below (PlaywrightLike et
 * al.) — only the handful of members we call — so this file compiles
 * cleanly without Playwright's own type declarations.
 */

/** One-line install hint printed whenever an optional feature is unavailable. */
export const PLAYWRIGHT_HINT =
  "npm i -D playwright && npx playwright install chromium — enables --live audit and --png export";

/** The subset of a Playwright Locator we use: element screenshots. */
export interface LocatorLike {
  screenshot(options?: Record<string, unknown>): Promise<unknown>;
}

/** The subset of a Playwright Page we use. */
export interface PageLike {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  /** Evaluate a JS expression string in the page; we always pass strings. */
  evaluate(script: string): Promise<unknown>;
  waitForLoadState(state?: string, options?: Record<string, unknown>): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  locator(selector: string): LocatorLike;
}

/** The subset of a Playwright Browser we use. */
export interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

/** The subset of the Playwright module we use. */
export interface PlaywrightLike {
  chromium: { launch(options?: Record<string, unknown>): Promise<BrowserLike> };
}

/**
 * Try to load Playwright at runtime. Returns null when it is not
 * installed (or exports an unexpected shape) — never throws.
 */
export async function loadPlaywright(): Promise<PlaywrightLike | null> {
  try {
    // Indirect so tsc neither resolves nor rewrites the specifier.
    const importer = new Function('return import("playwright")') as () => Promise<unknown>;
    const mod = (await importer()) as { chromium?: unknown; default?: { chromium?: unknown } };
    const candidate = mod && typeof mod === "object" && mod.chromium ? mod : mod?.default;
    if (candidate && typeof (candidate as PlaywrightLike).chromium?.launch === "function") {
      return candidate as PlaywrightLike;
    }
    return null;
  } catch {
    return null;
  }
}
