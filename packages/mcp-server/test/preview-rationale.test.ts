import { describe, expect, it } from "vitest";
import { PREVIEW_TEMPLATE, renderStandalone } from "uxloom/dist/preview-template.js";

/* R20 fixture: rationale at all three levels, every optional shape exercised —
   the screen's reasoning smuggles a <script> tag to prove escaping */
const project = {
  name: "meridian",
  formatVersion: "0.1",
  platforms: ["web"],
  rationale: {
    decision: "Wedge into weekly close reviews",
    reasoning: "Finance teams already meet weekly; the product rides an existing ritual.",
    alternatives: [
      {
        option: "Daily digest email",
        pros: ["zero new habit"],
        cons: ["ignored inboxes", "no discussion surface"],
      },
    ],
    sources: ["https://research.example.com/close-rituals"],
    confidence: "medium",
  },
  journeys: [
    {
      id: "review",
      entry: "home",
      rationale: {
        decision: "Single linear review path",
        reasoning: "Reviewers bail when offered branches.",
      },
      states: { home: { screen: "Home", final: true } },
    },
  ],
  screens: [
    {
      id: "Home",
      requiredStates: ["default"],
      designedStates: ["default"],
      rationale: {
        decision: "Table-first landing",
        reasoning: "Reviewers scan line items; a <script>alert(1)</script> chart hides variance.",
        alternatives: [
          {
            option: "Dashboard cards",
            pros: ["executive-friendly", "glanceable"],
            cons: ["hides line-item variance"],
          },
          { option: "Blank canvas", pros: [], cons: ["no guidance"] },
        ],
        sources: ["https://nngroup.example.org/tables", "https://forum.example.net/t/123"],
        confidence: "high",
      },
    },
    // partial rationale: no alternatives, no sources, no confidence
    {
      id: "Detail",
      requiredStates: ["default"],
      designedStates: ["default"],
      rationale: { decision: "One column", reasoning: "Focus." },
    },
    // no rationale at all
    { id: "Bare", requiredStates: ["default"], designedStates: [] },
  ],
};

const bare = {
  name: "plain",
  formatVersion: "0.1",
  platforms: ["web"],
  journeys: [{ id: "j", entry: "s", states: { s: { screen: "Only", final: true } } }],
  screens: [{ id: "Only", requiredStates: ["default"], designedStates: ["default"] }],
};

function scriptOf(html: string): string {
  const start = html.indexOf("<script>");
  const end = html.indexOf("</script>", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start + "<script>".length, end);
}

describe("rationale panel markup (R20)", () => {
  it("ships the why panel, toggle, and evidence classes in the template", () => {
    expect(PREVIEW_TEMPLATE).toContain('id="why"');
    expect(PREVIEW_TEMPLATE).toContain("whypanel");
    expect(PREVIEW_TEMPLATE).toContain("\\u24d8 why"); // the ⓘ toggle label
    expect(PREVIEW_TEMPLATE).toContain('setAttribute("aria-pressed"');
    // alternatives table: option column plus green/red pros/cons lists
    expect(PREVIEW_TEMPLATE).toContain("rat-alts");
    expect(PREVIEW_TEMPLATE).toContain("rat-opt");
    expect(PREVIEW_TEMPLATE).toContain("rat-pros");
    expect(PREVIEW_TEMPLATE).toContain("rat-cons");
    // confidence chip tiers
    expect(PREVIEW_TEMPLATE).toContain(".rat-conf.medium");
    expect(PREVIEW_TEMPLATE).toContain(".rat-conf.high");
    // collapsed project/journey sections
    expect(PREVIEW_TEMPLATE).toContain("Product direction");
    expect(PREVIEW_TEMPLATE).toContain("Flow rationale");
  });

  it("hides the toggle unless the screen or project carries rationale", () => {
    // the conditional gate the toggle renders behind
    expect(PREVIEW_TEMPLATE).toContain("function hasWhyContent(screen)");
    expect(PREVIEW_TEMPLATE).toContain("(screen && screen.rationale) || (data && data.rationale)");
    expect(PREVIEW_TEMPLATE).toContain("if (hasWhyContent(screen))");
  });

  it("guards optional fields so partial rationale renders what exists", () => {
    expect(PREVIEW_TEMPLATE).toContain("r.alternatives && r.alternatives.length");
    expect(PREVIEW_TEMPLATE).toContain("r.sources && r.sources.length");
    expect(PREVIEW_TEMPLATE).toContain("if (r.reasoning)");
  });

  it("marks rationale-bearing screens in the sidebar and chips the flow decision", () => {
    expect(PREVIEW_TEMPLATE).toContain("whymark");
    expect(PREVIEW_TEMPLATE).toContain('"has design rationale"');
    expect(PREVIEW_TEMPLATE).toContain('"flow: " + j.rationale.decision');
  });

  it("closes on Escape and returns focus to the toggle", () => {
    expect(PREVIEW_TEMPLATE).toContain('e.key === "Escape" && whyOpen');
    expect(PREVIEW_TEMPLATE).toContain('document.getElementById("whytoggle")');
  });
});

describe("rationale in standalone exports", () => {
  it("keeps the panel and toggle in the static export", () => {
    const html = renderStandalone(JSON.stringify(project));
    expect(html).toContain('id="why"');
    expect(html).toContain("\\u24d8 why");
    expect(html).toContain("rat-alts");
    expect(html).toContain("hasWhyContent");
    // live-only features stay stripped
    expect(html).not.toContain("EventSource");
    expect(html).not.toContain('"/edit"');
  });

  it("embeds sources and renders them as hostname links (_blank, noopener)", () => {
    const html = renderStandalone(JSON.stringify(project));
    expect(html).toContain("https://nngroup.example.org/tables");
    expect(html).toContain('setAttribute("target", "_blank")');
    expect(html).toContain('setAttribute("rel", "noopener")');
    expect(html).toContain("hostOf"); // links show hostnames, not raw URLs
  });

  it("escapes rationale text — a <script> in reasoning stays inert", () => {
    const html = renderStandalone(JSON.stringify(project));
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("\\u003cscript>alert(1)");
  });

  it("survives a project with zero rationale (toggle simply hidden)", () => {
    const html = renderStandalone(JSON.stringify(bare));
    expect(html).toContain('id="why"');
    expect(html).toContain("if (hasWhyContent(screen))");
    expect(html).toContain("plain");
  });
});

describe("client script hygiene", () => {
  it.each([
    ["live template", () => PREVIEW_TEMPLATE],
    ["standalone export", () => renderStandalone(JSON.stringify(project))],
  ])("%s: no backticks, no interpolation, and the script parses", (_name, get) => {
    const script = scriptOf(get());
    expect(script).not.toContain("`");
    expect(script).not.toContain("${");
    expect(() => new Function(script)).not.toThrow(); // syntax-check only
  });
});
