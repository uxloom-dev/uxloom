/**
 * Update notifier: tells users when a newer uxloom exists, without ever
 * getting in their way. Registry check is capped at 1.5s, fails silent,
 * and is cached for 24h; output goes to stderr only (safe for MCP stdio).
 * Disable entirely with UXLOOM_NO_UPDATE_CHECK=1 (e.g. in CI).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CACHE = join(homedir(), ".cache", "uxloom", "update-check.json");
const TTL_MS = 24 * 60 * 60 * 1000;

/** Numeric semver comparison: is `a` newer than `b`? */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

async function latestFromRegistry(): Promise<string | null> {
  try {
    const cached = JSON.parse(readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < TTL_MS) return cached.latest ?? null;
  } catch {
    // no cache yet — fall through to the network
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    timer.unref?.();
    const res = await fetch("https://registry.npmjs.org/-/package/uxloom/dist-tags", {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const latest = (await res.json())?.latest ?? null;
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify({ at: Date.now(), latest }));
    return latest;
  } catch {
    return null; // offline, blocked, or slow — never bother the user
  }
}

/** One-line stderr notice when a newer version exists; null otherwise. */
export async function updateNotice(current: string): Promise<string | null> {
  if (process.env.UXLOOM_NO_UPDATE_CHECK) return null;
  const latest = await latestFromRegistry();
  if (!latest || !isNewer(latest, current)) return null;
  return (
    `uxloom ${latest} is available (running ${current}). ` +
    `Restart your MCP session to pick it up via npx, and refresh installed skills with: npx -y uxloom@${latest} init`
  );
}
