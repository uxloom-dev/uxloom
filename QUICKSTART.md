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

**1. Connect UXLoom** — one command sets up everything (MCP config, agent
skill, starter file):

```bash
cd your-project
npx uxloom init
```

(Equivalent manual form: `claude mcp add uxloom -- npx -y uxloom`.)

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
npx uxloom check          # design completeness, exit 1 on errors
npx uxloom audit          # does the code implement the contract? exit 1 on drift
```

## Path B — Codex CLI

```bash
codex mcp add uxloom -- npx -y uxloom
```

Same workflow. The skill ships in the npm package (`skills/uxloom/`) —
copy it to `.agents/skills/` for best results.

### Share it — stakeholders need a link, not npx

```bash
npx uxloom export         # writes uxloom-preview.html — email it, host it
```

### Design changes in PRs — readable, not JSON walls

```bash
npx uxloom diff --git main            # semantic diff vs main
npx uxloom diff old.json new.json --markdown   # PR-comment ready
```

### Native apps too

The audit reads native markers: add `// data-ux-screen: X` and
`// data-ux-state: y` comments (any language), or use
`.accessibilityIdentifier("ux-state:y")` in SwiftUI /
`Modifier.testTag("ux-state:y")` in Compose. With optional playwright
(`npm i -D playwright`), `npx uxloom audit --live http://localhost:3000`
verifies markers in the real DOM, and `npx uxloom export --png shots/`
renders every screen×state to images. `npx uxloom export --svg mocks/`
needs nothing extra — the SVGs import straight into Figma or Penpot.

### Designers: comment directly on the mocks — and hand them to the agent

In `npx uxloom preview`, toggle comment mode and click anywhere on a
screen to leave feedback. Open comments appear in `uxloom check` as
`reviewer-comment` warnings — your feedback enters the agent's fix loop,
and you resolve it in the preview when it's addressed.

Click **"→ agent"** on any comment to assign it. The agent (any MCP
client — Claude, Codex, anything) then reads the whole work packet with
`comment_context`: the pinned layout block, the screen contract, the
journey references, and the current findings for that screen. It makes
the change and calls `comment_resolve` with a note explaining what it did
— the pin clears live in your preview. One click turns a pinned note into
addressed work.

**Or edit directly**: toggle edit mode (✎) to reorder blocks, rewrite
copy and labels inline, add/remove blocks, and adjust design tokens —
every change writes to the same project file your agent works from,
validated before saving, live for every viewer.

## Path C — CI gate (no agent involved)

```yaml
# .github/workflows/design.yml
- run: npx uxloom check uxloom.project.json --github
- run: npx uxloom audit uxloom.project.json --github
```

Inline PR annotations via `--github`; `--sarif` for code scanning;
`--json` for anything else. **Adopting on an existing app?** Run
`npx uxloom check --update-baseline` once — existing findings are frozen
as acknowledged debt and only new drift fails the build.

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
