/**
 * `uxloom export [file] [out]` — one self-contained, shareable HTML file.
 * Same viewer as `uxloom preview`, but with the project data embedded,
 * live reload disabled, and comment mode hidden: mail it, Slack it, or
 * drop it on any static host.
 *
 * If the project uses an `include` array (glob fragments merged by the
 * loader at runtime), the export merges those fragments itself so the
 * output stands alone.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { renderStandalone } from "./preview-template.js";

interface Fragment {
  journeys?: unknown[];
  screens?: unknown[];
}

/** Minimal glob → RegExp: `*` matches within a path segment, `**` across. */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^$(){}|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*\*\/|\*\*|\*/g, (m) =>
    m === "**/" ? "(?:.*/)?" : m === "**" ? ".*" : "[^/]*"
  );
  return new RegExp("^" + body + "$");
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

/**
 * Read the project, merge include fragments (if any), and render the
 * standalone HTML. Throws with a descriptive message on bad input.
 */
export function buildExportHtml(projectPath: string): string {
  const project = JSON.parse(readFileSync(projectPath, "utf8")) as Record<string, unknown>;

  const includes = Array.isArray(project.include)
    ? project.include.filter((g): g is string => typeof g === "string")
    : [];
  if (includes.length > 0) {
    console.log("note: this project uses include fragments — merging them into the export");
    const dir = dirname(projectPath);
    const files = listFiles(dir);
    const journeys: unknown[] = Array.isArray(project.journeys) ? project.journeys : [];
    const screens: unknown[] = Array.isArray(project.screens) ? project.screens : [];
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
    project.screens = screens;
    delete project.include; // the export stands alone
  }

  return renderStandalone(JSON.stringify(project));
}

export function runExport(fileArg?: string, outArg?: string): never {
  const projectPath = resolve(fileArg ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  if (!existsSync(projectPath)) {
    console.error(`✖ no project file at ${projectPath}`);
    console.error("  pass a path: uxloom export ./uxloom.project.json — or run: uxloom init");
    process.exit(2);
  }

  let html: string;
  try {
    html = buildExportHtml(projectPath);
  } catch (error) {
    console.error(`✖ export failed: ${String(error instanceof Error ? error.message : error)}`);
    process.exit(2);
  }

  const outPath = resolve(outArg ?? "uxloom-preview.html");
  writeFileSync(outPath, html);
  console.log(`\nuxloom export — static preview written`);
  console.log(`  file  ${outPath}`);
  console.log(`Share it anywhere — it is one self-contained HTML file (no server needed).`);
  process.exit(0);
}
