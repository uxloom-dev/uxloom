import { describe, expect, it } from "vitest";
import { diffProjects, renderHuman, renderMarkdown } from "uxloom/dist/diff.js";

/** Fixture: a small checkout project. Tests mutate deep clones of it. */
function baseProject() {
  return {
    name: "shop",
    formatVersion: "0.1",
    platforms: ["web"],
    tokens: { colors: { accent: "#FF0000" }, radius: 4 },
    journeys: [
      {
        id: "checkout",
        entry: "cart",
        states: {
          cart: { screen: "cart", on: { PAY: "payment" } },
          payment: { screen: "payment", on: { PAY: "confirm", BACK: "cart" } },
          confirm: { screen: "confirm", final: true },
        },
      },
    ],
    screens: [
      { id: "cart", requiredStates: ["default", "empty"], designedStates: ["default", "empty"] },
      {
        id: "payment",
        requiredStates: ["default", "error.declined"],
        designedStates: ["default"],
        components: [{ id: "cta", semantic: "Button.Primary", label: { key: "checkout.pay", en: "Pay" } }],
        layout: { blocks: [{ type: "header" }, { type: "form" }, { type: "button", label: "Pay" }] },
      },
      { id: "confirm", requiredStates: ["default"], designedStates: ["default"] },
    ],
  };
}

type Fixture = ReturnType<typeof baseProject>;

function variant(mutate: (p: Fixture) => void): Fixture {
  const p = structuredClone(baseProject());
  mutate(p);
  return p;
}

function kinds(diff: { changes: { kind: string }[] }): string[] {
  return diff.changes.map((c) => c.kind);
}

