#!/usr/bin/env node
/**
 * Bin entry. No "is main module" guard — npm bin symlinks make
 * process.argv[1] end in "uxloom", not "cli.js", and heuristics silently
 * fail (0.1.0 bug).
 *
 *   uxloom                start the MCP server on stdio
 *   uxloom init           set up this project: MCP config, agent skill, starter file
 *   uxloom check [file]   validate design completeness (exit 1 on errors)
 *   uxloom audit [file]   audit implementation drift (exit 1 on drift)
 *                         [--live <baseUrl>] verify markers in the real DOM
 *                         [--design <file|dir>] audit a design export vs the
 *                         contract [--scaffold <out>] draft unmapped screens
 *   uxloom preview [file] live mocks: themed, commentable, editable
 *   uxloom export [file]  shareable HTML [--out path] | --svg <dir> [--manifest] | --png <dir>
 *   uxloom diff …         semantic design diff (files or --git <ref>)
 *   Flags for check/audit: --json | --sarif | --github | --update-baseline
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { createServer } from "./server.js";
import { runCheck } from "./check.js";
import { runInit } from "./init.js";
import { runAuditCli } from "./audit-cli.js";
import { runPreview } from "./preview.js";
import { runExport } from "./preview-export.js";
import { runSvgExport } from "./export-svg.js";
import { runDiff } from "./diff.js";
import { updateNotice } from "./update-check.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
const argv = process.argv.slice(2);
const command = argv[0];

const VALUE_FLAGS = new Set(["--out", "--live", "--png", "--svg", "--design", "--scaffold"]);
const flags: string[] = [];
const values: Record<string, string> = {};
const positionals: string[] = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (VALUE_FLAGS.has(a)) values[a] = argv[++i];
  else if (a.startsWith("--")) flags.push(a);
  else positionals.push(a);
}
const fileArg = positionals[0];

if (command === "--version" || command === "-v" || command === "version") {
  console.log(version);
  process.exit(0);
} else if (command === "diff") {
  // diff owns its own arg parsing (files vs --git, --json/--markdown).
  runDiff(argv.slice(1));
} else if (
  command === "check" || command === "audit" || command === "init" ||
  command === "preview" || command === "export"
) {
  const machineOutput = flags.some((f) => ["--json", "--sarif", "--github"].includes(f));
  if (!machineOutput) {
    const notice = await updateNotice(version);
    if (notice) console.error(`\n▲ ${notice}\n`);
  }
  if (command === "check") runCheck(fileArg, flags);
  else if (command === "audit") {
    if (values["--design"]) {
      const { runDesignAuditCli } = await import("./design-audit-cli.js");
      await runDesignAuditCli(values["--design"], fileArg, flags, values["--scaffold"]);
    } else await runAuditCli(fileArg, flags, values["--live"]);
  } else if (command === "preview") runPreview(fileArg);
  else if (command === "export") {
    if (values["--svg"]) runSvgExport(fileArg, values["--svg"], { manifest: flags.includes("--manifest") });
    else if (values["--png"]) {
      const { runPngExport } = await import("./export-png.js");
      try {
        const count = await runPngExport(fileArg, values["--png"]);
        console.log(`✔ ${count} PNG(s) written to ${values["--png"]}`);
        process.exit(0);
      } catch (error) {
        console.error(`✖ ${String(error instanceof Error ? error.message : error)}`);
        process.exit(2);
      }
    } else runExport(fileArg, values["--out"]);
  } else runInit();
} else if (command === undefined) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error("uxloom mcp server failed:", error);
    process.exit(1);
  });
  void updateNotice(version).then((notice) => notice && console.error(notice));
} else {
  console.error(`unknown command: ${command}`);
  console.error("usage: uxloom                # start MCP server (stdio)");
  console.error("       uxloom init           # set up this project (MCP config + skill + starter file)");
  console.error("       uxloom check [file]   # design completeness   [--json|--sarif|--github|--update-baseline]");
  console.error("       uxloom audit [file]   # implementation drift  [--live <url>] [--json|--sarif|--github|--update-baseline]");
  console.error("                             #   [--design <file|dir>] audit a design export vs the contract [--scaffold <out>]");
  console.error("       uxloom preview [file] # live mocks: themed, commentable, editable");
  console.error("       uxloom export [file]  # shareable HTML [--out path] | --svg <dir> [--manifest] | --png <dir>");
  console.error("       uxloom diff <old> <new> | --git <ref> [file]   [--json|--markdown]");
  console.error("       uxloom --version      # print version");
  process.exit(2);
}
