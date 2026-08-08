/**
 * The live preview viewer: one self-contained page, zero dependencies.
 * Served by preview.ts; renders wireframe mocks for every screen, state,
 * and viewport directly from the contract, and walks journeys by clicking
 * events. Reloads over SSE when the project file changes.
 *
 * When the project declares design tokens, the mock content is themed
 * (accent, bg, surface, text, muted, radius, font); without tokens the
 * wireframe stays grayscale. Comment mode drops pins on the mock and
 * persists them via the /comments endpoints.
 *
 * renderStandalone() turns this same template into a static, shareable
 * HTML file: project data embedded, SSE and comment mode removed.
 */
export const PREVIEW_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UXLoom preview</title>
<style>
  :root {
    --bg: #eceeec; --panel: #f8f9f8; --ink: #2a2e2a; --dim: #6b706b;
    --line: #d2d6d2; --block: #ffffff; --blockline: #c4c9c4;
    --accent: #2f6b52; --warn: #b45309; --err: #b04338;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         background: var(--bg); color: var(--ink); height: 100vh; display: flex; }
  button { font: inherit; cursor: pointer; background: none; border: none; color: inherit; }

  /* sidebar */
  aside { width: 250px; flex-shrink: 0; background: var(--panel); border-right: 1px solid var(--line);
          overflow-y: auto; padding: 14px; }
  aside h1 { font-size: 15px; margin-bottom: 2px; }
  aside .sub { color: var(--dim); font-size: 12px; margin-bottom: 14px; }
  aside h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dim);
             margin: 14px 0 6px; }
  .jname { font-weight: 600; font-size: 13px; margin-top: 8px; }
  .jplat { color: var(--dim); font-weight: 400; font-size: 11px; margin-left: 5px; }
  .jstate, .snav { display: block; width: 100%; text-align: left; padding: 3px 8px; border-radius: 6px;
                   font-size: 13px; color: var(--ink); }
  .jstate:hover, .snav:hover { background: #e6e9e6; }
  .jstate.on, .snav.on { background: var(--accent); color: #fff; }
  .jstate small { color: inherit; opacity: .65; }
  .final-flag { opacity: .6; font-size: 11px; }

  /* main */
  main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
         border-bottom: 1px solid var(--line); background: var(--panel); flex-wrap: wrap; }
  .bar .grow { flex: 1; }
  .chip { font-size: 12px; color: var(--dim); border: 1px solid var(--line); border-radius: 999px;
          padding: 2px 10px; }
  .chip.live { border-color: var(--accent); color: var(--accent); }
  .vp, .tab { padding: 4px 10px; border-radius: 6px; font-size: 13px; border: 1px solid transparent; }
  .vp.on { background: var(--ink); color: #fff; }
  .tab { border-color: var(--line); }
  .tab.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .tab.undesigned { border-style: dashed; color: var(--dim); }
  .tabs { display: flex; gap: 6px; padding: 10px 16px 0; flex-wrap: wrap; }

  .stage { flex: 1; overflow: auto; display: flex; align-items: flex-start; justify-content: center;
           padding: 26px; }
  .stage.commenting .screen { cursor: crosshair; }
  .frame { background: #fff; border: 1px solid var(--line); border-radius: 12px;
           box-shadow: 0 8px 30px rgba(0,0,0,.08); overflow: hidden; flex-shrink: 0; }
  .frame.desktop { width: 960px; } .frame.tablet { width: 640px; } .frame.mobile { width: 390px; }
  .chrome { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: #eef0ee;
            border-bottom: 1px solid var(--line); font-size: 11px; color: var(--dim); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #cfd3cf; }
  .chrome .url { flex: 1; background: #fff; border: 1px solid var(--line); border-radius: 6px;
                 padding: 2px 10px; text-align: center; }
  .notch { flex: 1; text-align: center; }
  .screen { position: relative; padding: 14px; min-height: 420px; display: flex;
            flex-direction: column; gap: 10px;
            background: var(--mock-bg, transparent);
            color: var(--mock-text, var(--ink));
            font-family: var(--mock-font, inherit); }

  /* wireframe blocks — themed via --mock-* custom properties when the
     project declares tokens; grayscale defaults otherwise */
  .b { border: 1.5px solid var(--blockline); border-radius: var(--mock-radius, 8px);
       background: var(--block); padding: 10px 12px; position: relative; }
  .b .lab { font-size: 12px; color: var(--mock-muted, var(--dim)); }
  .b-header, .b-nav, .b-footer { background: #f1f3f1; display: flex; gap: 10px; align-items: center; }
  .b-nav .pill, .b-header .pill { width: 54px; height: 8px; border-radius: 4px; background: var(--blockline); }
  .b-hero { min-height: 90px; display: flex; align-items: center; justify-content: center; }
  .b-hero .copy { font-size: 17px; font-weight: 600; text-align: center; }
  .b-text .ln { height: 8px; border-radius: 4px; background: #e0e3e0; margin: 7px 0; }
  .b-text .ln:last-child { width: 60%; }
  .copy { font-size: 13px; white-space: pre-wrap; }
  .b-image { min-height: 80px;
    background: repeating-linear-gradient(45deg, #f4f5f4, #f4f5f4 8px, #e8eae8 8px, #e8eae8 9px);
    display: flex; align-items: center; justify-content: center; }
  .b-button { display: inline-block; background: var(--mock-accent, var(--ink)); color: #fff;
              border-radius: var(--mock-radius, 8px);
              padding: 9px 18px; font-size: 13px; align-self: flex-start; border: none; }
  .b-field { background: var(--block); } .b-field .inp { height: 30px; border: 1.5px solid var(--blockline);
              border-radius: 6px; margin-top: 5px; background: #fdfdfd; }
  .row { display: flex; gap: 10px; align-items: center; border: 1.5px solid var(--blockline);
         border-radius: var(--mock-radius, 8px); padding: 9px 12px; background: var(--block); }
  .row .av { width: 26px; height: 26px; border-radius: 50%; background: #e0e3e0; flex-shrink: 0; }
  .row .ln { height: 8px; border-radius: 4px; background: #e0e3e0; flex: 1; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .tbl { border: 1.5px solid var(--blockline); border-radius: var(--mock-radius, 8px);
         overflow: hidden; background: var(--block); }
  .tbl .tr { display: flex; border-top: 1px solid #e4e7e4; }
  .tbl .tr:first-child { border-top: none; background: #f1f3f1; }
  .tbl .td { flex: 1; padding: 8px; } .tbl .td .ln { height: 8px; border-radius: 4px; background: #e0e3e0; }
  .tbl .td.hd { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
                color: var(--mock-muted, var(--dim)); }
  .srcchip { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
             font-size: 10px; color: var(--mock-muted, var(--dim)); border: 1px solid var(--blockline);
             border-radius: 4px; padding: 0 5px; margin-top: 5px; align-self: flex-start; }
  .kids { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }

  /* state treatments */
  .skel .b, .skel .row, .skel .tbl { border-color: #e4e7e4; }
  .skel .ln, .skel .pill, .skel .av, .skel .inp, .skel .b-image, .skel .b-button, .skel .copy {
    background: linear-gradient(90deg, #ececec 25%, #f7f7f7 50%, #ececec 75%);
    background-size: 200% 100%; animation: shimmer 1.4s infinite; color: transparent; border-color: transparent; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .skel * { animation: none !important; } }
  .banner { border: 1.5px solid var(--err); background: #fdf3f2; color: var(--err);
            border-radius: 8px; padding: 10px 12px; font-size: 13px; }
  .dimmed { opacity: .35; pointer-events: none; }
  .emptybox { border: 2px dashed var(--blockline); border-radius: 10px; padding: 34px 16px;
              text-align: center; color: var(--mock-muted, var(--dim)); }
  .overlay { position: absolute; inset: 0; background: rgba(42,46,42,.35); display: flex;
             align-items: center; justify-content: center; border-radius: 0 0 10px 10px; }
  .modal { background: var(--block); border-radius: var(--mock-radius, 12px); padding: 18px;
           width: min(85%, 340px); box-shadow: 0 12px 40px rgba(0,0,0,.25); }
  .modal h4 { font-size: 13px; margin-bottom: 8px; }

  /* events + meta */
  .meta { border-top: 1px solid var(--line); background: var(--panel); padding: 10px 16px;
          display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .meta .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dim); }
  .ev { border: 1px solid var(--accent); color: var(--accent); border-radius: 999px;
        padding: 3px 12px; font-size: 12.5px; }
  .ev:hover { background: var(--accent); color: #fff; }
  .ev small { opacity: .7; }
  .ev .g { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px;
           opacity: .85; margin-left: 4px; }
  .note { font-size: 12px; color: var(--warn); }
  .datameta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
              color: var(--dim); }
  .err-load { margin: auto; color: var(--err); }

  /* comment mode */
  .cbtn { border: 1px solid var(--line); border-radius: 999px; padding: 3px 12px; font-size: 12.5px; }
  .cbtn.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .cbtn .cnt { display: inline-block; margin-left: 6px; min-width: 17px; text-align: center;
               border-radius: 999px; background: var(--accent); color: #fff; font-size: 11px; padding: 0 4px; }
  .cbtn.on .cnt { background: #fff; color: var(--accent); }
  .pinwrap { position: absolute; transform: translate(-50%, -50%); z-index: 5; }
  .pin { width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: #fff;
         font-size: 11px; line-height: 20px; text-align: center; padding: 0;
         box-shadow: 0 2px 6px rgba(0,0,0,.35); }
  .pinpop { display: none; position: absolute; top: 24px; left: -4px; background: #fff;
            color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px;
            width: 210px; font-size: 12.5px; box-shadow: 0 8px 24px rgba(0,0,0,.2); z-index: 6;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  .pinwrap:hover .pinpop, .pinwrap.open .pinpop, .pinwrap:focus-within .pinpop { display: block; }
  .pinpop .resolve { margin-top: 6px; border: 1px solid var(--accent); color: var(--accent);
                     border-radius: 6px; padding: 2px 10px; font-size: 12px; }
  .pinpop .resolve:hover { background: var(--accent); color: #fff; }
  .cform { position: absolute; z-index: 7; background: #fff; border: 1px solid var(--line);
           border-radius: 8px; padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.25); width: 230px;
           font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  .cform input { width: 100%; font: inherit; font-size: 12.5px; padding: 4px 6px;
                 border: 1px solid var(--line); border-radius: 6px; }
  .cform .acts { display: flex; gap: 6px; margin-top: 6px; justify-content: flex-end; }
  .cform .acts button { font-size: 12px; border: 1px solid var(--line); border-radius: 6px; padding: 2px 10px; }
  .cform .acts .save { background: var(--accent); color: #fff; border-color: var(--accent); }
</style>
</head>
<body>
<aside id="side"></aside>
<main>
  <div class="bar" id="bar"></div>
  <div class="tabs" id="tabs"></div>
  <div class="stage" id="stage"></div>
  <div class="meta" id="meta"></div>
</main>
<script>
"use strict";
var STATIC_INFO = null;
/*__UXLOOM_STATIC__*/
var data = null, comments = [], sel = { screen: null, state: "default" }, viewport = "desktop";
var commentMode = false;

function h(tag, cls, text) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
function screenById(id) { return (data.screens || []).find(function (s) { return s.id === id; }); }
function splitTarget(ref) {
  var i = ref.indexOf("#");
  return i < 0 ? { state: ref } : { state: ref.slice(0, i), screenState: ref.slice(i + 1) };
}
/* an "on" value is either "target" or { target, guard?, roles? } */
function normOn(v) { return typeof v === "string" ? { target: v } : (v || {}); }
function pick(screenId, stateId) {
  sel = { screen: screenId, state: stateId || "default" };
  render();
}
function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}

/* -------- theme: apply project tokens; grayscale when absent -------- */
function applyTheme() {
  var r = document.documentElement.style;
  ["--accent", "--mock-accent", "--mock-bg", "--block", "--mock-text", "--mock-muted",
   "--mock-radius", "--mock-font"].forEach(function (p) { r.removeProperty(p); });
  var t = data && data.tokens;
  if (!t) return;
  var c = t.colors || {};
  if (c.accent) { r.setProperty("--accent", c.accent); r.setProperty("--mock-accent", c.accent); }
  if (c.bg) r.setProperty("--mock-bg", c.bg);
  if (c.surface) r.setProperty("--block", c.surface);
  if (c.text) r.setProperty("--mock-text", c.text);
  if (c.muted) r.setProperty("--mock-muted", c.muted);
  if (typeof t.radius === "number") r.setProperty("--mock-radius", t.radius + "px");
  if (t.font) r.setProperty("--mock-font", t.font);
}

/* ---------- derive blocks when a screen declares no layout ---------- */
function autoBlocks(screen) {
  var blocks = [{ type: "header", label: screen.id }];
  if (screen.intent) blocks.push({ type: "text", label: screen.intent });
  var hasList = false;
  (screen.components || []).forEach(function (c) {
    var s = (c.semantic || "").toLowerCase();
    if (s.indexOf("button") === 0) blocks.push({ type: "button", label: c.label && c.label.en || c.semantic });
    else if (s.indexOf("input") === 0 || s.indexOf("field") === 0)
      blocks.push({ type: "field", label: c.label && c.label.en || c.semantic });
    else if (s.indexOf("list") === 0 || s.indexOf("table") === 0) { blocks.push({ type: "list", label: c.semantic }); hasList = true; }
    else if (s.indexOf("nav") === 0) blocks.splice(1, 0, { type: "nav", label: c.semantic });
    else blocks.push({ type: "card", label: c.semantic });
  });
  if (!hasList) blocks.push({ type: "list", label: "Content", count: 3 });
  return blocks;
}

function renderBlock(b) {
  var el, i, j, n = b.count || 3;
  switch (b.type) {
    case "list":
      el = h("div", "kids");
      for (i = 0; i < n; i++) { var r = h("div", "row"); r.appendChild(h("div", "av")); r.appendChild(h("div", "ln")); el.appendChild(r); }
      break;
    case "card":
      el = h("div", "cards");
      for (i = 0; i < (b.count || 2); i++) { var c = h("div", "b"); c.appendChild(h("div", "lab", b.label || "Card")); c.appendChild(h("div", "b-text")).appendChild(h("div", "ln")); el.appendChild(c); }
      break;
    case "table":
      el = h("div", "tbl");
      var cols = (b.columns && b.columns.length) ? b.columns : null;
      var ncol = cols ? cols.length : 3;
      var hr = h("div", "tr");
      for (j = 0; j < ncol; j++) {
        var hd = h("div", "td" + (cols ? " hd" : ""));
        if (cols) hd.textContent = cols[j]; else hd.appendChild(h("div", "ln"));
        hr.appendChild(hd);
      }
      el.appendChild(hr);
      for (i = 0; i < n; i++) { var tr = h("div", "tr"); for (j = 0; j < ncol; j++) tr.appendChild(h("div", "td")).appendChild(h("div", "ln")); el.appendChild(tr); }
      break;
    case "button": el = h("button", "b-button", b.label || "Action"); break;
    case "field": el = h("div", "b b-field"); el.appendChild(h("div", "lab", b.label || "Field")); el.appendChild(h("div", "inp")); break;
    case "text":
      el = h("div", "b b-text"); if (b.label) el.appendChild(h("div", "lab", b.label));
      if (b.copy) { el.appendChild(h("div", "copy", b.copy)); }
      else { el.appendChild(h("div", "ln")); el.appendChild(h("div", "ln")); }
      break;
    case "image": el = h("div", "b b-image"); el.appendChild(h("span", "lab", b.label || "image")); break;
    case "hero":
      el = h("div", "b b-hero");
      if (b.copy) el.appendChild(h("span", "copy", b.copy));
      else el.appendChild(h("span", "lab", b.label || "Hero"));
      break;
    case "header": case "nav": case "footer":
      el = h("div", "b b-" + b.type); el.appendChild(h("span", "lab", b.label || b.type));
      el.appendChild(h("span", "pill")); el.appendChild(h("span", "pill")); break;
    case "form":
      el = h("div", "b"); el.appendChild(h("div", "lab", b.label || "Form"));
      var kk = h("div", "kids"); (b.children || [{ type: "field" }, { type: "field" }, { type: "button", label: "Submit" }]).forEach(function (ch) { kk.appendChild(renderBlock(ch)); }); el.appendChild(kk); break;
    default:
      el = h("div", "b"); el.appendChild(h("div", "lab", b.label || b.type));
  }
  if (b.children && b.type !== "form") {
    var kids = h("div", "kids");
    b.children.forEach(function (ch) { kids.appendChild(renderBlock(ch)); });
    el.appendChild(kids);
  }
  if (b.source) el.appendChild(h("span", "srcchip", b.source));
  return el;
}

function renderScreenBody(screen, stateId) {
  var body = h("div", "screen");
  body.setAttribute("data-ux-screen", screen.id);
  body.setAttribute("data-ux-state", stateId);
  var blocks = (screen.layout && screen.layout.blocks) || autoBlocks(screen);
  var isError = stateId.indexOf("error") === 0;
  var baseline = stateId === "default" || stateId === "empty" || stateId === "loading";
  var content = h("div", stateId === "loading" ? "skel" : "");
  content.style.display = "flex"; content.style.flexDirection = "column"; content.style.gap = "10px";

  if (stateId === "empty") {
    blocks.filter(function (b) { return ["header", "nav"].indexOf(b.type) >= 0; })
      .forEach(function (b) { content.appendChild(renderBlock(b)); });
    var eb = h("div", "emptybox");
    eb.appendChild(h("div", null, "Nothing here yet"));
    eb.appendChild(h("small", null, screen.intent || "Empty state — first-run guidance goes here"));
    content.appendChild(eb);
  } else {
    blocks.forEach(function (b) { content.appendChild(renderBlock(b)); });
  }

  if (isError) {
    body.appendChild(h("div", "banner", "\\u26a0 " + stateId + " — what went wrong and how to fix it"));
    content.className += " dimmed";
  }
  body.appendChild(content);

  if (!baseline && !isError) { // custom states render as overlays over the default
    var ov = h("div", "overlay"), mo = h("div", "modal");
    mo.appendChild(h("h4", null, stateId));
    mo.appendChild(h("div", "b-text")).appendChild(h("div", "ln"));
    mo.appendChild(h("button", "b-button", "Confirm"));
    ov.appendChild(mo); body.appendChild(ov);
  }
  return body;
}

/* --------------------------- comment mode --------------------------- */
function openCommentsFor(screenId) {
  return comments.filter(function (c) { return !c.resolved && c.screen === screenId; });
}

function attachComments(body, screen) {
  var mine = comments.filter(function (c) {
    return !c.resolved && c.screen === screen.id && c.state === sel.state;
  });
  mine.forEach(function (c, i) {
    var w = h("div", "pinwrap");
    w.style.left = c.x + "%"; w.style.top = c.y + "%";
    var p = h("button", "pin", String(i + 1));
    p.setAttribute("aria-label", "Comment " + (i + 1) + ": " + c.text);
    p.onclick = function (e) { e.stopPropagation(); w.classList.toggle("open"); };
    var pop = h("div", "pinpop");
    pop.appendChild(h("div", null, c.text));
    var rb = h("button", "resolve", "Resolve");
    rb.onclick = function (e) {
      e.stopPropagation();
      postJson("/comments/resolve", { id: c.id }).then(function () {
        c.resolved = true; render();
      }).catch(function () {});
    };
    pop.appendChild(rb);
    pop.onclick = function (e) { e.stopPropagation(); };
    w.appendChild(p); w.appendChild(pop);
    body.appendChild(w);
  });
  if (commentMode) body.addEventListener("click", function (e) { placePin(e, body, screen); });
}

function placePin(e, body, screen) {
  var existing = body.querySelector(".cform");
  if (existing) { existing.remove(); return; }
  if (e.target.closest && e.target.closest(".pinwrap")) return;
  var rect = body.getBoundingClientRect();
  var x = Math.round((e.clientX - rect.left) / rect.width * 1000) / 10;
  var y = Math.round((e.clientY - rect.top) / rect.height * 1000) / 10;
  var form = h("div", "cform");
  form.style.left = Math.min(Math.max(x, 2), 68) + "%";
  form.style.top = Math.min(Math.max(y, 2), 88) + "%";
  var inp = h("input");
  inp.setAttribute("type", "text");
  inp.setAttribute("placeholder", "Leave a comment\\u2026");
  inp.setAttribute("aria-label", "Comment text");
  var save = h("button", "save", "Add"), cancel = h("button", null, "Cancel");
  function submit() {
    var text = inp.value.trim();
    if (!text) return;
    postJson("/comments", { screen: screen.id, state: sel.state, x: x, y: y, text: text })
      .then(function (c) { comments.push(c); render(); })
      .catch(function () { form.remove(); });
  }
  save.onclick = function (ev) { ev.stopPropagation(); submit(); };
  cancel.onclick = function (ev) { ev.stopPropagation(); form.remove(); };
  inp.onkeydown = function (ev) {
    if (ev.key === "Enter") submit();
    if (ev.key === "Escape") form.remove();
  };
  form.onclick = function (ev) { ev.stopPropagation(); };
  var acts = h("div", "acts"); acts.appendChild(cancel); acts.appendChild(save);
  form.appendChild(inp); form.appendChild(acts);
  body.appendChild(form);
  inp.focus();
}

/* ------------------------------ chrome ------------------------------ */
function chromeFor(vp) {
  var c = h("div", "chrome");
  var native = (data.platforms || []).some(function (p) { return p === "ios" || p === "android"; });
  if (vp === "mobile" && native && (data.platforms || []).indexOf("web") < 0 && (data.platforms || []).indexOf("mweb") < 0) {
    c.appendChild(h("span", "notch", "9:41 \\u2014 " + data.platforms.join(" / ")));
  } else if (vp === "mobile") {
    c.appendChild(h("span", "notch", "9:41 \\u2014 mobile web"));
  } else {
    c.appendChild(h("span", "dot")); c.appendChild(h("span", "dot")); c.appendChild(h("span", "dot"));
    c.appendChild(h("span", "url", (data.name || "app") + ".example.com"));
  }
  return c;
}

/* ------------------------------ render ------------------------------ */
function render() {
  if (!data) return;
  if (!sel.screen && data.screens && data.screens.length) sel.screen = data.screens[0].id;
  var screen = screenById(sel.screen);

  // sidebar
  var side = document.getElementById("side"); side.innerHTML = "";
  side.appendChild(h("h1", null, "UXLoom preview"));
  side.appendChild(h("div", "sub", data.name + " \\u00b7 " + (data.platforms || []).join(", ")));
  side.appendChild(h("h2", null, "Journeys"));
  (data.journeys || []).forEach(function (j) {
    var jn = h("div", "jname");
    jn.appendChild(document.createTextNode(j.id));
    if (j.platforms && j.platforms.length) jn.appendChild(h("small", "jplat", j.platforms.join(" \\u00b7 ")));
    side.appendChild(jn);
    Object.keys(j.states).forEach(function (stateName) {
      var js = j.states[stateName];
      var b = h("button", "jstate" + (screen && js.screen === screen.id ? " on" : ""));
      b.appendChild(document.createTextNode(stateName + " "));
      var sm = h("small", null, "\\u2192 " + js.screen + (js.final ? " \\u2713" : ""));
      b.appendChild(sm);
      b.onclick = function () { pick(js.screen, "default"); };
      side.appendChild(b);
    });
  });
  side.appendChild(h("h2", null, "Screens"));
  (data.screens || []).forEach(function (s) {
    var b = h("button", "snav" + (screen && s.id === screen.id ? " on" : ""), s.id);
    b.onclick = function () { pick(s.id, "default"); };
    side.appendChild(b);
  });

  // bar
  var bar = document.getElementById("bar"); bar.innerHTML = "";
  ["desktop", "tablet", "mobile"].forEach(function (vp) {
    var b = h("button", "vp" + (viewport === vp ? " on" : ""), vp);
    b.onclick = function () { viewport = vp; render(); };
    bar.appendChild(b);
  });
  bar.appendChild(h("div", "grow"));
  if (screen) {
    var req = screen.requiredStates.length;
    var des = screen.requiredStates.filter(function (s) { return screen.designedStates.indexOf(s) >= 0; }).length;
    bar.appendChild(h("span", "chip", "coverage " + des + "/" + req));
  }
  if (!STATIC_INFO && screen) {
    var openCount = openCommentsFor(screen.id).length;
    var cb = h("button", "cbtn" + (commentMode ? " on" : ""));
    cb.appendChild(document.createTextNode("\\ud83d\\udcac comment"));
    if (openCount) cb.appendChild(h("span", "cnt", String(openCount)));
    cb.setAttribute("aria-pressed", commentMode ? "true" : "false");
    cb.title = "Comment mode: click the mock to leave a pinned note";
    cb.onclick = function () { commentMode = !commentMode; render(); };
    bar.appendChild(cb);
  }
  if (STATIC_INFO) bar.appendChild(h("span", "chip", "static export \\u00b7 " + STATIC_INFO.generated));
  else bar.appendChild(h("span", "chip live", "\\u25cf live"));

  // tabs
  var tabs = document.getElementById("tabs"); tabs.innerHTML = "";
  if (screen) screen.requiredStates.forEach(function (st) {
    var designed = screen.designedStates.indexOf(st) >= 0;
    var t = h("button", "tab" + (sel.state === st ? " on" : "") + (designed ? "" : " undesigned"), st + (designed ? "" : " \\u25cb"));
    t.title = designed ? st : st + " — contracted but not designed yet";
    t.onclick = function () { sel.state = st; render(); };
    tabs.appendChild(t);
  });

  // stage
  var stage = document.getElementById("stage"); stage.innerHTML = "";
  stage.className = "stage" + (commentMode && !STATIC_INFO ? " commenting" : "");
  if (!screen) { stage.appendChild(h("div", "err-load", "No screens in the project yet — ask your agent to design some.")); }
  else {
    var frame = h("div", "frame " + viewport);
    frame.appendChild(chromeFor(viewport));
    var body = renderScreenBody(screen, sel.state);
    if (!STATIC_INFO) attachComments(body, screen);
    frame.appendChild(body);
    stage.appendChild(frame);
  }

  // meta: outgoing events for journey states showing this screen + exemptions
  var meta = document.getElementById("meta"); meta.innerHTML = "";
  if (screen) {
    var events = [];
    (data.journeys || []).forEach(function (j) {
      Object.keys(j.states).forEach(function (sn) {
        var js = j.states[sn];
        if (js.screen !== screen.id) return;
        Object.keys(js.on || {}).forEach(function (ev) {
          var o = normOn(js.on[ev]);
          if (!o.target) return;
          events.push({ ev: ev, target: o.target, guard: o.guard, roles: o.roles, journey: j.id });
        });
      });
    });
    if (events.length) {
      meta.appendChild(h("span", "lbl", "Events"));
      events.forEach(function (e) {
        var t = splitTarget(e.target);
        var jj = (data.journeys || []).find(function (x) { return x.id === e.journey; });
        var targetState = jj && jj.states[t.state];
        var b = h("button", "ev");
        b.appendChild(document.createTextNode(e.ev + " "));
        b.appendChild(h("small", null, "\\u2192 " + (targetState ? targetState.screen : t.state) + (t.screenState ? "#" + t.screenState : "")));
        if (e.guard) b.appendChild(h("span", "g", "[if " + e.guard + "]"));
        if (e.roles && e.roles.length) b.appendChild(h("span", "g", "[" + e.roles.join("|") + "]"));
        b.onclick = function () { if (targetState) pick(targetState.screen, t.screenState || "default"); };
        meta.appendChild(b);
      });
    }
    if (screen.data) {
      var fields = Object.keys(screen.data);
      if (fields.length) meta.appendChild(h("span", "datameta",
        "data: " + fields.map(function (k) { return k + ": " + screen.data[k]; }).join(", ")));
    }
    (screen.exemptions || []).forEach(function (ex) {
      meta.appendChild(h("span", "note", "exempt " + ex.state + ": " + ex.reason));
    });
  }
}

function boot(p) {
  data = p;
  if (sel.screen && !screenById(sel.screen)) sel = { screen: null, state: "default" };
  var hasDesktop = (data.platforms || []).indexOf("web") >= 0;
  if (!hasDesktop && viewport === "desktop") viewport = "mobile";
  applyTheme();
  render();
}

function load() {
  if (STATIC_INFO) { boot(STATIC_INFO.data); return; }
  Promise.all([
    fetch("/project").then(function (r) { return r.json(); }),
    fetch("/comments").then(function (r) { return r.json(); }).catch(function () { return { comments: [] }; })
  ]).then(function (rs) {
    var p = rs[0];
    if (p && p.error) throw new Error(p.error);
    comments = (rs[1] && rs[1].comments) || [];
    boot(p);
  }).catch(function (e) {
    document.getElementById("stage").innerHTML = "";
    document.getElementById("stage").appendChild(h("div", "err-load", "Cannot load project: " + e.message));
  });
}
/*__UXLOOM_LIVE__*/
new EventSource("/events").onmessage = function () { load(); };
/*__UXLOOM_LIVE_END__*/
load();
</script>
</body>
</html>`;

const STATIC_MARKER = "/*__UXLOOM_STATIC__*/";
const LIVE_START = "/*__UXLOOM_LIVE__*/";
const LIVE_END = "/*__UXLOOM_LIVE_END__*/";

/**
 * Turn the live template into one self-contained HTML file: project data
 * embedded in place of fetch("/project"), SSE removed (the bar shows
 * "static export · <date>" instead of "live"), comment mode hidden.
 */
export function renderStandalone(projectJson: string): string {
  // Re-serialize so the embedded payload is exactly one JSON expression,
  // then escape "<" to keep "</script>" sequences inert inside the tag.
  const embedded = JSON.stringify(JSON.parse(projectJson)).replace(/</g, "\\u003c");
  const generated = new Date().toISOString().slice(0, 10);
  const bootstrap =
    "STATIC_INFO = { generated: " + JSON.stringify(generated) + ", data: " + embedded + " };";
  let html = PREVIEW_TEMPLATE.replace(STATIC_MARKER, bootstrap);
  const start = html.indexOf(LIVE_START);
  const end = html.indexOf(LIVE_END);
  if (start >= 0 && end > start) {
    html = html.slice(0, start) + html.slice(end + LIVE_END.length);
  }
  return html;
}