describe("diffProjects", () => {
  it("identical projects produce zero changes and 'No design changes.' markdown", () => {
    const diff = diffProjects(baseProject(), baseProject());
    expect(diff.changes).toEqual([]);
    expect(diff.summary).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(renderMarkdown(diff)).toBe("No design changes.");
  });

  it("is order-insensitive for keyed arrays (reordered journeys/screens/states diff clean)", () => {
    const reordered = variant((p) => {
      p.screens.reverse();
      p.screens[0].requiredStates.reverse();
      p.screens[0].designedStates.reverse();
    });
    expect(diffProjects(baseProject(), reordered).changes).toEqual([]);
  });

  it("detects a journey added", () => {
    const next = variant((p) => {
      p.journeys.push({
        id: "refund",
        entry: "start",
        states: { start: { screen: "cart", on: {} } },
      } as Fixture["journeys"][0]);
    });
    const diff = diffProjects(baseProject(), next);
    expect(diff.changes).toEqual([
      { kind: "journey-added", journey: "refund", detail: 'journey "refund" added (1 state)' },
    ]);
    expect(diff.summary).toEqual({ added: 1, removed: 0, changed: 0 });
  });

  it("detects a journey removed", () => {
    const diff = diffProjects(baseProject(), variant((p) => { p.journeys = []; }));
    expect(kinds(diff)).toEqual(["journey-removed"]);
    expect(diff.changes[0].detail).toContain('"checkout" removed');
    expect(diff.summary.removed).toBe(1);
  });

  it("detects a journey state added and removed", () => {
    const added = diffProjects(baseProject(), variant((p) => {
      (p.journeys[0].states as Record<string, unknown>).review = { screen: "confirm", final: true };
    }));
    expect(added.changes).toEqual([
      { kind: "state-added", journey: "checkout", state: "review", detail: 'state "review" added (screen "confirm")' },
    ]);

    const removed = diffProjects(baseProject(), variant((p) => {
      delete (p.journeys[0].states as Record<string, unknown>).confirm;
    }));
    expect(kinds(removed)).toEqual(["state-removed"]);
    expect(removed.changes[0].state).toBe("confirm");
  });

  it("detects a transition target change", () => {
    const diff = diffProjects(baseProject(), variant((p) => {
      p.journeys[0].states.payment.on.PAY = "cart";
    }));
    expect(diff.changes).toEqual([
      {
        kind: "transition-changed", journey: "checkout", state: "payment", event: "PAY",
        detail: 'transition PAY on payment: target "confirm" → "cart"',
      },
    ]);
  });

  it("normalizes string transitions: guard added via object form", () => {
    const diff = diffProjects(baseProject(), variant((p) => {
      (p.journeys[0].states.payment.on as Record<string, unknown>).PAY = { target: "confirm", guard: "total > 0" };
    }));
    expect(kinds(diff)).toEqual(["transition-changed"]);
    expect(diff.changes[0].detail).toBe('transition PAY on payment: guard added "total > 0"');
    expect(diff.changes[0].detail).not.toContain("target ");
  });

  it("treats string shorthand and object form with the same target as equal", () => {
    const next = variant((p) => {
      (p.journeys[0].states.payment.on as Record<string, unknown>).PAY = { target: "confirm" };
    });
    expect(diffProjects(baseProject(), next).changes).toEqual([]);
  });

  it("detects a roles change on a transition", () => {
    const before = variant((p) => {
      (p.journeys[0].states.payment.on as Record<string, unknown>).BACK = { target: "cart", roles: ["admin"] };
    });
    const after = variant((p) => {
      (p.journeys[0].states.payment.on as Record<string, unknown>).BACK = { target: "cart", roles: ["admin", "support"] };
    });
    const diff = diffProjects(before, after);
    expect(kinds(diff)).toEqual(["transition-changed"]);
    expect(diff.changes[0].detail).toBe("transition BACK on payment: roles [admin] → [admin, support]");
  });

  it("detects transition added and removed", () => {
    const diff = diffProjects(baseProject(), variant((p) => {
      delete (p.journeys[0].states.payment.on as Record<string, unknown>).BACK;
      (p.journeys[0].states.cart.on as Record<string, unknown>).CLEAR = "cart";
    }));
    expect(kinds(diff).sort()).toEqual(["transition-added", "transition-removed"]);
    const added = diff.changes.find((c) => c.kind === "transition-added")!;
    expect(added.detail).toBe('transition CLEAR on cart added → "cart"');
  });

  it("distinguishes contract-state-added from designed-state-added", () => {
    const contract = diffProjects(baseProject(), variant((p) => {
      p.screens[1].requiredStates.push("empty");
    }));
    expect(contract.changes).toEqual([
      { kind: "contract-state-added", screen: "payment", state: "empty", detail: 'required state "empty" added to contract' },
    ]);

    const designed = diffProjects(baseProject(), variant((p) => {
      p.screens[1].designedStates.push("error.declined");
    }));
    expect(designed.changes).toEqual([
      { kind: "designed-state-added", screen: "payment", state: "error.declined", detail: 'designed state "error.declined" added' },
    ]);
  });

  it("detects contract and designed state removals", () => {
    const diff = diffProjects(baseProject(), variant((p) => {
      p.screens[0].requiredStates = ["default"];
      p.screens[0].designedStates = ["default"];
    }));
    expect(kinds(diff)).toEqual(["contract-state-removed", "designed-state-removed"]);
    expect(diff.changes.every((c) => c.state === "empty")).toBe(true);
  });

  it("detects exemption added and removed", () => {
    const withExemption = variant((p) => {
      (p.screens[2] as Record<string, unknown>).exemptions = [{ state: "error.any", reason: "static confirmation screen" }];
    });
    const added = diffProjects(baseProject(), withExemption);
    expect(added.changes).toEqual([
      { kind: "exemption-added", screen: "confirm", state: "error.any", detail: 'exemption added for "error.any": "static confirmation screen"' },
    ]);
    const removed = diffProjects(withExemption, baseProject());
    expect(kinds(removed)).toEqual(["exemption-removed"]);
    expect(removed.changes[0].detail).toContain("static confirmation screen");
  });

  it("reports a tokens change as one concise sentence, not a dump", () => {
    const diff = diffProjects(baseProject(), variant((p) => {
      p.tokens.colors.accent = "#00FF00";
      p.tokens.radius = 8;
    }));
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].kind).toBe("tokens-changed");
    expect(diff.changes[0].detail).toBe('tokens changed: colors.accent "#FF0000" → "#00FF00", radius 4 → 8');
    expect(diff.changes[0].detail).not.toContain("{");
  });

  it("reports a component label change with old → new in the detail", () => {
    const diff = diffProjects(baseProject(), variant((p) => {
      p.screens[1].components![0].label!.en = "Pay now";
    }));
    expect(diff.changes).toEqual([
      { kind: "component-changed", screen: "payment", detail: 'component "cta": label "Pay" → "Pay now"' },
    ]);
    expect(diff.summary).toEqual({ added: 0, removed: 0, changed: 1 });
  });

  it("detects component added and removed", () => {
    const diff = diffProjects(baseProject(), variant((p) => {
      p.screens[1].components = [{ id: "back", semantic: "Button.Secondary", label: { key: "nav.back", en: "Back" } }];
    }));
    expect(kinds(diff).sort()).toEqual(["component-added", "component-removed"]);
    expect(diff.changes.find((c) => c.kind === "component-removed")!.detail).toContain('"cta"');
  });

  it("reports a layout change as one sentence describing the block delta", () => {
    const diff = diffProjects(baseProject(), variant((p) => {
      p.screens[1].layout!.blocks.splice(1, 0, { type: "text", copy: "Payments are encrypted." } as never);
    }));
    expect(diff.changes).toEqual([
      { kind: "layout-changed", screen: "payment", detail: "layout blocks header, form, button → header, text, form, button" },
    ]);
  });

  it("detects a platforms change at project level", () => {
    const diff = diffProjects(baseProject(), variant((p) => {
      p.platforms = ["web", "ios"];
    }));
    expect(diff.changes).toEqual([
      { kind: "platforms-changed", detail: "platforms web → web, ios" },
    ]);
  });

  it("throws (ZodError) on an invalid project", () => {
    expect(() => diffProjects({ name: "bad" }, baseProject())).toThrow();
  });

  it("is deterministic: same inputs give identical changes and output twice", () => {
    const next = variant((p) => {
      p.platforms = ["web", "android"];
      p.tokens.radius = 12;
      p.journeys.push({ id: "aardvark", entry: "s", states: { s: { screen: "cart", on: {} } } } as Fixture["journeys"][0]);
      p.screens[1].designedStates.push("error.declined");
      p.screens.push({ id: "zeta", requiredStates: ["default"], designedStates: [] });
    });
    const first = diffProjects(baseProject(), next);
    const second = diffProjects(baseProject(), next);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(renderMarkdown(first)).toBe(renderMarkdown(second));
    expect(renderHuman(first, false)).toBe(renderHuman(second, false));
    // Journeys come before screens; keys are alphabetical within each group.
    expect(kinds(first)).toEqual([
      "platforms-changed", "tokens-changed", "journey-added", "designed-state-added", "screen-added",
    ]);
  });
});

