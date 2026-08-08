import type { Finding, Project } from "@uxloom/journeygraph";

const CRITIC = "wcag-contrast";

/** WCAG 2.x relative luminance of an sRGB hex color. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(full.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Checks every component that declares both fg and bg against the minimum
 * ratio (default WCAG 2.2 AA 4.5:1, configurable upward for stricter bars).
 * Declared-color checking is deliberate: it runs before any rendering
 * exists, on the design data itself.
 */
/** WCAG 2.2 AA large-text minimum (≥18pt or ≥14pt bold): 3:1. */
const AA_LARGE = 3.0;

export function wcagContrast(project: Project, minimumRatio = 4.5): Finding[] {
  const findings: Finding[] = [];

  for (const screen of project.screens) {
    for (const component of screen.components ?? []) {
      if (!component.fg || !component.bg) continue;
      const required = component.textRole === "large"
        ? Math.min(AA_LARGE, minimumRatio)
        : minimumRatio;
      const ratio = contrastRatio(component.fg, component.bg);
      if (ratio < required) {
        findings.push({
          critic: CRITIC,
          code: "contrast-below-aa",
          severity: "error",
          screen: screen.id,
          component: component.id ?? component.semantic,
          message: `"${component.semantic}" on screen "${screen.id}" has contrast ${ratio.toFixed(2)}:1 (${component.fg} on ${component.bg}) — below the ${required}:1 minimum for ${component.textRole === "large" ? "large" : "normal"} text.`,
          fix: `Darken/lighten one side until the ratio reaches ${required}:1.`,
        });
      }
    }
  }

  return findings;
}
