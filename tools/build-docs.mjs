/**
 * Docs-site generator (RFC 0004 R15): renders the repo's own markdown —
 * quickstart, skill references, process docs, RFCs — into a single
 * navigable page at docs/docs.html. Runs in release-prep, so the site's
 * documentation is generated from the same files that ship: it cannot
 * drift from the truth. Zero dependencies.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = [
  { id: "quickstart", title: "Quickstart", path: "QUICKSTART.md" },
  { id: "format", title: "JourneyGraph format", path: "packages/mcp-server/skills/uxloom/references/format.md" },
  { id: "critics", title: "Critics & finding codes", path: "packages/mcp-server/skills/uxloom/references/critics.md" },
  { id: "audit", title: "Implementation audit", path: "packages/mcp-server/skills/uxloom/references/audit.md" },
  { id: "releasing", title: "Release process", path: "RELEASING.md" },
  { id: "positioning", title: "Positioning", path: "POSITIONING.md" },
  { id: "rfc-0003", title: "RFC 0003 — Company release", path: "rfcs/0003-company-release.md" },
  { id: "rfc-0004", title: "RFC 0004 — Frontier release", path: "rfcs/0004-frontier-release.md" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) =>
      `<a href="${u.startsWith("http") ? u : "https://github.com/uxloom-dev/uxloom/blob/main/" + u}">${t}</a>`);
}

/** Small, honest markdown-subset renderer for our own docs. */
export function renderMarkdown(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0, inCode = false, listStack = null, inTable = false;
  const closeList = () => { if (listStack) { out.push(listStack === "ul" ? "</ul>" : "</ol>"); listStack = null; } };
  const closeTable = () => { if (inTable) { out.push("</tbody></table></div>"); inTable = false; } };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      closeList(); closeTable();
      out.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode; i++; continue;
    }
    if (inCode) { out.push(esc(line)); i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      closeList(); closeTable();
      const level = h[1].length;
      out.push(`<h${level + 1}>${inline(h[2])}</h${level + 1}>`);
      i++; continue;
    }
    if (/^\s*---+\s*$/.test(line)) { closeList(); closeTable(); out.push("<hr>"); i++; continue; }
    if (line.startsWith("|")) {
      closeList();
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) { i++; continue; } // separator row
      if (!inTable) { out.push('<div class="tblwrap"><table><tbody>'); inTable = true; }
      out.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
      i++; continue;
    }
    closeTable();
    const li = line.match(/^\s*[-*]\s+(.*)/);
    const oli = line.match(/^\s*\d+\.\s+(.*)/);
    if (li || oli) {
      const want = li ? "ul" : "ol";
      if (listStack !== want) { closeList(); out.push(`<${want}>`); listStack = want; }
      out.push(`<li>${inline((li ?? oli)[1])}</li>`);
      i++; continue;
    }
    closeList();
    if (line.startsWith(">")) { out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`); i++; continue; }
    if (line.trim() === "") { i++; continue; }
    // paragraph: absorb consecutive plain lines
    const para = [line];
    while (i + 1 < lines.length && lines[i + 1].trim() !== "" &&
           !/^(#{1,4}\s|```|\||[-*]\s|\d+\.\s|>)/.test(lines[i + 1].trim())) {
      para.push(lines[++i]);
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
    i++;
  }
  closeList(); closeTable();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

const sections = SOURCES.map((s) => ({
  ...s,
  html: renderMarkdown(readFileSync(join(root, s.path), "utf8")),
}));

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UXLoom documentation</title>
<link rel="canonical" href="https://uxloom.dev/docs.html">
<meta name="description" content="UXLoom documentation: quickstart, JourneyGraph format, critics and finding codes, implementation audit, release process.">
<style>
  :root { --ink:#0f1210; --ink-2:#141816; --line:#2a312c; --text:#e9e6dc; --dim:#a5a89c;
          --thread:#d9a441; --thread-2:#7fb8a2;
          --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
          --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
          --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--ink); color:var(--text); font:16px/1.65 var(--sans); display:flex; min-height:100vh; }
  a { color:var(--thread); text-decoration:none; } a:hover { text-decoration:underline; }
  nav { width:250px; flex-shrink:0; border-right:1px solid var(--line); padding:26px 20px; position:sticky; top:0; height:100vh; overflow-y:auto; }
  nav .brand { font-family:var(--serif); font-size:19px; margin-bottom:2px; display:block; color:var(--text); }
  nav .sub { color:var(--dim); font-size:12px; margin-bottom:20px; }
  nav a.item { display:block; padding:5px 8px; border-radius:6px; font-size:14px; color:var(--dim); }
  nav a.item:hover { background:var(--ink-2); color:var(--text); text-decoration:none; }
  main { flex:1; max-width:820px; padding:34px 40px 80px; }
  section { margin-bottom:56px; }
  h2 { font-family:var(--serif); font-size:1.9rem; margin:18px 0 12px; }
  h3 { font-family:var(--serif); font-size:1.35rem; margin:26px 0 8px; }
  h4, h5 { margin:20px 0 6px; }
  p, li, blockquote, td { color:var(--dim); }
  p strong, li strong { color:var(--text); }
  ul, ol { padding-left:1.4rem; margin:8px 0; } li { margin:4px 0; }
  code { font-family:var(--mono); font-size:.87em; background:var(--ink-2); color:var(--thread-2); padding:1px 5px; border-radius:4px; }
  pre { background:var(--ink-2); border:1px solid var(--line); border-radius:8px; padding:14px 16px; overflow-x:auto; margin:12px 0; }
  pre code { background:none; padding:0; color:var(--text); }
  blockquote { border-left:3px solid var(--thread); padding-left:12px; margin:10px 0; }
  .tblwrap { overflow-x:auto; margin:12px 0; }
  table { border-collapse:collapse; min-width:480px; }
  td { border:1px solid var(--line); padding:7px 11px; font-size:14px; }
  tr:first-child td { color:var(--text); font-weight:600; background:var(--ink-2); }
  hr { border:none; border-top:1px solid var(--line); margin:22px 0; }
  @media (max-width:800px){ body{flex-direction:column} nav{width:100%;height:auto;position:static} }
</style>
</head>
<body>
<nav>
  <a class="brand" href="/">UXLoom</a>
  <div class="sub">documentation — generated from the shipped sources</div>
  ${sections.map((s) => `<a class="item" href="#${s.id}">${s.title}</a>`).join("\n  ")}
</nav>
<main>
${sections.map((s) => `<section id="${s.id}">\n${s.html}\n</section>`).join("\n")}
</main>
</body>
</html>
`;

writeFileSync(join(root, "docs", "docs.html"), page);
console.log(`docs built: docs/docs.html (${sections.length} sections)`);
