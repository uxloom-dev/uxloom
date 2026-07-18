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
}).strict();

export const PlatformIdSchema = z.enum(["web", "mweb", "ios", "android"]);

export const ExemptionSchema = z.object({
  state: z.string().min(1),
  reason: z.string().min(15, "an exemption reason must be a real sentence, not a token"),
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
}).strict();

export const JourneyStateSchema = z.object({
  screen: z.string().min(1),
  final: z.boolean().optional(),
  on: z.record(z.string().regex(targetRefPattern)).optional(),
}).strict();

export const JourneySchema = z.object({
  id: z.string().min(1),
  goal: z.string().optional(),
  entry: z.string().min(1),
  states: z.record(JourneyStateSchema),
}).strict();

export const ProjectSchema = z.object({
  name: z.string().min(1),
  formatVersion: z.literal("0.1"),
  platforms: z.array(PlatformIdSchema).min(1),
  journeys: z.array(JourneySchema),
  screens: z.array(ScreenSchema),
}).strict();

export type ProjectInput = z.input<typeof ProjectSchema>;
