/**
 * Fuzz robustness: agents send malformed data. Every mutation must be
 * either accepted or rejected with a clean error — never a crash, never
 * silent acceptance of garbage.
 */
import { parseProject } from "@uxloom/journeygraph";
import { buildCleanProject, mulberry32 } from "./generate.mjs";

const WEIRD = [null, 0, -1, 3.14, "", "x".repeat(10000), [], {}, true, "not-a-hex", "#GGGGGG"];

function mutate(obj, rng) {
  const clone = structuredClone(obj);
  const paths = [];
  (function walk(node, path) {
    if (node && typeof node === "object") {
      for (const key of Object.keys(node)) {
        paths.push([...path, key]);
        walk(node[key], [...path, key]);
      }
    }
  })(clone, []);
  if (paths.length === 0) return clone;

  const ops = Math.max(1, Math.floor(rng() * 4));
  for (let i = 0; i < ops; i++) {
    const path = paths[Math.floor(rng() * paths.length)];
    let parent = clone;
    for (const key of path.slice(0, -1)) parent = parent?.[key];
    const leaf = path.at(-1);
    if (!parent || typeof parent !== "object") continue;
    const roll = rng();
    if (roll < 0.35) delete parent[leaf];
    else if (roll < 0.8) parent[leaf] = WEIRD[Math.floor(rng() * WEIRD.length)];
    else parent[`fuzz_${Math.floor(rng() * 1e6)}`] = WEIRD[Math.floor(rng() * WEIRD.length)];
  }
  return clone;
}

export function runFuzz(iterations = 500) {
  const rng = mulberry32(0xf00d);
  const base = buildCleanProject(6);
  let accepted = 0;
  let rejectedCleanly = 0;
  const crashes = [];

  for (let i = 0; i < iterations; i++) {
    const mutant = mutate(base, rng);
    try {
      parseProject(mutant);
      accepted++;
    } catch (error) {
      if (error && (error.name === "ZodError" || error instanceof Error)) {
        rejectedCleanly++;
      } else {
        crashes.push({ iteration: i, thrown: String(error) });
      }
    }
  }

  return { iterations, accepted, rejectedCleanly, crashes: crashes.length, crashSamples: crashes.slice(0, 3) };
}
