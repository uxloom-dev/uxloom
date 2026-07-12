import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Project } from "@uxloom/journeygraph";
import { parseProject, emptyProject } from "@uxloom/journeygraph";

/**
 * File-backed project store. The project lives as one JSON file in the
 * workspace (default ./uxloom.project.json, override with UXLOOM_PROJECT),
 * so the design is versioned in git next to the code it specifies.
 */
export class ProjectStore {
  readonly path: string;

  constructor(path?: string) {
    this.path = resolve(path ?? process.env.UXLOOM_PROJECT ?? "uxloom.project.json");
  }

  exists(): boolean {
    return existsSync(this.path);
  }

  load(): Project {
    if (!this.exists()) {
      throw new Error(
        `No project at ${this.path}. Call project_init first (or set UXLOOM_PROJECT).`,
      );
    }
    return parseProject(JSON.parse(readFileSync(this.path, "utf8")));
  }

  save(project: Project): void {
    writeFileSync(this.path, JSON.stringify(project, null, 2) + "\n", "utf8");
  }

  init(name: string, platforms: Project["platforms"]): Project {
    const project = emptyProject(name, platforms);
    this.save(project);
    return project;
  }
}
