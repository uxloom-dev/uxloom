import { z } from "zod";

/** Zod schemas mirroring types.ts — the runtime validation layer. */

const stateIdPattern = /^[a-zA-Z][\w-]*(\.[\w-]+)*$/;
const targetRefPattern = /^[a-zA-Z][\w-]*(#[a-zA-Z][\w-]*(\.[\w-]+)*)?$/;
const hexColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// .strict() everywhere: an unknown key is an agent's typo, and silently
// stripping it turns a mistake into invisible data loss.

export const LabelSchema = z.object({
  key: z.string().min(1),
  en: z.string().min(1),
  maxChars: z.number().int().positive().optional(),
}).strict();

export const ScreenComponentSchema = z.object({
  id: z.string().optional(),
  semantic: z.string().min(1),
  label: LabelSchema.optional(),
  fg: z.string().regex(hexColor, "fg must be a hex color like #1A2B3C").optional(),
  bg: z.string().regex(hexColor, "bg must be a hex color like #FFFFFF").optional(),
  minTargetPx: z.number().positive().optional(),
  interactive: z.boolean().optional(),
  /** Text size class: "large" (≥18pt/14pt-bold) checks contrast at 3:1. */
  textRole: z.enum(["normal", "large"]).optional(),
  /** Motion intent: decorative motion must honor prefers-reduced-motion. */
  motion: z.enum(["none", "decorative", "essential"]).optional(),
  /** Field validation intent — documented for codegen, rendered as chips. */
  validation: z.object({
    required: z.boolean().optional(),
    pattern: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
  }).strict().optional(),
}).strict();

export const PlatformIdSchema = z.enum(["web", "mweb", "ios", "android"]);

export const ExemptionSchema = z.object({
  state: z.string().min(1),
  reason: z.string().min(15, "an exemption reason must be a real sentence, not a token"),
}).strict();

/** Evidence behind a design decision — makes intelligence verifiable. */
export const RationaleSchema = z.object({
  decision: z.string().min(1),
  reasoning: z.string().min(10, "a rationale is an argument, not a token"),
  alternatives: z.array(z.object({
    option: z.string().min(1),
    pros: z.array(z.string().min(1)).min(1),
    cons: z.array(z.string().min(1)).min(1),
  }).strict()).optional(),
  sources: z.array(z.string().min(1)).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
}).strict();

export const BLOCK_TYPES = [
  "header", "nav", "hero", "text", "list", "card", "form", "field",
  "button", "image", "table", "footer", "custom",
] as const;

const BlockBase = z.object({
  type: z.enum(BLOCK_TYPES),
  label: z.string().optional(),
  /** Repeat count for list/card rows in the wireframe (default 3). */
  count: z.number().int().min(1).max(12).optional(),
  /** Real column names for table blocks. */
  columns: z.array(z.string().min(1)).optional(),
  /** Real copy for text/hero blocks — content is design material. */
  copy: z.string().optional(),
  /** Named data binding this block renders (documents intent for codegen). */
  source: z.string().optional(),
  /** Sortable columns/keys (list & table blocks) — interaction intent. */
  sort: z.array(z.string().min(1)).optional(),
  /** Filterable columns/keys (list & table blocks) — interaction intent. */
  filter: z.array(z.string().min(1)).optional(),
  /** R33 — component variant (buttons, badges): primary is the default. */
  variant: z.enum(["primary", "secondary", "danger", "ghost"]).optional(),
  /** R33 — component state (fields, buttons): default when absent. */
  state: z.enum(["default", "error", "disabled"]).optional(),
});
export const BlockSchema = BlockBase.extend({
  children: z.array(BlockBase.strict()).optional(),
}).strict();

export const LayoutSchema = z.object({
  blocks: z.array(BlockSchema).min(1),
}).strict();

export const ScreenSchema = z.object({
  id: z.string().min(1),
  intent: z.string().optional(),
  requiredStates: z.array(z.string().regex(stateIdPattern)).min(1),
  designedStates: z.array(z.string().regex(stateIdPattern)),
  components: z.array(ScreenComponentSchema).optional(),
  platforms: z.array(PlatformIdSchema).optional(),
  exemptions: z.array(ExemptionSchema).optional(),
  layout: LayoutSchema.optional(),
  /** Named data shape this screen renders, field → type descriptor. */
  data: z.record(z.string().min(1)).optional(),
  /** Evidence behind this screen's design decisions. */
  rationale: RationaleSchema.optional(),
}).strict();

/** Rich transition: target plus optional guard condition and role scoping. */
export const TransitionSchema = z.union([
  z.string().regex(targetRefPattern),
  z.object({
    target: z.string().regex(targetRefPattern),
    /** Human/agent-readable condition, e.g. "cart.total > 0". */
    guard: z.string().min(1).optional(),
    /** Roles this transition applies to, e.g. ["admin"]. */
    roles: z.array(z.string().min(1)).min(1).optional(),
  }).strict(),
]);

export const JourneyStateSchema = z.object({
  screen: z.string().min(1),
  final: z.boolean().optional(),
  on: z.record(TransitionSchema).optional(),
}).strict();

export const JourneySchema = z.object({
  id: z.string().min(1),
  goal: z.string().optional(),
  entry: z.string().min(1),
  states: z.record(JourneyStateSchema),
  /** Scope a journey to a platform subset (divergent mobile/desktop flows). */
  platforms: z.array(PlatformIdSchema).min(1).optional(),
  /** Evidence behind this flow's shape. */
  rationale: RationaleSchema.optional(),
}).strict();

export const TokensSchema = z.object({
  colors: z.object({
    accent: z.string().regex(hexColor).optional(),
    bg: z.string().regex(hexColor).optional(),
    surface: z.string().regex(hexColor).optional(),
    text: z.string().regex(hexColor).optional(),
    muted: z.string().regex(hexColor).optional(),
    // R32 — optional structural + semantic colors; renderers derive sensible
    // defaults when absent, so existing projects need no change.
    border: z.string().regex(hexColor).optional(),
    success: z.string().regex(hexColor).optional(),
    warning: z.string().regex(hexColor).optional(),
    danger: z.string().regex(hexColor).optional(),
  }).strict().optional(),
  radius: z.number().min(0).max(32).optional(),
  font: z.string().min(1).optional(),
  // R32 — light/dark hint. When absent, renderers auto-detect from bg luminance.
  mode: z.enum(["light", "dark"]).optional(),
}).strict();

export const ProjectSchema = z.object({
  name: z.string().min(1),
  formatVersion: z.literal("0.1"),
  platforms: z.array(PlatformIdSchema).min(1),
  journeys: z.array(JourneySchema),
  screens: z.array(ScreenSchema),
  /** Design tokens — the preview applies them; palette_check can verify them. */
  tokens: TokensSchema.optional(),
  /** Fragment globs (relative to the project file) merged at load time. */
  include: z.array(z.string().min(1)).optional(),
  /** Evidence behind product-level decisions: IA, brand direction, patterns. */
  rationale: RationaleSchema.optional(),
}).strict();

/** A fragment file: partial design merged into the base project at load. */
export const FragmentSchema = z.object({
  journeys: z.array(JourneySchema).optional(),
  screens: z.array(ScreenSchema).optional(),
}).strict();

export type ProjectInput = z.input<typeof ProjectSchema>;
