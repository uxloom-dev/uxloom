import { z } from "zod";

/** Zod schemas mirroring types.ts — the runtime validation layer. */

const stateIdPattern = /^[a-zA-Z][\w-]*(\.[\w-]+)*$/;
const targetRefPattern = /^[a-zA-Z][\w-]*(#[a-zA-Z][\w-]*(\.[\w-]+)*)?$/;
const hexColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const LabelSchema = z.object({
  key: z.string().min(1),
  en: z.string().min(1),
  maxChars: z.number().int().positive().optional(),
});

export const ScreenComponentSchema = z.object({
  id: z.string().optional(),
  semantic: z.string().min(1),
  label: LabelSchema.optional(),
  fg: z.string().regex(hexColor, "fg must be a hex color like #1A2B3C").optional(),
  bg: z.string().regex(hexColor, "bg must be a hex color like #FFFFFF").optional(),
  minTargetPx: z.number().positive().optional(),
  interactive: z.boolean().optional(),
});

export const PlatformIdSchema = z.enum(["web", "mweb", "ios", "android"]);

export const ScreenSchema = z.object({
  id: z.string().min(1),
  intent: z.string().optional(),
  requiredStates: z.array(z.string().regex(stateIdPattern)).min(1),
  designedStates: z.array(z.string().regex(stateIdPattern)),
  components: z.array(ScreenComponentSchema).optional(),
  platforms: z.array(PlatformIdSchema).optional(),
});

export const JourneyStateSchema = z.object({
  screen: z.string().min(1),
  final: z.boolean().optional(),
  on: z.record(z.string().regex(targetRefPattern)).optional(),
});

export const JourneySchema = z.object({
  id: z.string().min(1),
  goal: z.string().optional(),
  entry: z.string().min(1),
  states: z.record(JourneyStateSchema),
});

export const ProjectSchema = z.object({
  name: z.string().min(1),
  formatVersion: z.literal("0.1"),
  platforms: z.array(PlatformIdSchema).min(1),
  journeys: z.array(JourneySchema),
  screens: z.array(ScreenSchema),
});

export type ProjectInput = z.input<typeof ProjectSchema>;
