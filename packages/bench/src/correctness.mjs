/**
 * Correctness: run the critics over the golden set and score detection
 * against planted ground truth. Precision = of everything reported, how
 * much was real; Recall = of everything planted, how much was found.
 */
import { parseProject } from "@uxloom/journeygraph";
import { critique } from "@uxloom/critics";

function matches(finding, truth) {
  if (finding.code !== truth.code) return false;
  if (truth.state && finding.state !== truth.state) return false;
  if (truth.screen && finding.screen !== truth.screen) return false;
  if (truth.journey && finding.journey !== truth.journey) return false;
  return true;
}

export function runCorrectness(goldenSet) {
  const perCode = {};
  const caseResults = [];
  const bump = (code, key) => {
    perCode[code] ??= { tp: 0, fp: 0, fn: 0 };
    perCode[code][key]++;
  };

  for (const c of goldenSet) {
    const report = critique(parseProject(c.project));
    const unmatchedTruth = [...c.truth];
    const falsePositives = [];

    for (const finding of report.findings) {
      const i = unmatchedTruth.findIndex((t) => matches(finding, t));
      if (i >= 0) {
        bump(finding.code, "tp");
        unmatchedTruth.splice(i, 1);
      } else {
        bump(finding.code ?? "uncoded", "fp");
        falsePositives.push(finding);
      }
    }
    for (const t of unmatchedTruth) bump(t.code, "fn");

    caseResults.push({
      id: c.id,
      planted: c.truth.length,
      found: c.truth.length - unmatchedTruth.length,
      falsePositives: falsePositives.map((f) => `${f.code}@${f.screen ?? f.state ?? f.journey}`),
      missed: unmatchedTruth.map((t) => `${t.code}@${t.screen ?? t.state ?? t.journey}`),
    });
  }

  let tp = 0, fp = 0, fn = 0;
  const byCode = Object.fromEntries(
    Object.entries(perCode).map(([code, m]) => {
      tp += m.tp; fp += m.fp; fn += m.fn;
      const precision = m.tp + m.fp ? m.tp / (m.tp + m.fp) : 1;
      const recall = m.tp + m.fn ? m.tp / (m.tp + m.fn) : 1;
      return [code, { ...m, precision, recall }];
    }),
  );
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  return { overall: { tp, fp, fn, precision, recall, f1 }, byCode, caseResults };
}
