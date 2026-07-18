/**
 * The live preview viewer: one self-contained page, zero dependencies.
 * Served by preview.ts; renders wireframe mocks for every screen, state,
 * and viewport directly from the contract, and walks journeys by clicking
 * events. Reloads over SSE when the project file changes.
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
            flex-direction: column; gap: 10px; }

  /* wireframe blocks */
  .b { border: 1.5px solid var(--blockline); border-radius: 8px; background: var(--block);
       padding: 10px 12px; position: relative; }
  .b .lab { font-size: 12px; color: var(--dim); }
  .b-header, .b-nav, .b-footer { background: #f1f3f1; display: flex; gap: 10px; align-items: center; }
  .b-nav .pill, .b-header .pill { width: 54px; height: 8px; border-radius: 4px; background: var(--blockline); }
  .b-hero { min-height: 90px; display: flex; align-items: center; justify-content: center; }
  .b-text .ln { height: 8px; border-radius: 4px; background: #e0e3e0; margin: 7px 0; }
  .b-text .ln:last-child { width: 60%; }
  .b-image { min-height: 80px;
    background: repeating-linear-gradient(45deg, #f4f5f4, #f4f5f4 8px, #e8eae8 8px, #e8eae8 9px);
    display: flex; align-items: center; justify-content: center; }
  .b-button { display: inline-block; background: var(--ink); color: #fff; border-radius: 8px;
              padding: 9px 18px; font-size: 13px; align-self: flex-start; border: none; }
  .b-field { background: #fff; } .b-field .inp { height: 30px; border: 1.5px solid var(--blockline);
              border-radius: 6px; margin-top: 5px; background: #fdfdfd; }
  .row { display: flex; gap: 10px; align-items: center; border: 1.5px solid var(--blockline);
         border-radius: 8px; padding: 9px 12px; background: var(--block); }
  .row .av { width: 26px; height: 26px; border-radius: 50%; background: #e0e3e0; flex-shrink: 0; }
  .row .ln { height: 8px; border-radius: 4px; background: #e0e3e0; flex: 1; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .tbl { border: 1.5px solid var(--blockline); border-radius: 8px; overflow: hidden; }
  .tbl .tr { display: flex; border-top: 1px solid #e4e7e4; }
  .tbl .tr:first-child { border-top: none; background: #f1f3f1; }
  .tbl .td { flex: 1; padding: 8px; } .tbl .td .ln { height: 8px; border-radius: 4px; background: #e0e3e0; }
  .kids { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }

  /* state treatments */
  .skel .b, .skel .row, .skel .tbl { border-color: #e4e7e4; }
  .skel .ln, .skel .pill, .skel .av, .skel .inp, .skel .b-image, .skel .b-button {
    background: linear-gradient(90deg, #ececec 25%, #f7f7f7 50%, #ececec 75%);
    background-size: 200% 100%; animation: shimmer 1.4s infinite; color: transparent; border-color: transparent; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .skel * { animation: none !important; } }
  .banner { border: 1.5px solid var(--err); background: #fdf3f2; color: var(--err);
            border-radius: 8px; padding: 10px 12px; font-size: 13px; }
  .dimmed { opacity: .35; pointer-events: none; }
  .emptybox { border: 2px dashed var(--blockline); border-radius: 10px; padding: 34px 16px;
              text-align: center; color: var(--dim); }
  .overlay { position: absolute; inset: 0; background: rgba(42,46,42,.35); display: flex;
             align-items: center; justify-content: center; border-radius: 0 0 10px 10px; }
  .modal { background: #fff; border-radius: 12px; padding: 18px; width: min(85%, 340px);
           box-shadow: 0 12px 40px rgba(0,0,0,.25); }
  .modal h4 { font-size: 13px; margin-bottom: 8px; }

  /* events + meta */
  .meta { border-top: 1px solid var(--line); background: var(--panel); padding: 10px 16px;
          display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .meta .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dim); }
  .ev { border: 1px solid var(--accent); color: var(--accent); border-radius: 999px;
        padding: 3px 12px; font-size: 12.5px; }
  .ev:hover { background: var(--accent); color: #fff; }
  .ev small { opacity: .7; }
  .note { font-size: 12px; color: var(--warn); }
  .err-load { margin: auto; color: var(--err); }
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
var data = null, sel = { screen: null, state: "default" }, viewport = "desktop";

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
function pick(screenId, stateId) {
  sel = { screen: screenId, state: stateId || "default" };
  render();
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
  var el, i, n = b.count || 3;
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
      for (i = 0; i < n + 1; i++) { var tr = h("div", "tr"); for (var j = 0; j < 3; j++) tr.appendChild(h("div", "td")).appendChild(h("div", "ln")); el.appendChild(tr); }
      break;
    case "button": el = h("button", "b-button", b.label || "Action"); break;
    case "field": el = h("div", "b b-field"); el.appendChild(h("div", "lab", b.label || "Field")); el.appendChild(h("div", "inp")); break;
    case "text": el = h("div", "b b-text"); if (b.label) el.appendChild(h("div", "lab", b.label)); el.appendChild(h("div", "ln")); el.appendChild(h("div", "ln")); break;
    case "image": el = h("div", "b b-image"); el.appendChild(h("span", "lab", b.label || "image")); break;
    case "hero": el = h("div", "b b-hero"); el.appendChild(h("span", "lab", b.label || "Hero")); break;
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
    side.appendChild(h("div", "jname", j.id));
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
  bar.appendChild(h("span", "chip live", "\\u25cf live"));

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
  if (!screen) { stage.appendChild(h("div", "err-load", "No screens in the project yet — ask your agent to design some.")); }
  else {
    var frame = h("div", "frame " + viewport);
    frame.appendChild(chromeFor(viewport));
    frame.appendChild(renderScreenBody(screen, sel.state));
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
        Object.keys(js.on || {}).forEach(function (ev) { events.push({ ev: ev, target: js.on[ev], journey: j.id }); });
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
        b.onclick = function () { if (targetState) pick(targetState.screen, t.screenState || "default"); };
        meta.appendChild(b);
      });
    }
    (screen.exemptions || []).forEach(function (ex) {
      meta.appendChild(h("span", "note", "exempt " + ex.state + ": " + ex.reason));
    });
  }
}

function load() {
  fetch("/project").then(function (r) { return r.json(); }).then(function (p) {
    if (p && p.error) throw new Error(p.error);
    data = p;
    if (sel.screen && !screenById(sel.screen)) sel = { screen: null, state: "default" };
    var hasDesktop = (data.platforms || []).indexOf("web") >= 0;
    if (!hasDesktop && viewport === "desktop") viewport = "mobile";
    render();
  }).catch(function (e) {
    document.getElementById("stage").innerHTML = "";
    document.getElementById("stage").appendChild(h("div", "err-load", "Cannot load project: " + e.message));
  });
}
new EventSource("/events").onmessage = function () { load(); };
load();
</script>
</body>
</html>`;
