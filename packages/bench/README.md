# @uxloom/bench

Benchmark harness proving UXLoom's four product guarantees with evidence,
not adjectives. Run everything:

```bash
cd packages/bench && npm run bench
```

Writes `results/REPORT.md` (scorecard) and `results/report.json`.

## What is measured, and why these dimensions

| Dimension | Method | Why it matters |
|---|---|---|
| **Critic correctness** | 13-defect catalog injected into generated-clean projects (seeded RNG, reproducible); detection scored per finding code with location matching → precision / recall / F1 | A validator that misses defects is useless; one that invents them gets uninstalled |
| **Determinism** | Full-report SHA-256 across 25 in-process runs + 2 fresh processes | The USP: same input, same report — what makes UXLoom CI-gateable where LLM judgment isn't |
| **Performance** | Median critique time at 10/100/500/1000 screens + true CLI cold start | Validation must stay interactive at enterprise scale (200–500 screens) |
| **Robustness** | 500 random structural mutations; every input must be accepted or rejected cleanly, never crash | Agents send malformed data; a typo must fail loudly, not corrupt silently |

Honest scope note: the golden set proves every documented check fires exactly
where planted and nowhere else — a regression baseline against the defect
catalog, not proof against defect classes the critics don't model yet. New
defect ideas belong in `src/generate.mjs` (`DEFECTS`) first, then in critics.

## Skill evals (`evals/`)

Scenario definitions follow the official Agent Skills evaluation structure
(`query` + `expected_behavior`). Two layers:

- **Layer 1 — mechanical grading, free, agent-agnostic:**
  `node evals/grade.mjs <eval-id> <workspace>` grades any agent's output
  with evidence-based assertions (no LLM judging). Works for Claude Code,
  Codex, or any CLI that worked the task in `<workspace>`.
- **Layer 2 — skill lift, costs tokens, opt-in:**
  `UXLOOM_AGENT_EVAL=1 node evals/run-agent-eval.mjs` drives the `claude`
  CLI through every eval twice (with/without the skill installed) and
  reports the pass-rate difference — the measured value of the skill.

Evals: `design-from-prompt`, `validate-generated`, `exemption-honesty`
(does the agent exempt honestly instead of gaming the contract?), `ci-gate`.