describe("renderers", () => {
  const changedDiff = () =>
    diffProjects(baseProject(), variant((p) => {
      p.journeys[0].states.payment.on.PAY = "cart";
      p.screens[1].requiredStates.push("empty");
      p.screens[1].components![0].label!.en = "Pay now";
    }));

  it("renderMarkdown produces a PR-ready comment with headers, bullets, and a summary", () => {
    const md = renderMarkdown(changedDiff());
    expect(md).toContain("## Design changes");
    expect(md).toContain("### journey `checkout`");
    expect(md).toContain("### screen `payment`");
    expect(md).toContain('- ~ transition PAY on payment: target "confirm" → "cart"');
    expect(md).toContain('- + required state "empty" added to contract');
    expect(md).toContain("**1 added · 0 removed · 2 changed**");
  });

  it("renderHuman groups changes with +/−/~ markers and colors only when asked", () => {
    const plain = renderHuman(changedDiff(), false);
    expect(plain).toContain("journey checkout");
    expect(plain).toContain("screen payment");
    expect(plain).toContain('~ transition PAY on payment: target "confirm" → "cart"');
    expect(plain).toContain("1 added · 0 removed · 2 changed");
    expect(plain).not.toContain("\x1b[");
    expect(renderHuman(changedDiff(), true)).toContain("\x1b[32m");
  });

  it("renderHuman reports an empty diff as no design changes", () => {
    const empty = diffProjects(baseProject(), baseProject());
    expect(renderHuman(empty, false)).toBe("✔ no design changes");
    expect(renderHuman(empty, true)).toContain("no design changes");
  });
});
