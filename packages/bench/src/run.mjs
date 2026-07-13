/**
 * UXLoom benchmark: run every suite, grade every dimension, write the
 * scorecard. Usage: node src/run.mjs (from packages/bench).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGoldenSet, mulberry32 } from "./generate.mjs";
import { runCorrectness } from "./correctness.mjs";
import { runDeterminism } from "./determinism.mjs";
import { runPerf } from "./perf.mjs";
import { runFuzz } from "./fuzz.mjs";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "results");
mkdirSync(outDir, { recursive: true });

console.log("uxloom bench — running all suites\n");

const golden = buildGoldenSet(mulberry32(0xc0ffee));
const correctness = runCorrectness(golden);
console.log(`correctness  P=${correctness.overall.precision.toFixed(3)} R=${correctness.overall.recall.toFixed(3)} F1=${correctness.overall.f1.toFixed(3)} (${golden.length} cases)`);

const determinism = runDeterminism();
console.log(`determinism  ${determinism.deterministic ? "byte-identical across 25 runs + 2 processes" : "NON-DETERMINISTIC — INVESTIGATE"}`);

const perf = runPerf();
const p1000 = perf.scaling.find((s) => s.screens === 1000);
console.log(`performance  1000 screens: ${p1000.medianMs.toFixed(1)}ms | CLI cold start: ${perf.cliColdStartMedianMs.toFixed(0)}ms`);

const fuzz = runFuzz(500);
console.log(`robustness   ${fuzz.iterations} mutants: ${fuzz.accepted} accepted, ${fuzz.rejectedCleanly} rejected cleanly, ${fuzz.crashes} crashes`);

// ---- grading -------------------------------------------------------------
const grades = {
  correctness:
    correctness.overall.precision === 1 && correctness.overall.recall === 1 ? "A"
    : correctness.overall.f1 >= 0.95 ? "B"
    : correctness.overall.f1 >= 0.85 ? "C" : "F",
  determinism: determinism.deterministic ? "A" : "F",
  performance:
    p1000.medianMs < 100 && perf.cliColdStartMedianMs < 500 ? "A"
    : p1000.medianMs < 1000 ? "B" : "C",
  robustness: fuzz.crashes === 0 ? "A" : "F",
};
console.log(`\ngrades: ${Object.entries(grades).map(([k, v]) => `${k}=${v}`).join("  ")}`);

// ---- report --------------------------------------------------------------
const report = { generatedBy: "uxloom bench", grades, correctness, determinism, perf, fuzz };
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

const problemCases = correctness.caseResults.filter((c) => c.missed.length || c.falsePositives.length);
const md = `# UXLoom benchmark report

| Dimension | Grade | Evidence |
|---|---|---|
| Critic correctness | **${grades.correctness}** | precision ${correctness.overall.precision.toFixed(3)}, recall ${correctness.overall.recall.toFixed(3)}, F1 ${correctness.overall.f1.toFixed(3)} over ${golden.length} golden cases (${correctness.overall.tp} planted defects) |
| Determinism | **${grades.determinism}** | ${determinism.inProcessRuns} in-process runs + ${2} fresh processes → ${determinism.deterministic ? "1 unique report hash" : "MULTIPLE hashes"} |
| Performance | **${grades.performance}** | ${perf.scaling.map((s) => `${s.screens} screens: ${s.medianMs.toFixed(1)}ms`).join(" · ")} · CLI cold start ${perf.cliColdStartMedianMs.toFixed(0)}ms |
| Robustness | **${grades.robustness}** | ${fuzz.iterations} fuzzed inputs → ${fuzz.crashes} crashes (${fuzz.rejectedCleanly} rejected cleanly, ${fuzz.accepted} still-valid accepted) |

## Per-code detection

| Finding code | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
${Object.entries(correctness.byCode)
  .map(([code, m]) => `| ${code} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.precision.toFixed(2)} | ${m.recall.toFixed(2)} |`)
  .join("\n")}

${problemCases.length === 0 ? "All golden cases matched ground truth exactly." : `## Cases needing attention\n\n${problemCases.map((c) => `- **${c.id}**: missed ${JSON.stringify(c.missed)}, false positives ${JSON.stringify(c.falsePositives)}`).join("\n")}`}

## Method

Golden projects are generated clean (zero findings by construction), then
defects are injected from a 13-entry catalog with known ground truth
(seeded RNG, fully reproducible). Detection is scored per finding code with
location matching. Determinism hashes the full report JSON. Performance is
median-of-5 on warm runs plus true process cold starts. Fuzzing applies
random structural mutations and requires clean schema rejection.
`;
writeFileSync(join(outDir, "REPORT.md"), md);
console.log(`\nwrote results/report.json and results/REPORT.md`);

if (Object.values(grades).some((g) => g === "F")) process.exit(1);
