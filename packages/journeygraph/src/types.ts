/**
 * JourneyGraph v0 — design-as-data format.
 *
 * A project is a set of journeys (state machines) and screens (nodes).
 * Journeys reference screens; screens declare the states a design must
 * cover. Everything is plain JSON: diffable, git-friendly, agent-legible.
 */

/** A screen state id: "default", "empty", "loading", "error.network", ... */
export type StateId = string;

/**
 * Transition target. Either a journey state id ("payment") or a journey
 * state plus screen state ("payment#error.declined") when an event lands
 * on a specific designed state of that screen.
 */
export type TargetRef = string;

export interface JourneyState {
  /** Screen shown while the journey is in this state. */
  screen: string;
  /** Terminal state — the journey can legitimately end here. */
  final?: boolean;
  /** Event name → target state ref. */
  on?: Record<string, TargetRef>;
}

export interface Journey {
  id: string;
  /** What the user is trying to accomplish; used in reports. */
  goal?: string;
  /** Entry state id. */
  entry: string;
  states: Record<string, JourneyState>;
}

export interface Label {
  /** i18n key, e.g. "checkout.pay". */
  key: string;
  /** English source string. */
  en: string;
  /**
   * Maximum characters the designed layout can hold before truncating or
   * wrapping badly. Enables text-expansion checks before any rendering.
   */
  maxChars?: number;
}

export interface ScreenComponent {
  id?: string;
  /** Semantic role, e.g. "Button.Primary", "List.Selectable", "Nav.Tabs". */
  semantic: string;
  label?: Label;
  /** Foreground color (hex) if this component renders text. */
  fg?: string;
  /** Background color (hex) behind that text. */
  bg?: string;
  /** Smallest tap/click target dimension in px, if interactive. */
  minTargetPx?: number;
  /** True when the component is tappable/clickable. */
  interactive?: boolean;
}

export type PlatformId = "web" | "mweb" | "ios" | "android";

/**
 * A documented reason a baseline state (empty / loading / error.*) does not
 * apply to a screen. Suppresses the happy-path warning for that state —
 * auditable, never silent. Use state "error.any" to exempt the error family.
 */
export interface Exemption {
  state: string;
  reason: string;
}

/** A semantic layout block for wireframe rendering and code generation. */
export interface Block {
  type:
    | "header" | "nav" | "hero" | "text" | "list" | "card" | "form"
    | "field" | "button" | "image" | "table" | "footer" | "custom";
  label?: string;
  /** Repeat count for list/card rows in the wireframe (default 3). */
  count?: number;
  children?: Block[];
}

export interface Screen {
  id: string;
  /** One sentence: what this screen must let the user do. */
  intent?: string;
  /** States the design MUST cover (contract). */
  requiredStates: StateId[];
  /** States actually designed so far (progress). */
  designedStates: StateId[];
  components?: ScreenComponent[];
  /** Platforms this screen ships on. Defaults to all project platforms. */
  platforms?: PlatformId[];
  /** Documented non-applicability of baseline states. */
  exemptions?: Exemption[];
  /** Ordered semantic blocks; when absent, the preview derives a default. */
  layout?: { blocks: Block[] };
}

export interface Project {
  name: string;
  /** JourneyGraph format version. */
  formatVersion: "0.1";
  platforms: PlatformId[];
  journeys: Journey[];
  screens: Screen[];
}

/** A single issue reported by a critic. */
export interface Finding {
  critic: string;
  /** Stable machine-readable id for a class of finding. */
  code?: string;
  severity: "error" | "warning";
  journey?: string;
  state?: string;
  screen?: string;
  component?: string;
  message: string;
  /** Concrete suggested fix, when one exists. */
  fix?: string;
}

export interface Report {
  findings: Finding[];
  summary: {
    errors: number;
    warnings: number;
    journeys: number;
    screens: number;
    /** designedStates present / requiredStates declared, across screens. */
    stateCoverage: { designed: number; required: number };
  };
}
