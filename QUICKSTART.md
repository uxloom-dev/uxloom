# UXLoom Quickstart

**What UXLoom is:** the validation layer for UI/UX design. You (or your AI
agent) design; UXLoom proves what's missing — unreachable screens, missing
empty/loading/error states, WCAG contrast failures, undersized touch
targets, labels that break under translation — before any code exists.

**What UXLoom is not:** it does not draw mockups or generate screens. It
makes whatever designs your agent produces *complete and provable*. Think
of it as the type-checker for UX.

**Prerequisites:** Node.js 20+. For the agent workflow: Claude Code, Codex
CLI, or any MCP client. No account, no API key, MIT licensed.

---

## Try it in 60 seconds (nothing to design yet)

```bash
git clone https://github.com/uxloom-dev/uxloom && cd uxloom
npx uxloom check examples/shopmweb/uxloom.generated.project.json
```

You'll see 9 errors a UI generator left behind. Now check the repaired
version — this is what "done" looks like:

```bash
npx uxloom check examples/shopmweb/uxloom.project.json
```

---

## Path A — design with Claude Code (the main workflow)

**1. Connect UXLoom** (once per project, or use `-s user` for everywhere):

```bash
cd your-project
claude mcp add uxloom -- npx -y uxloom
```

**2. Start Claude and ask for a design.** Example first prompt:

> Design the user journeys and screens for a habit-tracking mobile app
> (log habits, streaks, reminders) using UXLoom. Iterate until validation
> is clean.

**3. What happens next (and what's expected of you):**

- UXLoom interviews the agent through a structured brief. Claude answers
  most questions from context; **only taste questions reach you** (brand
  colors, tone). Claude reports the assumptions it made — correct any.
- Claude defines journeys (as state machines), registers screens with
  state contracts, then runs validation and fixes findings until the
  report is clean.
- You get `uxloom.project.json` in your project — **commit it**. That
  file is the design contract, versioned next to the code it specifies.

**4. Build from the contract.** The design now drives implementation:

> Implement the HabitListScreen as a React component. Cover every state
> in its uxloom contract: default, empty, loading, error.network.

**5. Change safely.** Any future request ("add a social sharing journey")
goes through the same loop — validation catches what the change broke.

### See the design — live wireframe mocks

```bash
npx uxloom preview        # opens live mocks at http://localhost:4400
```

Every screen and every contracted state rendered as wireframes (loading
skeletons, empty placeholders, error banners appear automatically), on
desktop/tablet/mobile frames, with clickable journey events. Keep it open
while your agent designs — it updates in real time.

### Verify any time, without the agent

```bash
npx uxloom check          # validates ./uxloom.project.json, exit 1 on errors
```

## Path B — Codex CLI

```bash
codex mcp add uxloom -- npx -y uxloom
```

Same workflow. The skill ships in the npm package (`skills/uxloom/`) —
copy it to `.agents/skills/` for best results.

## Path C — CI gate (no agent involved)

```yaml
# .github/workflows/design.yml
- run: npx uxloom check uxloom.project.json
```

A design with validation errors can now never merge.

---

## The rules that make it work

- **Every screen belongs to a journey.** No orphan screens; flows first.
- **Contracts are honest.** Every screen needs empty/loading/error states
  in `requiredStates` — or a written exemption when a state genuinely
  can't apply (a confirmation screen has no empty state). Findings can't
  be silenced by weakening the contract; UXLoom flags that too.
- **Zero errors is the exit condition.** `uxloom check` exits 1 otherwise.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `no project file at ...` | Run from the directory containing `uxloom.project.json`, pass a path, or set `UXLOOM_PROJECT` |
| Agent designs screens without UXLoom | Say "use UXLoom" explicitly, or install the skill from the npm package's `skills/` folder |
| Findings feel noisy on a screen | Don't delete required states — add an `exemptions` entry with a written reason |

Full format and finding reference: [packages/mcp-server/skills/uxloom/references/](packages/mcp-server/skills/uxloom/references/)
