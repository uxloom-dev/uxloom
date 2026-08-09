import { describe, expect, it } from "vitest";
import { buildScreenSvg, escapeXml, orderedFrames, svgFileName } from "uxloom/dist/export-svg.js";
import type { SvgProject } from "uxloom/dist/export-svg.js";

const project: SvgProject = {
  name: "meridian",
  platforms: ["web"],
  screens: [
    {
      id: "Payments",
      intent: "Review and settle outstanding invoices",
      requiredStates: ["default", "empty", "loading", "error.network", "confirm.discard"],
      layout: {
        blocks: [
          { type: "header", label: "Payments" },
          { type: "text", copy: "Fish & <Chips> — today's \"special\"" },
          { type: "table", columns: ["Amount", "Date", "Status"], count: 2, sort: ["Amount", "Date"] },
          { type: "button", label: "Pay now" },
        ],
      },
    },
  ],
};

/** Light well-formedness check: one root svg, balanced tags, no raw & or <. */
function expectWellFormed(svg: string): void {
  expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>/);
  expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  // every non-self-closing opening tag has a matching close
  for (const tag of ["svg", "g", "text", "title"]) {
    const opens = (svg.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
    const closes = (svg.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    expect(opens, `<${tag}> balance`).toBe(closes);
  }
  // no unescaped ampersands or stray angle brackets in text content
  expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
  expect(svg).not.toContain("<<");
}

describe("buildScreenSvg", () => {
  it("returns well-formed SVG with real columns and escaped copy", () => {
    const svg = buildScreenSvg(project, "Payments", "default");
    expectWellFormed(svg);
    // real column headers (rendered uppercase, like the HTML preview)
    expect(svg).toContain("AMOUNT");
    expect(svg).toContain("DATE");
    expect(svg).toContain("STATUS");
    // real copy, XML-escaped
    expect(svg).toContain("Fish &amp; &lt;Chips&gt;");
    // real button label
    expect(svg).toContain("Pay now");
    // desktop width for web projects
    expect(svg).toContain('width="960"');
  });

  it("uses mobile width when the project lacks web", () => {
    const mobile = { ...project, platforms: ["ios"] };
    const svg = buildScreenSvg(mobile, "Payments", "default");
    expect(svg).toContain('width="390"');
  });

  it("applies themed tokens (accent color, font)", () => {
    const themed: SvgProject = {
      ...project,
      tokens: { colors: { accent: "#ff0055", bg: "#101418" }, radius: 14, font: "Inter, sans-serif" },
    };
    const svg = buildScreenSvg(themed, "Payments", "default");
    expect(svg).toContain("#ff0055"); // accent on the button
    expect(svg).toContain("#101418"); // background
    expect(svg).toContain('font-family="Inter, sans-serif"');
    expect(svg).toContain('rx="14"');
    // untimed project stays off-palette
    const plain = buildScreenSvg(project, "Payments", "default");
    expect(plain).not.toContain("#ff0055");
  });

  it("renders honest state treatments", () => {
    const error = buildScreenSvg(project, "Payments", "error.network");
    expectWellFormed(error);
    expect(error).toContain("#b04338"); // banner rect stroke
    expect(error).toContain("error.network");
    expect(error).toContain('opacity="0.35"'); // dimmed content

    const empty = buildScreenSvg(project, "Payments", "empty");
    expectWellFormed(empty);
    expect(empty).toContain("stroke-dasharray"); // dashed placeholder
    expect(empty).toContain("Nothing here yet");
    expect(empty).toContain("Review and settle outstanding invoices");

    const loading = buildScreenSvg(project, "Payments", "loading");
    expectWellFormed(loading);
    expect(loading).toContain("#ececec"); // gray bars
    expect(loading).not.toContain("Pay now"); // no text while loading

    const custom = buildScreenSvg(project, "Payments", "confirm.discard");
    expectWellFormed(custom);
    expect(custom).toContain("confirm.discard"); // modal title
    expect(custom).toContain("Confirm");
  });

  it("derives blocks for screens without a layout, like the preview", () => {
    const bare: SvgProject = {
      ...project,
      screens: [
        {
          id: "Bare",
          requiredStates: ["default"],
          components: [{ semantic: "Button.Primary", label: { en: "Get started" } }],
        },
      ],
    };
    const svg = buildScreenSvg(bare, "Bare", "default");
    expectWellFormed(svg);
    expect(svg).toContain("Get started");
    expect(svg).toContain("Bare"); // auto header carries the screen id
  });

  it("is deterministic — two calls produce identical output", () => {
    const a = buildScreenSvg(project, "Payments", "error.network");
    const b = buildScreenSvg(project, "Payments", "error.network");
    expect(a).toBe(b);
  });

  it("throws on unknown screens", () => {
    expect(() => buildScreenSvg(project, "Nope", "default")).toThrow(/no screen/);
  });
});

describe("grammar naming in the SVG (R27)", () => {
  it("titles the frame with the R26 grammar and names block groups", () => {
    const svg = buildScreenSvg(project, "Payments", "error.network");
    expect(svg).toContain("<title>Payments / error.network</title>"); // frame name
    expect(svg).toContain("<title>2 · table</title>"); // unlabeled block: index · type
    // groups are balanced/named so Figma reads them as layers
    expect(svg).toMatch(/<g id="block-0"><title>0 · header: Payments<\/title>/);
  });
});

describe("orderedFrames (R27 journey traversal)", () => {
  const flow: SvgProject = {
    name: "shop",
    platforms: ["web"],
    journeys: [
      {
        id: "Checkout",
        entry: "cart",
        states: { cart: { screen: "Cart", on: { pay: "pay" } }, pay: { screen: "Payment", final: true } },
      },
    ],
    screens: [
      // declared Payment-first, but traversal must visit Cart (entry) first
      { id: "Payment", requiredStates: ["default", "error.declined"] },
      { id: "Cart", requiredStates: ["default", "empty"] },
      { id: "Orphan", requiredStates: ["default"] }, // no journey references it
    ],
  };

  it("orders frames by traversal, attributes journeys, and appends orphans", () => {
    const frames = orderedFrames(flow);
    expect(frames.map((f) => `${f.screen}:${f.state}`)).toEqual([
      "Cart:default",
      "Cart:empty",
      "Payment:default",
      "Payment:error.declined",
      "Orphan:default",
    ]);
    expect(frames.find((f) => f.screen === "Cart")?.journey).toBe("Checkout");
    expect(frames.find((f) => f.screen === "Orphan")?.journey).toBeUndefined();
    // the file set matches the flat naming
    expect(frames.find((f) => f.screen === "Payment" && f.state === "error.declined")?.file).toBe(
      "Payment--error-declined.svg",
    );
  });
});

describe("svgFileName", () => {
  it("maps dots to dashes and sanitizes path-hostile characters", () => {
    expect(svgFileName("Payments", "default")).toBe("Payments--default.svg");
    expect(svgFileName("Payments", "error.network")).toBe("Payments--error-network.svg");
    expect(svgFileName("My Screen/2", "confirm.discard")).toBe("My-Screen-2--confirm-discard.svg");
  });
});

describe("escapeXml", () => {
  it("escapes the five XML metacharacters", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });
});
