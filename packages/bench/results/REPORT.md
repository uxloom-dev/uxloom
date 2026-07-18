# UXLoom benchmark report

| Dimension | Grade | Evidence |
|---|---|---|
| Critic correctness | **A** | precision 1.000, recall 1.000, F1 1.000 over 20 golden cases (34 planted defects) |
| Determinism | **A** | 25 in-process runs + 2 fresh processes → 1 unique report hash |
| Performance | **A** | 10 screens: 0.0ms · 100 screens: 0.2ms · 500 screens: 1.5ms · 1000 screens: 4.4ms · CLI cold start 77ms |
| Robustness | **A** | 500 fuzzed inputs → 0 crashes (424 rejected cleanly, 76 still-valid accepted) |

## Per-code detection

| Finding code | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| unreachable | 4 | 0 | 0 | 1.00 | 1.00 |
| dead-end | 6 | 0 | 0 | 1.00 | 1.00 |
| no-final-state | 1 | 0 | 0 | 1.00 | 1.00 |
| target-missing | 2 | 0 | 0 | 1.00 | 1.00 |
| screen-missing | 1 | 0 | 0 | 1.00 | 1.00 |
| target-state-missing | 1 | 0 | 0 | 1.00 | 1.00 |
| state-undesigned | 2 | 0 | 0 | 1.00 | 1.00 |
| contract-drift | 3 | 0 | 0 | 1.00 | 1.00 |
| happy-path-contract | 1 | 0 | 0 | 1.00 | 1.00 |
| contradictory-exemption | 4 | 0 | 0 | 1.00 | 1.00 |
| contrast-below-aa | 4 | 0 | 0 | 1.00 | 1.00 |
| target-too-small | 2 | 0 | 0 | 1.00 | 1.00 |
| label-overflow | 3 | 0 | 0 | 1.00 | 1.00 |

All golden cases matched ground truth exactly.

## Method

Golden projects are generated clean (zero findings by construction), then
defects are injected from a 13-entry catalog with known ground truth
(seeded RNG, fully reproducible). Detection is scored per finding code with
location matching. Determinism hashes the full report JSON. Performance is
median-of-5 on warm runs plus true process cold starts. Fuzzing applies
random structural mutations and requires clean schema rejection.
