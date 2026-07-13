# UXLoom positioning

## The USP, in one sentence

**UXLoom is the only design tool where "done" is provable — deterministic
design contracts that make UI completeness a CI-gateable fact instead of an
opinion.**

## The pain, with numbers

- Design errors drive ~68% of rework cost; fixing a problem after shipping
  costs ~30× what it costs at design time. 62% of developers report redoing
  UI work due to design/communication gaps; a single product pod loses on
  the order of $300k/year to handoff inefficiency.
- AI generation made this worse, not better: generators produce happy-path
  screens at unprecedented volume, so **verification — not generation — is
  now the bottleneck**. Nothing in the market proves what generated UI is
  missing.
- 83% of designers report design/code divergence; 26% see it on every
  project. There is no artifact both sides can hold each other to.

## Why every alternative fails this specific job

| Alternative | Why it can't do this job |
|---|---|
| Figma / Penpot / canvas tools | Store pictures of decisions; a frame doesn't know its error state is missing and can't fail a build |
| v0 / Lovable / Figma Make / generators | Produce the happy path; they are the reason the gap exists, not the check on it |
| "Ask the LLM to review the design" | Non-deterministic: different answer every run, so it can never gate CI; findings are opinions without codes, locations, or fixes |
| Accessibility linters (axe, Stark) | Check rendered output late, in QA; nothing exists at design time, and nothing covers journey completeness or state coverage at all |

## The three properties that make the moat

1. **Design as data (JourneyGraph).** Journeys are state machines, screens
   carry contracts, everything lives in git next to the code. Diffable,
   reviewable, agent-native.
2. **Deterministic critics.** Same input, byte-identical report (benchmarked:
   SHA-256-stable across processes). This single property is what turns
   design quality from a review comment into a merge gate.
3. **Honesty mechanics.** Exemptions-with-reasons and happy-path-contract
   detection mean the score can't be gamed by weakening the contract — the
   failure mode of every checklist tool.

## Proof points (benchmarked, reproducible: `packages/bench`)

- Critic precision 1.000 / recall 1.000 against a 13-defect seeded catalog
- Byte-identical reports across 25 runs and independent processes
- 1000-screen project validated in under 5ms; CLI cold start under 100ms
- 500 fuzzed inputs, zero crashes — malformed data fails loudly, never silently

## Message hierarchy

1. "Your generator gave you 6 screens. UXLoom proves you're missing 9 states."
2. "The happy path is not a product."
3. "Deterministic, so it can gate CI — an LLM opinion can't."
4. "Zero findings is reachable honestly: exempt with a reason, never silently."
