export * from "./types.js";
export {
  ProjectSchema,
  JourneySchema,
  ScreenSchema,
  ScreenComponentSchema,
  LabelSchema,
  PlatformIdSchema,
  ExemptionSchema,
} from "./schema.js";

import { ProjectSchema } from "./schema.js";
import type { Project, Journey, Screen, TargetRef } from "./types.js";

/** Parse + validate an unknown value as a Project. Throws ZodError. */
export function parseProject(input: unknown): Project {
  return ProjectSchema.parse(input) as Project;
}

/** Split a target ref "payment#error.declined" → { state, screenState }. */
export function splitTarget(ref: TargetRef): { state: string; screenState?: string } {
  const i = ref.indexOf("#");
  return i === -1
    ? { state: ref }
    : { state: ref.slice(0, i), screenState: ref.slice(i + 1) };
}

export function getScreen(project: Project, id: string): Screen | undefined {
  return project.screens.find((s) => s.id === id);
}

export function getJourney(project: Project, id: string): Journey | undefined {
  return project.journeys.find((j) => j.id === id);
}

/** An empty valid project. */
export function emptyProject(name: string, platforms: Project["platforms"]): Project {
  return { name, formatVersion: "0.1", platforms, journeys: [], screens: [] };
}
