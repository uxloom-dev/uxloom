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
 * When the project, a journey, or a screen carries design rationale
 * (R20), an "ⓘ why" toggle reveals the evidence panel: decision,
 * reasoning, alternatives argued, sources, and a confidence chip.
 *
 * renderStandalone() turns this same template into a static, shareable
 * HTML file: project data embedded, SSE and comment mode removed. The
 * rationale panel is kept — it is the stakeholder-confidence deliverable.
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
  .frame.desktop { width: 960px; } .frame.tablet { width: 640px; }
  .chrome { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: #eef0ee;
            border-bottom: 1px solid var(--line); font-size: 11px; color: var(--dim); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #cfd3cf; }
  .chrome .url { flex: 1; background: #fff; border: 1px solid var(--line); border-radius: 6px;
                 padding: 2px 10px; text-align: center; }
  .notch { flex: 1; text-align: center; }

  /* mobile & tablet: render as an actual device so the viewport reads as one at a glance */
  .frame.mobile, .frame.tablet { border: 14px solid #0c0c0e; background: #0c0c0e;
                  box-shadow: 0 26px 64px rgba(0,0,0,.30); position: relative; }
  .frame.mobile { width: 372px; border-radius: 52px; }
  .frame.tablet { width: 720px; border-width: 16px; border-radius: 34px; }
  .frame.mobile .chrome, .frame.tablet .chrome { background: var(--mock-bg, #fff);
                          color: var(--mock-text, var(--ink)); border-bottom: none;
                          justify-content: space-between; padding: 12px 24px 5px;
                          font-weight: 600; font-size: 12px; }
  .frame.mobile .screen { min-height: 560px; }
  .frame.tablet .screen { min-height: 500px; }
  /* phone dynamic island vs tablet camera dot */
  .frame.mobile .island { position: absolute; top: 11px; left: 50%; transform: translateX(-50%);
                          width: 108px; height: 26px; background: #000; border-radius: 14px; z-index: 4;
                          box-shadow: 0 0 0 1px rgba(128,128,128,.25); }
  .frame.tablet .cam { position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
                       width: 7px; height: 7px; border-radius: 50%; background: #23232a; z-index: 4;
                       box-shadow: 0 0 0 2px rgba(255,255,255,.06); }
  .st-right { display: inline-flex; align-items: center; gap: 7px; }
  .batt { display: inline-block; width: 22px; height: 11px; border: 1.5px solid currentColor;
          border-radius: 3px; position: relative; opacity: .9; }
  .batt::after { content: ""; position: absolute; right: -3px; top: 3px; width: 2px; height: 5px;
                 background: currentColor; border-radius: 0 1px 1px 0; }
  .batt::before { content: ""; position: absolute; left: 1.5px; top: 1.5px; bottom: 1.5px;
                  width: 68%; background: currentColor; border-radius: 1px; }
  .frame.mobile .home-ind, .frame.tablet .home-ind { background: var(--mock-bg, #fff);
                            color: var(--mock-text, var(--ink)); display: flex;
                            justify-content: center; align-items: center; height: 24px; }
  .frame.mobile .home-ind i { width: 128px; height: 5px; border-radius: 3px; background: currentColor; opacity: .32; }
  .frame.tablet .home-ind i { width: 180px; height: 5px; border-radius: 3px; background: currentColor; opacity: .3; }
  .screen { position: relative; padding: 18px; min-height: 420px; display: flex;
            flex-direction: column; gap: 14px;
            background: var(--mock-bg, transparent);
            color: var(--mock-text, var(--ink));
            font-family: var(--mock-font, inherit);
            /* R30 design-system tokens, derived from the project's colors so a
               theme change restyles everything; theme-adaptive on light & dark */
            --hair: var(--mock-border, color-mix(in srgb, var(--mock-text, #2a2e2a) 13%, transparent));
            --surf: var(--block, #ffffff);
            --sunken: color-mix(in srgb, var(--mock-text, #2a2e2a) 6%, var(--mock-bg, #ffffff));
            --accent-soft: color-mix(in srgb, var(--mock-accent, #2a2e2a) 15%, transparent);
            --success: var(--mock-success, #22c55e);
            --warning: var(--mock-warning, #f59e0b);
            --danger: var(--mock-danger, #ef4444);
            --elev-1: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.08);
            --elev-2: 0 6px 20px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.07); }

  /* wireframe blocks — themed via --mock-* custom properties when the
     project declares tokens; grayscale defaults otherwise */
  .b { border: 1px solid var(--hair); border-radius: var(--mock-radius, 10px);
       background: var(--surf); padding: 14px 16px; position: relative; box-shadow: var(--elev-1); }
  .b .lab { font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase;
            color: var(--mock-muted, var(--dim)); margin-bottom: 8px; }
  .ttl { font-size: 14px; font-weight: 650; line-height: 1.3; color: var(--mock-text, var(--ink)); }
  .sub { font-size: 12.5px; line-height: 1.4; color: var(--mock-muted, var(--dim)); }
  .meta { font-size: 12px; color: var(--mock-muted, var(--dim)); font-variant-numeric: tabular-nums; }

  /* app bar / nav / footer */
  .b-header { display: flex; align-items: center; gap: 14px; padding: 12px 16px; box-shadow: var(--elev-1); }
  .b-header .brand { font-weight: 700; font-size: 15px; color: var(--mock-text, var(--ink)); }
  .b-header .grow { flex: 1; }
  .avatar { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: flex;
            align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
            color: #fff; background: var(--mock-accent, #888); }
  .b-nav { display: flex; gap: 4px; padding: 5px; background: var(--sunken); box-shadow: none; }
  .b-nav .tab { font-size: 13px; padding: 7px 13px; border-radius: 7px; color: var(--mock-muted, var(--dim)); }
  .b-nav .tab.on { background: var(--surf); color: var(--mock-text, var(--ink)); font-weight: 600;
                   box-shadow: var(--elev-1); }
  .b-footer { display: flex; gap: 16px; align-items: center; justify-content: center; padding: 12px 16px;
              font-size: 12px; color: var(--mock-muted, var(--dim)); box-shadow: none; }

  /* hero */
  .b-hero { padding: 30px 24px; text-align: center;
            background: linear-gradient(160deg, var(--accent-soft), transparent 68%), var(--surf); }
  .b-hero .h1 { font-size: 23px; font-weight: 750; letter-spacing: -.01em; line-height: 1.2;
                color: var(--mock-text, var(--ink)); }
  .b-hero .sub { margin-top: 8px; font-size: 13.5px; }
  .b-hero .cta { margin-top: 18px; display: flex; gap: 10px; justify-content: center; }

  .copy { font-size: 13.5px; line-height: 1.55; white-space: pre-wrap; color: var(--mock-text, var(--ink)); }
  .b-text .ln { height: 9px; border-radius: 5px; background: var(--hair); margin: 8px 0; }
  .b-text .ln:last-child { width: 60%; }
  .b-image { min-height: 130px; border: 1px solid var(--hair);
    background: linear-gradient(135deg, var(--accent-soft), var(--sunken));
    display: flex; align-items: center; justify-content: center; }

  /* buttons */
  .b-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
              background: var(--mock-accent, var(--ink)); color: #fff; font-weight: 600;
              border-radius: calc(var(--mock-radius, 10px) - 2px); padding: 10px 18px; font-size: 13px;
              align-self: flex-start; border: none; box-shadow: var(--elev-1); }
  .b-button.ghost { background: transparent; color: var(--mock-text, var(--ink));
                    border: 1px solid var(--hair); box-shadow: none; }
  /* R33 — button variants */
  .b-button.danger { background: var(--danger); }
  .b-button.secondary { background: var(--accent-soft); color: var(--mock-accent, var(--ink)); box-shadow: none; }
  .b-button.disabled { background: var(--sunken); color: var(--mock-muted, var(--dim));
                       border: 1px solid var(--hair); box-shadow: none; }

  /* fields */
  .b-field { background: transparent; border: none; box-shadow: none; padding: 0; }
  .b-field .lab { text-transform: none; letter-spacing: 0; font-size: 12.5px; font-weight: 600;
                  color: var(--mock-text, var(--ink)); margin-bottom: 6px; }
  .b-field .inp { display: flex; align-items: center; height: 40px; padding: 0 13px; font-size: 13px;
                  border: 1px solid var(--hair); border-radius: calc(var(--mock-radius, 10px) - 2px);
                  background: var(--sunken); color: var(--mock-muted, var(--dim)); }
  /* R33 — field states */
  .b-field.error .inp { border-color: var(--danger); border-width: 1.5px; }
  .b-field .err-note { color: var(--danger); font-size: 12px; margin-top: 6px; }
  .b-field.disabled { opacity: .55; }

  /* list rows */
  .row { display: flex; gap: 12px; align-items: center; border: 1px solid var(--hair);
         border-radius: var(--mock-radius, 10px); padding: 12px 14px; background: var(--surf);
         box-shadow: var(--elev-1); }
  .row .av { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; display: flex;
             align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
             color: #fff; background: var(--mock-accent, #888); }
  .row .rc { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .row .chev { color: var(--mock-muted, var(--dim)); opacity: .5; font-size: 17px; }

  /* cards */
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .cards .b { display: flex; flex-direction: column; gap: 8px; min-height: 118px; }
  .cardhd { display: flex; align-items: center; gap: 9px; }
  .cardhd .ic { width: 26px; height: 26px; border-radius: 7px; background: var(--accent-soft); flex-shrink: 0; }
  .foot { margin-top: auto; display: flex; gap: 8px; align-items: center; padding-top: 6px; }

  /* table */
  .tbl { border: 1px solid var(--hair); border-radius: var(--mock-radius, 10px);
         overflow: hidden; background: var(--surf); box-shadow: var(--elev-1); }
  .tbl .tr { display: flex; border-top: 1px solid var(--hair); }
  .tbl .tr:first-child { border-top: none; background: var(--sunken); }
  .tbl .tr.bd:nth-child(even) { background: color-mix(in srgb, var(--mock-text, #000) 3%, transparent); }
  .tbl .td { flex: 1; padding: 10px 12px; font-size: 13px; color: var(--mock-text, var(--ink));
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tbl .td .ln { height: 9px; border-radius: 5px; background: var(--hair); }
  .tbl .td.hd { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
                color: var(--mock-muted, var(--dim)); }

  /* status pill */
  .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600;
           padding: 3px 9px; border-radius: 999px; background: var(--accent-soft);
           color: var(--mock-accent, var(--ink)); }
  .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  /* R32 — semantic status pills */
  .badge.ok { background: color-mix(in srgb, var(--success) 20%, transparent); color: var(--success); }
  .badge.warn { background: color-mix(in srgb, var(--warning) 20%, transparent); color: var(--warning); }
  .badge.bad { background: color-mix(in srgb, var(--danger) 20%, transparent); color: var(--danger); }

  .srcchip { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
             font-size: 10px; color: var(--mock-muted, var(--dim)); border: 1px solid var(--hair);
             border-radius: 4px; padding: 0 5px; margin-top: 8px; align-self: flex-start; }
  .srcchip + .srcchip { margin-left: 4px; }
  .kids { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }

  /* state treatments */
  .skel .b, .skel .row, .skel .tbl { border-color: #e4e7e4; }
  .skel .ln, .skel .pill, .skel .av, .skel .avatar, .skel .inp, .skel .b-image, .skel .b-button,
  .skel .copy, .skel .ttl, .skel .sub, .skel .meta, .skel .badge, .skel .h1, .skel .td,
  .skel .brand, .skel .ic, .skel .tab, .skel .chev {
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

  /* rationale (the "why" evidence panel, R20) */
  .whypanel { width: 340px; flex-shrink: 0; background: var(--panel); border-left: 1px solid var(--line);
              overflow-y: auto; padding: 14px 16px; outline: none; }
  .whytop { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .whytitle { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dim); }
  .whyclose { color: var(--dim); font-size: 14px; padding: 2px 6px; border-radius: 6px; }
  .whyclose:hover, .whyclose:focus-visible { background: #e6e9e6; color: var(--ink); }
  .rat-scope { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
               color: var(--dim); margin-bottom: 2px; }
  .rat-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .rat-decision { font-size: 14px; font-weight: 600; }
  .rat-conf { display: inline-block; font-size: 10.5px; border-radius: 999px; padding: 1px 9px;
              border: 1px solid var(--line); color: var(--dim); white-space: nowrap; }
  .rat-conf.medium { border-color: var(--accent); color: var(--accent); }
  .rat-conf.high { background: var(--accent); border-color: var(--accent); color: #fff; }
  .rat-reason { font-size: 12.5px; margin: 6px 0 10px; }
  .rat-alts { width: 100%; border-collapse: collapse; font-size: 11.5px; margin: 8px 0 10px; }
  .rat-alts caption { text-align: left; font-size: 10.5px; text-transform: uppercase;
                      letter-spacing: .05em; color: var(--dim); margin-bottom: 4px; }
  .rat-alts th, .rat-alts td { border: 1px solid var(--line); padding: 4px 6px; text-align: left;
                               vertical-align: top; }
  .rat-alts th { background: #f1f3f1; font-size: 10px; text-transform: uppercase;
                 letter-spacing: .05em; color: var(--dim); }
  .rat-opt { font-weight: 600; }
  .rat-pros, .rat-cons { list-style: disc; padding-left: 14px; margin: 0; }
  .rat-pros li { color: #2e7d4f; }
  .rat-cons li { color: var(--err); }
  .rat-src { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 4px; }
  .rat-lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--dim); }
  .rat-src a { color: var(--accent); font-size: 12px; }
  .whydetails { border-top: 1px solid var(--line); margin-top: 12px; padding-top: 10px; }
  .whydetails summary { cursor: pointer; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
  .whymark { margin-left: 5px; font-size: 11px; opacity: .55; }

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
  .pin.assigned { background: var(--warn); }
  .pinpop .acts { display: flex; gap: 6px; margin-top: 6px; }
  .pinpop .assign { margin-top: 6px; border: 1px solid var(--warn); color: var(--warn);
                    border-radius: 6px; padding: 2px 10px; font-size: 12px; }
  .pinpop .assign:hover { background: var(--warn); color: #fff; }
  .pinpop .asgchip { display: inline-block; margin-top: 6px; font-size: 11px; color: var(--warn);
                     border: 1px solid var(--warn); border-radius: 999px; padding: 0 8px; }
  .cnt.asg { background: var(--warn); }
  .cbtn.on .cnt.asg { background: var(--warn); color: #fff; }
  .atoast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 40;
            background: var(--ink); color: #fff; border-radius: 10px; padding: 10px 14px;
            box-shadow: 0 8px 24px rgba(0,0,0,.35); font-size: 12.5px; max-width: 560px;
            display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .atoast code { font-size: 11.5px; background: rgba(255,255,255,.12); border-radius: 6px; padding: 2px 6px; }
  .atoast button { border: 1px solid rgba(255,255,255,.4); border-radius: 6px; padding: 2px 10px;
                   font-size: 12px; color: #fff; }
  .atoast button:hover { background: rgba(255,255,255,.15); }

  /* edit mode */
  .ewrap { position: relative; }
  .etools { display: none; position: absolute; top: -12px; right: 8px; gap: 2px; z-index: 4;
            background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 1px 3px;
            box-shadow: 0 2px 8px rgba(0,0,0,.15);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  .ewrap:hover > .etools, .ewrap:focus-within > .etools { display: flex; }
  .etools button { font-size: 12px; line-height: 1.4; padding: 1px 6px; border-radius: 4px; }
  .etools button:hover, .etools button:focus-visible { background: #eef0ee; }
  .eedit input { width: 100%; font: inherit; font-size: 13px; padding: 4px 6px; margin-top: 4px;
                 border: 1px solid var(--accent); border-radius: 6px; }
  .tokpanel { width: 196px; flex-shrink: 0; background: var(--panel); border: 1px solid var(--line);
              border-radius: 10px; padding: 10px 12px; margin-right: 18px; font-size: 12px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
              color: var(--ink); }
  .tokpanel h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dim);
                 margin-bottom: 6px; }
  .tokpanel label { display: flex; align-items: center; justify-content: space-between; gap: 8px;
                    margin: 6px 0; }
  .tokpanel input[type=color] { width: 44px; height: 24px; padding: 0; border: 1px solid var(--line);
                                border-radius: 4px; background: none; cursor: pointer; }
  .tokpanel input[type=number], .tokpanel input[type=text] { width: 96px; font: inherit; font-size: 12px;
                                padding: 2px 5px; border: 1px solid var(--line); border-radius: 4px; }
  .addblock { border: 1.5px dashed var(--blockline); border-radius: 8px; padding: 8px; width: 100%;
              text-align: center; color: var(--dim); font-size: 12.5px; }
  .addblock:hover, .addblock:focus-visible { border-color: var(--accent); color: var(--accent); }
  .palette { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .palette button { border: 1px solid var(--line); border-radius: 6px; padding: 3px 9px; font-size: 12px;
                    background: #fff; }
  .palette button:hover, .palette button:focus-visible { border-color: var(--accent); color: var(--accent); }
  .toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 20;
           display: flex; gap: 10px; align-items: center; background: var(--err); color: #fff;
           border-radius: 8px; padding: 8px 14px; font-size: 13px; max-width: 70vw;
           box-shadow: 0 6px 20px rgba(0,0,0,.3); }
  .toast button { color: #fff; font-size: 14px; }
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
<div id="why" class="whypanel" role="complementary" aria-label="Design rationale" tabindex="-1" hidden></div>
<script>
"use strict";
var STATIC_INFO = null;
/*__UXLOOM_STATIC__*/
var data = null, comments = [], sel = { screen: null, state: "default" }, viewport = "desktop";
var commentMode = false;
var whyOpen = false;
/* assigned by the edit-mode section below; stripped from static exports */
var EDIT = null;

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
   "--mock-radius", "--mock-font", "--mock-border", "--mock-success", "--mock-warning",
   "--mock-danger"].forEach(function (p) { r.removeProperty(p); });
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
  // R32 — structural + semantic color tokens
  if (c.border) r.setProperty("--mock-border", c.border);
  if (c.success) r.setProperty("--mock-success", c.success);
  if (c.warning) r.setProperty("--mock-warning", c.warning);
  if (c.danger) r.setProperty("--mock-danger", c.danger);
}

/* ---------- derive blocks when a screen declares no layout ---------- */
function autoBlocks(screen) {
  var blocks = [{ type: "header", label: screen.id }];
  if (screen.intent) blocks.push({ type: "text", label: screen.intent });
  var hasList = false;
  (screen.components || []).forEach(function (c) {
    var s = (c.semantic || "").toLowerCase();
    /* carry interaction intent (R12) through so derived blocks chip it */
    function derived(type, label) {
      return { type: type, label: label, validation: c.validation, motion: c.motion };
    }
    if (s.indexOf("button") === 0) blocks.push(derived("button", c.label && c.label.en || c.semantic));
    else if (s.indexOf("input") === 0 || s.indexOf("field") === 0)
      blocks.push(derived("field", c.label && c.label.en || c.semantic));
    else if (s.indexOf("list") === 0 || s.indexOf("table") === 0) { blocks.push(derived("list", c.semantic)); hasList = true; }
    else if (s.indexOf("nav") === 0) blocks.splice(1, 0, derived("nav", c.semantic));
    else blocks.push(derived("card", c.semantic));
  });
  if (!hasList) blocks.push({ type: "list", label: "Content", count: 3 });
  return blocks;
}

/* -------- R12 chips: validation / sort / filter / motion intent ------ */
function metaChip(text, title) {
  var s = h("span", "srcchip", text);
  if (title) s.title = title;
  return s;
}
/* validation/motion live on components; blocks derived by autoBlocks carry
   them directly, explicit field/button blocks match a component by label */
function blockMeta(b, screen) {
  var v = b.validation, m = b.motion;
  if ((b.type === "field" || b.type === "button") && screen && screen.components && (!v || !m)) {
    var match = screen.components.find(function (c) {
      return b.label && ((c.label && c.label.en === b.label) || c.semantic === b.label);
    });
    if (match) { if (!v) v = match.validation; if (!m) m = match.motion; }
  }
  return { validation: v, motion: m };
}
function appendMetaChips(el, b, screen) {
  var meta = blockMeta(b, screen);
  if (meta.validation) {
    if (meta.validation.required) el.appendChild(metaChip("required", meta.validation.message));
    if (meta.validation.pattern)
      el.appendChild(metaChip("pattern: " + meta.validation.pattern, meta.validation.message));
  }
  if (b.type === "table" || b.type === "list") {
    if (b.sort && b.sort.length) el.appendChild(metaChip("sort: " + b.sort.join(", ")));
    if (b.filter && b.filter.length) el.appendChild(metaChip("filter: " + b.filter.join(", ")));
  }
  if (meta.motion === "decorative") el.appendChild(metaChip("motion: decorative"));
}

/* R31 — deterministic sample content for high-fidelity mocks. Pure functions
   of (block, index, column): no randomness, so mocks stay byte-stable. This
   is legible mock filler (the role gray bars used to play), never invented
   product copy or design decisions. */
var SAMPLE_NAMES = ["Alex Rivera", "Sam Chen", "Jordan Lee", "Taylor Kim", "Morgan Diaz", "Casey Park", "Riley Fox", "Jamie Wu"];
var ITEM_TITLES = ["Onboarding flow", "Payment retry logic", "Search indexing", "Mobile navigation", "Export API", "Billing settings", "Auth token refresh", "Dark mode polish"];
var SAMPLE_SUBS = ["Updated 2h ago", "In review", "Due Friday", "3 comments", "Blocked on API", "Ready to ship"];
var CARD_SUBS = ["Cross-team initiative with three active workstreams.", "On track for the Q3 milestone.", "Waiting on design sign-off.", "Recently reopened after QA."];
var CARD_METAS = ["12 tasks", "3 members", "Due Aug 30", "8 open"];
var STATUS_WORDS = ["Active", "In review", "Done", "Pending", "Blocked"];
function pick(a, i) { return a[((i % a.length) + a.length) % a.length]; }
function initials(s) { s = (s || "").trim(); if (!s) return "U"; var p = s.split(" "); return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")).toUpperCase(); }
function statusBadge(i) {
  var w = pick(STATUS_WORDS, i), l = w.toLowerCase(), cls = "badge";
  if (hasWord(l, ["done", "active", "ship", "complete", "approved", "live"])) cls += " ok";
  else if (hasWord(l, ["block", "error", "fail", "reject", "overdue"])) cls += " bad";
  else if (hasWord(l, ["review", "pending", "wait", "progress", "draft"])) cls += " warn";
  return h("span", cls, w);
}
function hasWord(c, list) { for (var k = 0; k < list.length; k++) if (c.indexOf(list[k]) >= 0) return true; return false; }
function isGhost(l) { return hasWord((l || "").toLowerCase(), ["cancel", "back", "skip", "learn", "secondary", "dismiss", "later"]); }
function placeholderFor(l) { l = (l || "").toLowerCase(); if (l.indexOf("email") >= 0) return "you@company.com"; if (l.indexOf("password") >= 0) return "••••••••••"; if (l.indexOf("search") >= 0) return "Search…"; if (l.indexOf("name") >= 0) return "Jane Doe"; return "Enter " + (l || "value"); }
function navItems(label) {
  if (label) {
    var s = label.split("·").join("|").split("/").join("|").split(",").join("|").split("|");
    var out = []; for (var k = 0; k < s.length; k++) { var t = s[k].trim(); if (t) out.push(t); }
    if (out.length > 1) return out.slice(0, 5);
  }
  return ["Home", "Projects", "Activity", "Settings"];
}
function money(i) { var v = ((i * 734 + 128) % 9000) + 240; var s = String(v); return v >= 1000 ? "$" + s.slice(0, s.length - 3) + "," + s.slice(s.length - 3) : "$" + s; }
function cellFor(col, i) {
  var c = (col || "").toLowerCase();
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

function renderBlock(b, screen) {
  var el, i, j, n = b.count || 3;
  switch (b.type) {
    case "list":
      el = h("div", "kids");
      for (i = 0; i < n; i++) {
        var r = h("div", "row");
        r.appendChild(h("div", "av", initials(pick(SAMPLE_NAMES, i))));
        var rc = h("div", "rc");
        rc.appendChild(h("div", "ttl", pick(ITEM_TITLES, i)));
        rc.appendChild(h("div", "sub", pick(SAMPLE_NAMES, i) + " · " + pick(SAMPLE_SUBS, i)));
        r.appendChild(rc);
        r.appendChild(h("div", "chev", "›"));
        el.appendChild(r);
      }
      break;
    case "card":
      el = h("div", "cards");
      for (i = 0; i < (b.count || 3); i++) {
        var c = h("div", "b");
        var chd = h("div", "cardhd"); chd.appendChild(h("div", "ic")); chd.appendChild(h("div", "ttl", pick(ITEM_TITLES, i)));
        c.appendChild(chd);
        c.appendChild(h("div", "sub", pick(CARD_SUBS, i)));
        var ft = h("div", "foot"); ft.appendChild(statusBadge(i)); ft.appendChild(h("span", "meta", pick(CARD_METAS, i)));
        c.appendChild(ft);
        el.appendChild(c);
      }
      break;
    case "table":
      el = h("div", "tbl");
      var cols = (b.columns && b.columns.length) ? b.columns : ["Name", "Status", "Updated"];
      var ncol = cols.length;
      var hr = h("div", "tr");
      for (j = 0; j < ncol; j++) hr.appendChild(h("div", "td hd", cols[j]));
      el.appendChild(hr);
      for (i = 0; i < n; i++) {
        var tr = h("div", "tr bd");
        for (j = 0; j < ncol; j++) {
          var td = h("div", "td");
          var val = cellFor(cols[j], i);
          if (val === null) td.appendChild(statusBadge(i)); else td.textContent = val;
          tr.appendChild(td);
        }
        el.appendChild(tr);
      }
      break;
    case "button": {
      // R33 — explicit variant wins; else infer ghost from the label
      var bv = b.state === "disabled" ? "disabled" : (b.variant || (isGhost(b.label) ? "ghost" : "primary"));
      el = h("button", "b-button" + (bv === "primary" ? "" : " " + bv), b.label || "Action");
      break;
    }
    case "field":
      el = h("div", "b b-field" + (b.state === "error" ? " error" : b.state === "disabled" ? " disabled" : ""));
      el.appendChild(h("div", "lab", b.label || "Field"));
      el.appendChild(h("div", "inp", placeholderFor(b.label)));
      if (b.state === "error") el.appendChild(h("div", "err-note", "Please check this field."));
      break;
    case "text":
      el = h("div", "b b-text"); if (b.label) el.appendChild(h("div", "lab", b.label));
      if (b.copy) el.appendChild(h("div", "copy", b.copy));
      else { el.appendChild(h("div", "ln")); el.appendChild(h("div", "ln")); }
      break;
    case "image": el = h("div", "b b-image"); el.appendChild(h("span", "meta", b.label || "Image")); break;
    case "hero":
      el = h("div", "b b-hero");
      el.appendChild(h("div", "h1", b.copy || b.label || "Build something great"));
      el.appendChild(h("div", "sub", "A clear, benefit-led subheadline that sets up the primary action."));
      var cta = h("div", "cta");
      cta.appendChild(h("button", "b-button", "Get started"));
      cta.appendChild(h("button", "b-button ghost", "Learn more"));
      el.appendChild(cta);
      break;
    case "header":
      el = h("div", "b b-header");
      el.appendChild(h("div", "brand", b.label || "App"));
      el.appendChild(h("div", "grow"));
      el.appendChild(h("div", "avatar", initials(pick(SAMPLE_NAMES, 0))));
      break;
    case "nav":
      el = h("div", "b b-nav");
      navItems(b.label).forEach(function (t, k) { el.appendChild(h("div", "tab" + (k === 0 ? " on" : ""), t)); });
      break;
    case "footer":
      el = h("div", "b b-footer");
      ["Privacy", "Terms", "Status", "© " + (b.label || "App")].forEach(function (t) { el.appendChild(h("span", null, t)); });
      break;
    case "form":
      el = h("div", "b"); el.appendChild(h("div", "lab", b.label || "Form"));
      var kk = h("div", "kids"); (b.children || [{ type: "field" }, { type: "field" }, { type: "button", label: "Submit" }]).forEach(function (ch) { kk.appendChild(renderBlock(ch, screen)); }); el.appendChild(kk); break;
    default:
      el = h("div", "b"); el.appendChild(h("div", "lab", b.label || b.type));
  }
  if (b.children && b.type !== "form") {
    var kids = h("div", "kids");
    b.children.forEach(function (ch) { kids.appendChild(renderBlock(ch, screen)); });
    el.appendChild(kids);
  }
  if (b.source) el.appendChild(h("span", "srcchip", b.source));
  appendMetaChips(el, b, screen);
  return el;
}

function renderScreenBody(screen, stateId) {
  var body = h("div", "screen");
  body.setAttribute("data-ux-screen", screen.id);
  body.setAttribute("data-ux-state", stateId);
  var blocks = (screen.layout && screen.layout.blocks) || autoBlocks(screen);
  var isError = stateId.indexOf("error") === 0;
  var baseline = stateId === "default" || stateId === "empty" || stateId === "loading";
  /* editing needs an explicit layout: block indexes must map 1:1 to file */
  var editing = EDIT && EDIT.on && !STATIC_INFO && screen.layout && screen.layout.blocks;
  var content = h("div", stateId === "loading" ? "skel" : "");
  content.style.display = "flex"; content.style.flexDirection = "column"; content.style.gap = "10px";

  if (stateId === "empty") {
    blocks.filter(function (b) { return ["header", "nav"].indexOf(b.type) >= 0; })
      .forEach(function (b) { content.appendChild(renderBlock(b, screen)); });
    var eb = h("div", "emptybox");
    eb.appendChild(h("div", null, "Nothing here yet"));
    eb.appendChild(h("small", null, screen.intent || "Empty state — first-run guidance goes here"));
    content.appendChild(eb);
  } else {
    blocks.forEach(function (b, i) {
      var el = renderBlock(b, screen);
      /* comment pins anchor to explicit-layout blocks only (file-stable indexes) */
      if (screen.layout && screen.layout.blocks) {
        el.setAttribute("data-bi", String(i));
        el.setAttribute("data-bt", b.type);
        if (b.label) el.setAttribute("data-bl", b.label);
      }
      content.appendChild(editing ? EDIT.wrap(el, b, i, screen) : el);
    });
  }

  if (isError) {
    body.appendChild(h("div", "banner", "\\u26a0 " + stateId + " — what went wrong and how to fix it"));
    content.className += " dimmed";
  }
  body.appendChild(content);
  if (editing && stateId !== "empty") body.appendChild(EDIT.addButton(screen));

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
/* effective lifecycle status (RFC 0006): legacy comments have no status */
function cstatus(c) {
  if (c.resolved) return "resolved";
  return c.status === "assigned" ? "assigned" : "open";
}

function openCommentsFor(screenId) {
  return comments.filter(function (c) { return cstatus(c) !== "resolved" && c.screen === screenId; });
}

var AGENT_PROMPT = "Address the assigned UXLoom comments (comments_list \\u2192 comment_context \\u2192 fix \\u2192 comment_resolve).";

/* after "\\u2192 agent": tell the reviewer the exact line to hand their agent */
function showAssignToast() {
  var old = document.querySelector(".atoast");
  if (old) old.remove();
  var t = h("div", "atoast");
  t.setAttribute("role", "status");
  t.appendChild(h("span", null, "Assigned. Tell your agent:"));
  var code = h("code", null, AGENT_PROMPT);
  t.appendChild(code);
  var cp = h("button", null, "Copy");
  cp.setAttribute("aria-label", "Copy the agent prompt");
  cp.onclick = function () {
    var done = function () { cp.textContent = "Copied"; };
    /* clipboard API may be unavailable on plain http — the visible text is the fallback */
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(AGENT_PROMPT).then(done).catch(done);
    } else done();
  };
  var x = h("button", null, "\\u00d7");
  x.setAttribute("aria-label", "Dismiss");
  x.onclick = function () { t.remove(); };
  t.appendChild(cp); t.appendChild(x);
  document.body.appendChild(t);
  setTimeout(function () { if (t.parentNode) t.remove(); }, 15000);
}

function attachComments(body, screen) {
  var mine = comments.filter(function (c) {
    return cstatus(c) !== "resolved" && c.screen === screen.id && c.state === sel.state;
  });
  mine.forEach(function (c, i) {
    var assigned = cstatus(c) === "assigned";
    var w = h("div", "pinwrap");
    w.style.left = c.x + "%"; w.style.top = c.y + "%";
    var p = h("button", "pin" + (assigned ? " assigned" : ""), String(i + 1));
    p.setAttribute("aria-label", "Comment " + (i + 1) + (assigned ? " (assigned to agent)" : "") + ": " + c.text);
    p.onclick = function (e) { e.stopPropagation(); w.classList.toggle("open"); };
    var pop = h("div", "pinpop");
    pop.appendChild(h("div", null, c.text));
    if (assigned) pop.appendChild(h("span", "asgchip", "\\u2192 assigned to agent"));
    var acts = h("div", "acts");
    var rb = h("button", "resolve", "Resolve");
    rb.onclick = function (e) {
      e.stopPropagation();
      postJson("/comments/resolve", { id: c.id }).then(function () {
        c.resolved = true; c.status = "resolved"; render();
      }).catch(function () {});
    };
    acts.appendChild(rb);
    if (!assigned) {
      var ab = h("button", "assign", "\\u2192 agent");
      ab.setAttribute("aria-label", "Assign to agent");
      ab.title = "Hand this comment to the agent: it reads the pin, the block it points at, and the screen contract";
      ab.onclick = function (e) {
        e.stopPropagation();
        postJson("/comments/assign", { id: c.id }).then(function (u) {
          c.status = "assigned"; c.assignedAt = u.assignedAt;
          showAssignToast(); render();
        }).catch(function () {});
      };
      acts.appendChild(ab);
    }
    pop.appendChild(acts);
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
  /* anchor the pin to the layout block it lands on (explicit layouts only —
     indexes must map 1:1 to the project file, same rule as edit mode) */
  var anchor = null;
  var be = e.target.closest ? e.target.closest("[data-bi]") : null;
  if (be && body.contains(be)) {
    anchor = { index: +be.getAttribute("data-bi"), type: be.getAttribute("data-bt") };
    if (be.getAttribute("data-bl")) anchor.label = be.getAttribute("data-bl");
  }
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
    var payload = { screen: screen.id, state: sel.state, x: x, y: y, text: text };
    if (anchor) payload.block = anchor;
    postJson("/comments", payload)
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
  if (vp === "mobile" || vp === "tablet") {
    // iOS-style status bar over a device bezel (see .frame.mobile/.tablet):
    // time, a phone dynamic-island pill or tablet camera dot, and signal +
    // battery. The device frame itself tells the reviewer which viewport this
    // is — no textual label needed.
    c.appendChild(h("span", "st-time", "9:41"));
    c.appendChild(h("div", vp === "mobile" ? "island" : "cam"));
    var right = h("span", "st-right");
    right.appendChild(h("span", "st-sig", native ? data.platforms.join(" / ") : (vp === "tablet" ? "Wi-Fi" : "5G")));
    right.appendChild(h("span", "batt"));
    c.appendChild(right);
  } else {
    c.appendChild(h("span", "dot")); c.appendChild(h("span", "dot")); c.appendChild(h("span", "dot"));
    c.appendChild(h("span", "url", (data.name || "app") + ".example.com"));
  }
  return c;
}

/* ----------- R20: design rationale — the "why" evidence panel ----------- */
/* the toggle is visible only when the current screen OR the project carries
   rationale; journeys surface theirs via the panel and a muted meta chip */
function hasWhyContent(screen) {
  return !!((screen && screen.rationale) || (data && data.rationale));
}
function journeysForScreen(screenId) {
  return (data.journeys || []).filter(function (j) {
    return Object.keys(j.states).some(function (sn) { return j.states[sn].screen === screenId; });
  });
}
function hostOf(u) {
  try { return new URL(u).hostname || u; } catch (e) { return u; }
}
/* one rationale rendered as evidence: decision, confidence, reasoning,
   the alternatives that were argued over, and the sources it leans on.
   Every field is optional — show what exists, never invent the rest. */
function ratBody(r) {
  var box = h("div", "rat");
  var head = h("div", "rat-head");
  head.appendChild(h("h3", "rat-decision", r.decision || "(no decision recorded)"));
  if (r.confidence === "low" || r.confidence === "medium" || r.confidence === "high")
    head.appendChild(h("span", "rat-conf " + r.confidence, r.confidence + " confidence"));
  box.appendChild(head);
  if (r.reasoning) box.appendChild(h("p", "rat-reason", r.reasoning));
  if (r.alternatives && r.alternatives.length) {
    var tbl = h("table", "rat-alts");
    tbl.appendChild(h("caption", null, "Alternatives considered"));
    var thr = h("tr");
    ["Option", "Pros", "Cons"].forEach(function (t) { thr.appendChild(h("th", null, t)); });
    tbl.appendChild(thr);
    r.alternatives.forEach(function (a) {
      var tr = h("tr");
      tr.appendChild(h("td", "rat-opt", a.option || ""));
      var ptd = h("td"), pul = h("ul", "rat-pros");
      (a.pros || []).forEach(function (p) { pul.appendChild(h("li", null, p)); });
      ptd.appendChild(pul); tr.appendChild(ptd);
      var ctd = h("td"), cul = h("ul", "rat-cons");
      (a.cons || []).forEach(function (c) { cul.appendChild(h("li", null, c)); });
      ctd.appendChild(cul); tr.appendChild(ctd);
      tbl.appendChild(tr);
    });
    box.appendChild(tbl);
  }
  if (r.sources && r.sources.length) {
    var src = h("div", "rat-src");
    src.appendChild(h("span", "rat-lbl", "Sources"));
    r.sources.forEach(function (u) {
      var a = h("a", null, hostOf(u));
      a.setAttribute("href", u);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
      a.title = u;
      src.appendChild(a);
    });
    box.appendChild(src);
  }
  return box;
}
function closeWhy() {
  whyOpen = false;
  render();
  var t = document.getElementById("whytoggle");
  if (t) t.focus();
}
function renderWhy(screen) {
  var panel = document.getElementById("why");
  panel.innerHTML = "";
  if (!hasWhyContent(screen)) whyOpen = false;
  panel.hidden = !whyOpen;
  if (!whyOpen) return;
  var top = h("div", "whytop");
  top.appendChild(h("h2", "whytitle", "Design rationale"));
  var x = h("button", "whyclose", "\\u2715");
  x.setAttribute("aria-label", "Close rationale panel");
  x.onclick = function () { closeWhy(); };
  top.appendChild(x);
  panel.appendChild(top);
  if (screen && screen.rationale) {
    panel.appendChild(h("div", "rat-scope", screen.id));
    panel.appendChild(ratBody(screen.rationale));
  }
  if (data && data.rationale) {
    var pd = h("details", "whydetails");
    pd.appendChild(h("summary", null, "Product direction"));
    pd.appendChild(ratBody(data.rationale));
    panel.appendChild(pd);
  }
  if (screen) journeysForScreen(screen.id).forEach(function (j) {
    if (!j.rationale) return;
    var jd = h("details", "whydetails");
    jd.appendChild(h("summary", null, "Flow rationale \\u00b7 " + j.id));
    jd.appendChild(ratBody(j.rationale));
    panel.appendChild(jd);
  });
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
    var b = h("button", "snav" + (screen && s.id === screen.id ? " on" : ""));
    b.appendChild(document.createTextNode(s.id));
    if (s.rationale) {
      var wm = h("span", "whymark", "\\u24d8");
      wm.title = "has design rationale";
      b.appendChild(wm);
    }
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
    var unresolved = openCommentsFor(screen.id);
    var asgCount = unresolved.filter(function (c) { return cstatus(c) === "assigned"; }).length;
    var openCount = unresolved.length - asgCount;
    var cb = h("button", "cbtn" + (commentMode ? " on" : ""));
    cb.appendChild(document.createTextNode("\\ud83d\\udcac comment"));
    if (openCount) cb.appendChild(h("span", "cnt", String(openCount)));
    if (asgCount) {
      var asgChip = h("span", "cnt asg", asgCount + "\\u2192");
      asgChip.setAttribute("aria-label", asgCount + " assigned to agent");
      cb.appendChild(asgChip);
    }
    cb.setAttribute("aria-pressed", commentMode ? "true" : "false");
    cb.title = "Comment mode: click the mock to leave a pinned note" +
      (asgCount ? " \\u00b7 " + asgCount + " assigned to agent" : "");
    cb.onclick = function () {
      commentMode = !commentMode;
      if (commentMode && EDIT) EDIT.on = false; /* modes are exclusive */
      render();
    };
    bar.appendChild(cb);
    if (EDIT) bar.appendChild(EDIT.toggleButton());
  }
  if (hasWhyContent(screen)) {
    var wb = h("button", "cbtn" + (whyOpen ? " on" : ""), "\\u24d8 why");
    wb.id = "whytoggle";
    wb.setAttribute("aria-pressed", whyOpen ? "true" : "false");
    wb.setAttribute("aria-controls", "why");
    wb.title = "Why: the design rationale behind this screen";
    wb.onclick = function () {
      whyOpen = !whyOpen;
      render();
      if (whyOpen) document.getElementById("why").focus();
    };
    bar.appendChild(wb);
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
    if (EDIT && EDIT.on && !STATIC_INFO) stage.appendChild(EDIT.tokenPanel());
    var frame = h("div", "frame " + viewport);
    frame.appendChild(chromeFor(viewport));
    var body = renderScreenBody(screen, sel.state);
    if (!STATIC_INFO) attachComments(body, screen);
    frame.appendChild(body);
    if (viewport === "mobile" || viewport === "tablet") { var hi = h("div", "home-ind"); hi.appendChild(h("i")); frame.appendChild(hi); }
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
    journeysForScreen(screen.id).forEach(function (j) {
      if (j.rationale && j.rationale.decision)
        meta.appendChild(h("span", "chip flowchip", "flow: " + j.rationale.decision));
    });
  }

  renderWhy(screen);
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
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && whyOpen) closeWhy();
});
/*__UXLOOM_EDIT__*/
/* ------------- structured edit mode (live preview only) ------------- */
EDIT = (function () {
  var api = { on: false };
  var BLOCK_TYPES = ["header", "nav", "hero", "text", "list", "card", "form",
                     "field", "button", "image", "table", "footer", "custom"];

  function toast(msg) {
    var old = document.querySelector(".toast");
    if (old) old.remove();
    var t = h("div", "toast");
    t.setAttribute("role", "alert");
    t.appendChild(h("span", null, msg));
    var x = h("button", null, "\\u2715");
    x.setAttribute("aria-label", "Dismiss");
    x.onclick = function () { t.remove(); };
    t.appendChild(x);
    document.body.appendChild(t);
  }

  /* POST an op; the file write wakes the SSE watcher, which re-renders
     every viewer — success needs no local handling at all */
  function postEdit(payload) {
    fetch("/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
      });
    }).catch(function (e) { toast(e.message); });
  }

  api.toggleButton = function () {
    var b = h("button", "cbtn" + (api.on ? " on" : ""), "\\u270e edit");
    b.setAttribute("aria-pressed", api.on ? "true" : "false");
    b.title = "Edit mode: tokens, copy, and blocks \\u2014 writes the project file";
    b.onclick = function () {
      api.on = !api.on;
      if (api.on) commentMode = false; /* modes are exclusive */
      render();
    };
    return b;
  };

  /* 3-digit hex → 6-digit (color inputs only accept #rrggbb) */
  function hex6(v, fallback) {
    if (typeof v !== "string") return fallback;
    var m = v.match(/^#([0-9a-fA-F]{3})$/);
    if (m) return "#" + m[1].charAt(0) + m[1].charAt(0) + m[1].charAt(1) + m[1].charAt(1) +
                 m[1].charAt(2) + m[1].charAt(2);
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  }

  api.tokenPanel = function () {
    var p = h("div", "tokpanel");
    p.appendChild(h("h3", null, "Design tokens"));
    var t = (data && data.tokens) || {}, c = t.colors || {};
    [["accent", "#2f6b52"], ["bg", "#ffffff"], ["surface", "#ffffff"],
     ["text", "#2a2e2a"], ["muted", "#6b706b"]].forEach(function (def) {
      var name = def[0];
      var lab = h("label");
      lab.appendChild(h("span", null, name));
      var inp = h("input");
      inp.setAttribute("type", "color");
      inp.value = hex6(c[name], def[1]);
      inp.setAttribute("aria-label", "Token color " + name);
      inp.onchange = function () {
        postEdit({ op: "set-token", path: "colors." + name, value: inp.value });
      };
      lab.appendChild(inp);
      p.appendChild(lab);
    });
    var rl = h("label");
    rl.appendChild(h("span", null, "radius"));
    var ri = h("input");
    ri.setAttribute("type", "number");
    ri.setAttribute("min", "0"); ri.setAttribute("max", "32"); ri.setAttribute("step", "1");
    ri.value = typeof t.radius === "number" ? String(t.radius) : "8";
    ri.setAttribute("aria-label", "Token radius in px");
    ri.onchange = function () {
      var n = Number(ri.value);
      if (isFinite(n)) postEdit({ op: "set-token", path: "radius", value: n });
    };
    rl.appendChild(ri); p.appendChild(rl);
    var fl = h("label");
    fl.appendChild(h("span", null, "font"));
    var fi = h("input");
    fi.setAttribute("type", "text");
    fi.value = t.font || "";
    fi.setAttribute("placeholder", "Inter, sans-serif");
    fi.setAttribute("aria-label", "Token font stack");
    fi.onchange = function () {
      if (fi.value.trim()) postEdit({ op: "set-token", path: "font", value: fi.value.trim() });
    };
    fl.appendChild(fi); p.appendChild(fl);
    return p;
  };

  function toolButton(txt, label, fn) {
    var x = h("button", null, txt);
    x.setAttribute("aria-label", label);
    x.title = label;
    x.onclick = function (e) { e.stopPropagation(); fn(); };
    return x;
  }

  function inlineEdit(w, b, i, screen) {
    var old = w.querySelector(".eedit");
    if (old) { old.remove(); return; }
    var isCopy = b.type === "text" || b.type === "hero";
    var box = h("div", "eedit");
    var inp = h("input");
    inp.setAttribute("type", "text");
    inp.value = isCopy ? (b.copy || "") : (b.label || "");
    inp.setAttribute("aria-label", (isCopy ? "Copy" : "Label") + " for " + b.type + " block " + (i + 1) +
      " \\u2014 Enter saves, Escape cancels");
    inp.onkeydown = function (ev) {
      if (ev.key === "Enter") {
        if (isCopy) postEdit({ op: "set-copy", screen: screen.id, blockIndex: i, copy: inp.value });
        else postEdit({ op: "set-label", screen: screen.id, blockIndex: i, label: inp.value });
        box.remove();
      }
      if (ev.key === "Escape") box.remove();
    };
    box.appendChild(inp);
    w.appendChild(box);
    inp.focus();
    inp.select();
  }

  /* hover/focus toolbar on each top-level block of an explicit layout */
  api.wrap = function (el, b, i, screen) {
    var total = screen.layout.blocks.length;
    var w = h("div", "ewrap");
    w.appendChild(el);
    var tools = h("div", "etools");
    if (i > 0) tools.appendChild(toolButton("\\u2191", "Move " + b.type + " block up", function () {
      postEdit({ op: "move-block", screen: screen.id, from: i, to: i - 1 });
    }));
    if (i < total - 1) tools.appendChild(toolButton("\\u2193", "Move " + b.type + " block down", function () {
      postEdit({ op: "move-block", screen: screen.id, from: i, to: i + 1 });
    }));
    if (["text", "hero", "button", "field"].indexOf(b.type) >= 0) {
      var what = b.type === "text" || b.type === "hero" ? "copy" : "label";
      tools.appendChild(toolButton("\\u270e", "Edit " + b.type + " " + what, function () {
        inlineEdit(w, b, i, screen);
      }));
    }
    tools.appendChild(toolButton("\\u2715", "Remove " + b.type + " block", function () {
      if (window.confirm("Remove this " + b.type + " block?"))
        postEdit({ op: "remove-block", screen: screen.id, blockIndex: i });
    }));
    w.appendChild(tools);
    return w;
  };

  api.addButton = function (screen) {
    var wrap = h("div");
    var pal = null;
    var btn = h("button", "addblock", "+ add block");
    btn.setAttribute("aria-expanded", "false");
    btn.onclick = function () {
      if (pal) { pal.remove(); pal = null; btn.setAttribute("aria-expanded", "false"); return; }
      pal = h("div", "palette");
      pal.setAttribute("role", "menu");
      BLOCK_TYPES.forEach(function (t) {
        var tb = h("button", null, t);
        tb.setAttribute("role", "menuitem");
        tb.onclick = function () {
          postEdit({ op: "add-block", screen: screen.id, index: screen.layout.blocks.length, block: { type: t } });
          pal.remove(); pal = null;
          btn.setAttribute("aria-expanded", "false");
        };
        pal.appendChild(tb);
      });
      wrap.appendChild(pal);
      btn.setAttribute("aria-expanded", "true");
      pal.firstChild.focus();
    };
    wrap.appendChild(btn);
    return wrap;
  };

  return api;
})();
/*__UXLOOM_EDIT_END__*/
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
const EDIT_START = "/*__UXLOOM_EDIT__*/";
const EDIT_END = "/*__UXLOOM_EDIT_END__*/";

function stripSection(html: string, startMarker: string, endMarker: string): string {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  return start >= 0 && end > start
    ? html.slice(0, start) + html.slice(end + endMarker.length)
    : html;
}

/**
 * Turn the live template into one self-contained HTML file: project data
 * embedded in place of fetch("/project"), SSE removed (the bar shows
 * "static export · <date>" instead of "live"), comment mode hidden, and
 * the structured edit mode stripped entirely (EDIT stays null, so no edit
 * UI ever renders and no /edit calls exist in the export).
 */
export function renderStandalone(projectJson: string): string {
  // Re-serialize so the embedded payload is exactly one JSON expression,
  // then escape "<" to keep "</script>" sequences inert inside the tag.
  const embedded = JSON.stringify(JSON.parse(projectJson)).replace(/</g, "\\u003c");
  const generated = new Date().toISOString().slice(0, 10);
  const bootstrap =
    "STATIC_INFO = { generated: " + JSON.stringify(generated) + ", data: " + embedded + " };";
  let html = PREVIEW_TEMPLATE.replace(STATIC_MARKER, bootstrap);
  html = stripSection(html, EDIT_START, EDIT_END);
  html = stripSection(html, LIVE_START, LIVE_END);
  return html;
}
