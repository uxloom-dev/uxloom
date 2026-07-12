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

/** WCAG 2.2 AA for normal text. Large-text (3:1) can come later via a size hint. */
const AA_NORMAL = 4.5;

/**
 * Checks every component that declares both fg and bg against WCAG AA.
 * Declared-color checking is deliberate: it runs before any rendering
 * exists, on the design data itself.
 */
export function wcagContrast(project: Project): Finding[] {
  const findings: Finding[] = [];

  for (const screen of project.screens) {
    for (const component of screen.components ?? []) {
      if (!component.fg || !component.bg) continue;
      const ratio = contrastRatio(component.fg, component.bg);
      if (ratio < AA_NORMAL) {
        findings.push({
          critic: CRITIC,
          severity: "error",
          screen: screen.id,
          component: component.id ?? component.semantic,
          message: `"${component.semantic}" on screen "${screen.id}" has contrast ${ratio.toFixed(2)}:1 (${component.fg} on ${component.bg}) — below WCAG AA 4.5:1 for normal text.`,
          fix: `Darken/lighten one side until the ratio reaches 4.5:1.`,
        });
      }
    }
  }

  return findings;
}
