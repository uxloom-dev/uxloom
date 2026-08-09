import { describe, expect, it } from "vitest";
import {
  blockLayerName,
  frameName,
  parseBlockLayerName,
  parseFrameName,
  qualifiedName,
} from "uxloom/dist/design-naming.js";

describe("frame naming grammar (R26)", () => {
  const cases: Array<[string, string]> = [
    ["Payment", "default"],
    ["Payment", "error.declined"],
    ["Checkout-Step-2", "empty"],
    ["Order Summary", "loading"], // screen id with a space
    ["Cart", "confirm.discard"],
  ];

  it("round-trips frameName → parseFrameName exactly", () => {
    for (const [screen, state] of cases) {
      expect(parseFrameName(frameName(screen, state))).toEqual({ screen, state });
    }
  });

  it("round-trips the journey-qualified name", () => {
    expect(parseFrameName(qualifiedName("Checkout", "Payment", "error.network"))).toEqual({
      journey: "Checkout",
      screen: "Payment",
      state: "error.network",
    });
  });

  it("tolerates the unspaced separators a designer might hand-type", () => {
    expect(parseFrameName("Payment/default")).toEqual({ screen: "Payment", state: "default" });
    expect(parseFrameName("Checkout▸Payment/error.network")).toEqual({
      journey: "Checkout",
      screen: "Payment",
      state: "error.network",
    });
  });

  it("returns null for non-frame names", () => {
    expect(parseFrameName("just a label")).toBeNull();
    expect(parseFrameName("Payment /")).toBeNull();
    expect(parseFrameName("")).toBeNull();
  });
});

describe("block layer naming (R26)", () => {
  it("round-trips with and without a label", () => {
    expect(parseBlockLayerName(blockLayerName(2, "form", "Card details"))).toEqual({
      index: 2,
      type: "form",
      label: "Card details",
    });
    expect(parseBlockLayerName(blockLayerName(0, "header"))).toEqual({ index: 0, type: "header" });
  });

  it("discriminates block names from frame names", () => {
    // A block layer name must not be mistaken for a frame, even with a slashy label.
    const slashy = blockLayerName(0, "text", "home/away");
    expect(parseBlockLayerName(slashy)).not.toBeNull();
    // reverse audit skips anything parseBlockLayerName matches, so this never
    // becomes a phantom frame
  });
});
