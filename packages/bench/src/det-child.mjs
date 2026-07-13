import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseProject } from "@uxloom/journeygraph";
import { critique } from "@uxloom/critics";

const project = parseProject(JSON.parse(readFileSync(process.argv[2], "utf8")));
process.stdout.write(
  createHash("sha256").update(JSON.stringify(critique(project))).digest("hex"),
);
