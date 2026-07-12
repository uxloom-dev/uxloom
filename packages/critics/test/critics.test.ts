import { describe, expect, it } from "vitest";
import type { Project } from "@uxloom/journeygraph";
import { parseProject } from "@uxloom/journeygraph";
import { critique } from "@uxloom/critics";

/**
 * The launch-demo fixture: a checkout flow the way a happy-path generator
 * would produce it — 4 screens, no failure states, several latent defects.
 */
const generatedCheckout: Project = parseProject({
  name: "shopfast",
  formatVersion: "0.1",
  platforms: ["mweb", "android"],
  journeys: [
    {
      id: "checkout",
      goal: "Returning shopper completes purchase in under 90 seconds",
      entry: "cart",
      states: {
        cart: { screen: "CartScreen", on: { CHECKOUT: "address" } },
        address: { screen: "AddressScreen", on: { CONTINUE: "payment" } },
        payment: { screen: "PaymentScreen", on: { PAY: "confirm" } },
        confirm: { screen: "ConfirmScreen", final: true },
        // designed by the generator, never wired in:
        promo: { screen: "PromoScreen", on: { APPLY: "cart" } },
      },
    },
  ],
  screens: [
    {
      id: "CartScreen",
      intent: "Review items, reach checkout in one action",
      requiredStates: ["default", "empty", "loading"],
      designedStates: ["default"], // empty + loading missing
      components: [
        {
          semantic: "Button.Primary",
          interactive: true,
          minTargetPx: 40, // below android 48dp
          label: { key: "cart.checkout", en: "Proceed to secure checkout", maxChars: 24 },
          fg: "#8A8F98",
          bg: "#F4F4F4", // low contrast
        },
      ],
    },
    {
      id: "AddressScreen",
      requiredStates: ["default"],
      designedStates: ["default"],
    },
    {
      id: "PaymentScreen",
      intent: "Collect payment with minimum anxiety",
      requiredStates: ["default", "loading", "error.declined", "error.network"],
      designedStates: ["default"], // both error states + loading missing
    },
    {
      id: "ConfirmScreen",
      requiredStates: ["default"],
      designedStates: ["default"],
    },
    {
      id: "PromoScreen",
      requiredStates: ["default"],
      designedStates: ["default"],
    },
  ],
});

describe("the generated-checkout demo fixture", () => {
  const report = critique(generatedCheckout);
  const errors = report.findings.filter((f) => f.severity === "error");

  it("finds the unreachable promo state", () => {
    expect(errors).toContainEqual(
      expect.objectContaining({ critic: "journey-completeness", state: "promo" }),
    );
  });

  it("finds all five undesigned required states", () => {
    const missing = errors.filter((f) => f.critic === "state-coverage");
    expect(missing.map((f) => `${f.screen}:${f.state}`).sort()).toEqual([
      "CartScreen:empty",
      "CartScreen:loading",
      "PaymentScreen:error.declined",
      "PaymentScreen:error.network",
      "PaymentScreen:loading",
    ]);
  });

  it("fails the low-contrast checkout button", () => {
    expect(errors).toContainEqual(
      expect.objectContaining({ critic: "wcag-contrast", screen: "CartScreen" }),
    );
  });

  it("fails the 40px target on android", () => {
    expect(errors).toContainEqual(
      expect.objectContaining({ critic: "touch-targets", screen: "CartScreen" }),
    );
  });

  it("warns that the checkout label will overflow under localization", () => {
    expect(report.findings).toContainEqual(
      expect.objectContaining({ critic: "text-expansion", screen: "CartScreen" }),
    );
  });

  it("warns about happy-path-only screen contracts", () => {
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        critic: "state-coverage",
        severity: "warning",
        screen: "AddressScreen",
      }),
    );
  });

  it("summarizes coverage for the headline", () => {
    expect(report.summary.stateCoverage).toEqual({ designed: 5, required: 10 });
    expect(report.summary.errors).toBeGreaterThanOrEqual(8);
  });
});

describe("a repaired project", () => {
  it("reports zero errors once every gap is fixed", () => {
    const fixed: Project = parseProject({
      name: "shopfast",
      formatVersion: "0.1",
      platforms: ["mweb"],
      journeys: [
        {
          id: "checkout",
          entry: "cart",
          states: {
            cart: {
              screen: "CartScreen",
              on: { CHECKOUT: "payment", CART_EMPTY: "cart" },
            },
            payment: {
              screen: "PaymentScreen",
              on: {
                PAY: "confirm",
                CARD_DECLINED: "payment#error.declined",
                BACK: "cart",
              },
            },
            confirm: { screen: "ConfirmScreen", final: true },
          },
        },
      ],
      screens: [
        {
          id: "CartScreen",
          requiredStates: ["default", "empty", "loading", "error.network"],
          designedStates: ["default", "empty", "loading", "error.network"],
          components: [
            {
              semantic: "Button.Primary",
              interactive: true,
              minTargetPx: 48,
              label: { key: "cart.checkout", en: "Checkout", maxChars: 16 },
              fg: "#FFFFFF",
              bg: "#1D4ED8",
            },
          ],
        },
        {
          id: "PaymentScreen",
          requiredStates: ["default", "loading", "empty", "error.declined"],
          designedStates: ["default", "loading", "empty", "error.declined"],
        },
        {
          id: "ConfirmScreen",
          requiredStates: ["default", "loading", "empty", "error.network"],
          designedStates: ["default", "loading", "empty", "error.network"],
        },
      ],
    });

    const report = critique(fixed);
    const errors = report.findings.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
    expect(report.summary.stateCoverage.designed).toBe(
      report.summary.stateCoverage.required,
    );
  });
});
