/**
 * Configurable critic thresholds (RFC 0003 R1). Defaults are the
 * standards-derived values the critics have always used; companies with
 * stricter bars override them via uxloom.config.json.
 */
export interface CriticOptions {
  /** Minimum contrast ratio for normal text (default 4.5 — WCAG 2.2 AA). */
  contrastRatio?: number;
  /** Localization expansion planning factor (default 1.4). */
  expansionFactor?: number;
  /** Per-platform minimum touch-target px. */
  touchTargets?: Partial<Record<"web" | "mweb" | "ios" | "android", number>>;
}

export const DEFAULT_OPTIONS: Required<CriticOptions> = {
  contrastRatio: 4.5,
  expansionFactor: 1.4,
  touchTargets: { ios: 44, android: 48, mweb: 44, web: 24 },
};

export function withDefaults(options?: CriticOptions): Required<CriticOptions> {
  return {
    contrastRatio: options?.contrastRatio ?? DEFAULT_OPTIONS.contrastRatio,
    expansionFactor: options?.expansionFactor ?? DEFAULT_OPTIONS.expansionFactor,
    touchTargets: { ...DEFAULT_OPTIONS.touchTargets, ...options?.touchTargets },
  };
}
