import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  JourneySchema,
  ScreenSchema,
  PlatformIdSchema,
  ProjectSchema,
  type Journey,
  type Project,
  type Screen,
} from "@uxloom/journeygraph";
import { critique, critiqueScreen, contrastRatio } from "@uxloom/critics";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { ProjectStore } from "./store.js";
import { briefQuestions, compileBrief } from "./brief.js";
import { loadMap, runAudit } from "./audit.js";
import {
  commentFindings,
  commentStatus,
  criticOptionsFor,
  loadReviews,
  loadWorkspace,
  reviewsPathFor,
  saveComments,
  saveReviews,
} from "./workspace.js";
import { rationaleCoverage } from "@uxloom/critics";

// Version is DERIVED from package.json — never hardcode it here again.
// (Hand-bumped strings drifted three releases in a row before this.)
const { version: VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function createServer(store = new ProjectStore()): McpServer {
  const server = new McpServer({ name: "uxloom", version: VERSION });

  server.tool(
    "project_init",
    "Create a new UXLoom project file (uxloom.project.json). Run once per product.",
    {
      name: z.string().describe("Product name"),
      platforms: z.array(PlatformIdSchema).min(1).describe("Target platforms"),
    },
    async ({ name, platforms }) => {
      const project = store.init(name, platforms);
      return json({ ok: true, path: store.path, project });
    },
  );

  server.tool(
    "brief_start",
    "Start a design brief. Returns a structured questionnaire. Answer every question you can yourself — from the provided context document (PRD, spec) first, then conversation context; only relay questions marked askHuman:true to the user. Then call brief_answer.",
    {
      prompt: z.string().describe("The product/design request, verbatim"),
      context: z
        .string()
        .optional()
        .describe("Existing product context if any: PRD, spec, or design doc contents. When provided, extract answers from it instead of asking."),
    },
    async ({ prompt, context }) => {
      return json({
        resultType: "inputRequired",
        instructions: context
          ? "A context document was provided. Extract every answer you can from it — including askHuman questions like brand, if the document states them. Only relay to the user what the document and conversation genuinely do not answer. Unanswered questions fall back to their default and are logged in the assumption ledger."
          : "Fill answers from conversation context. Only askHuman:true questions go to the user. Unanswered questions fall back to their default and are logged in the assumption ledger.",
        inputRequests: briefQuestions(prompt),
      });
    },
  );

  server.tool(
    "brief_answer",
    "Submit brief answers. Unanswered fields take researched defaults and are recorded in the assumption ledger (auditable, reversible).",
    {
      prompt: z.string().describe("Same prompt passed to brief_start"),
      answers: z
        .record(z.unknown())
        .describe("Question id → answer. Omit what you could not answer."),
    },
    async ({ prompt, answers }) => {
      const brief = compileBrief(prompt, answers);
      return json({
        ok: true,
        brief,
        next: "Define journeys with journey_define, register screens with screen_register, then run project_validate.",
      });
    },
  );

  server.tool(
    "journey_define",
    "Add or replace a journey (a state machine: states reference screens, events move between states). Screens referenced here must be registered via screen_register before project_validate passes.",
    { journey: JourneySchema.describe("The journey definition") },
    async ({ journey }) => {
      const project = store.load();
      const idx = project.journeys.findIndex((j) => j.id === journey.id);
      if (idx >= 0) project.journeys[idx] = journey as Journey;
      else project.journeys.push(journey as Journey);
      store.save(project);
      return json({ ok: true, journeys: project.journeys.map((j) => j.id) });
    },
  );

  server.tool(
    "screen_register",
    "Add or replace a screen: its intent, requiredStates (the contract), designedStates (progress), and components with colors/labels/target sizes for the critics.",
    { screen: ScreenSchema.describe("The screen definition") },
    async ({ screen }) => {
      const project = store.load();
      const idx = project.screens.findIndex((s) => s.id === screen.id);
      if (idx >= 0) project.screens[idx] = screen as Screen;
      else project.screens.push(screen as Screen);
      store.save(project);
      return json({ ok: true, screens: project.screens.map((s) => s.id) });
    },
  );

  server.tool(
    "project_import",
    "Replace the whole project in one call: journeys and screens together. Prefer this over many journey_define/screen_register calls when registering a complete or large design. Validates the full document; unknown fields are rejected.",
    { project: ProjectSchema.describe("The complete JourneyGraph project document") },
    async ({ project }) => {
      store.save(project as Project);
      const report = critique(project as Project);
      return json({
        ok: true,
        path: store.path,
        journeys: (project as Project).journeys.map((j) => j.id),
        screens: (project as Project).screens.map((s) => s.id),
        validation: report.summary,
      });
    },
  );

  server.tool(
    "project_export",
    "Return the complete current project document (for inspection, backup, or transformation before a project_import).",
    {},
    async () => {
      return json(store.load());
    },
  );

  server.tool(
    "palette_check",
    "Check a design system's color pairs against WCAG 2.2 AA (4.5:1) before any screens exist. Reports each pair's exact ratio, pass/fail, and thin-margin passes (under 5.0:1) that one shade lighter would break.",
    {
      pairs: z
        .array(
          z.object({
            name: z.string().describe("Human name, e.g. 'secondary text on paper'"),
            fg: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
            bg: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
          }),
        )
        .min(1),
    },
    async ({ pairs }) => {
      const results = pairs.map(({ name, fg, bg }) => {
        const ratio = contrastRatio(fg, bg);
        return {
          name,
          fg,
          bg,
          ratio: Math.round(ratio * 100) / 100,
          passesAA: ratio >= 4.5,
          thinMargin: ratio >= 4.5 && ratio < 5.0,
        };
      });
      return json({
        results,
        failures: results.filter((r) => !r.passesAA).length,
        thinMargins: results.filter((r) => r.thinMargin).length,
        note: "Thin-margin pairs pass today but fail with minor tint/shade drift — pin them in your token system.",
      });
    },
  );

  server.tool(
    "design_review",
    "One iterative design-review round (max 3 per project — enforced). Computes validation + rationale coverage, persists the round with deltas to <project>.reviews.json, and returns a structured rubric to critique the design against: completeness, evidence, consistency, market fit, accessibility, honesty. Address the rubric, improve the design, then call again. Round 4 is refused: present results to the user instead.",
    {
      notes: z.string().optional().describe("What this round focused on / what changed since the last round"),
    },
    async ({ notes }) => {
      const ws = loadWorkspace(store.path);
      const reviewsPath = reviewsPathFor(ws.projectPath);
      const rounds = loadReviews(reviewsPath);
      if (rounds.length >= 3) {
        return json({
          allowed: false,
          roundsUsed: rounds.length,
          maxRounds: 3,
          history: rounds,
          message:
            "All 3 review rounds are used. Present the design and its evidence to the user — further iteration needs their direction, not more self-review.",
        });
      }
      const report = critique(ws.project, criticOptionsFor(ws.config));
      const coverage = rationaleCoverage(ws.project);
      const previous = rounds.at(-1);
      const entry = {
        round: rounds.length + 1,
        at: new Date().toISOString(),
        errors: report.summary.errors,
        warnings: report.summary.warnings,
        rationale: { documented: coverage.documented, total: coverage.total },
        notes,
      };
      saveReviews(reviewsPath, [...rounds, entry]);
      return json({
        allowed: true,
        round: entry.round,
        maxRounds: 3,
        delta: previous
          ? {
              errors: entry.errors - previous.errors,
              warnings: entry.warnings - previous.warnings,
              rationaleDocumented: entry.rationale.documented - previous.rationale.documented,
            }
          : null,
        validation: report.summary,
        openFindings: report.findings.slice(0, 30),
        rationaleCoverage: coverage,
        rubric: [
          "COMPLETENESS — every journey reaches a final state; every screen contract covers empty/loading/error or carries a written exemption; no validation errors remain.",
          "EVIDENCE — every screen, journey, and the project carry rationale with ≥1 rejected alternative (real pros AND cons) and sources for factual claims; nothing thin.",
          "CONSISTENCY — tokens used coherently; component semantics, state naming, and copy tone uniform across screens; labels carry i18n keys and budgets.",
          "MARKET FIT — compare against references/patterns.md conventions for this product category (and live research when available): does each major pattern choice match or deliberately diverge, and is divergence argued in the rationale?",
          "ACCESSIBILITY — interactive elements labeled, contrast declared and passing, targets sized, decorative motion has fallbacks.",
          "HONESTY — exemptions have real reasons; no contract weakened to silence a finding; reviewer comments addressed, not dismissed.",
        ],
        instruction:
          entry.round < 3
            ? `Round ${entry.round} of 3. Critique the design against every rubric line, fix what you find, then call design_review again.`
            : "Final round (3 of 3). Fix what you find, then present the design with its full evidence — decisions, alternatives, sources, confidence — to the user.",
      });
    },
  );

  server.tool(
    "comments_list",
    "Reviewer comments from the preview, with lifecycle status. Comments the reviewer clicked \"→ agent\" on are ASSIGNED — they are your work queue: call comment_context for each (assigned first, then open), make the change, then comment_resolve. Check this at session start and after every validation run.",
    {
      status: z
        .enum(["open", "assigned", "resolved", "all"])
        .optional()
        .describe("Filter by effective status. Default: unresolved (open + assigned), assigned first."),
    },
    async ({ status }) => {
      const ws = loadWorkspace(store.path);
      const withStatus = ws.comments.map((c) => ({ ...c, status: commentStatus(c) }));
      const filtered =
        status === "all"
          ? withStatus
          : status
            ? withStatus.filter((c) => c.status === status)
            : withStatus.filter((c) => c.status !== "resolved");
      const rank = { assigned: 0, open: 1, resolved: 2 } as const;
      filtered.sort((a, b) => rank[a.status] - rank[b.status] || a.createdAt.localeCompare(b.createdAt));
      const counts = {
        open: withStatus.filter((c) => c.status === "open").length,
        assigned: withStatus.filter((c) => c.status === "assigned").length,
        resolved: withStatus.filter((c) => c.status === "resolved").length,
      };
      return json({
        comments: filtered,
        counts,
        next:
          counts.assigned > 0
            ? "Assigned comments first: call comment_context with each id, address it, then comment_resolve with a resolution note."
            : counts.open > 0
              ? "Open comments are reviewer feedback awaiting action — address them, then let the reviewer resolve (or resolve with a note after addressing)."
              : "No unresolved comments.",
      });
    },
  );

  server.tool(
    "comment_context",
    "The full work packet for one reviewer comment: the comment, the exact layout block its pin lands on, the complete screen definition (contract, components, layout, rationale, exemptions), every journey state referencing that screen with its transitions, and the current validation findings scoped to that screen. Use it to address the comment precisely, then call comment_resolve.",
    { id: z.string().describe("Comment id from comments_list") },
    async ({ id }) => {
      const ws = loadWorkspace(store.path);
      const comment = ws.comments.find((c) => c.id === id);
      if (!comment) {
        return json({
          error: `no comment with id "${id}"`,
          unresolvedIds: ws.comments.filter((c) => commentStatus(c) !== "resolved").map((c) => c.id),
        });
      }
      const screen = ws.project.screens.find((s) => s.id === comment.screen);
      const blocks = screen?.layout?.blocks;
      const anchoredBlock =
        comment.block && blocks
          ? comment.block.index < blocks.length
            ? blocks[comment.block.index]
            : { note: `stale anchor: pin recorded block index ${comment.block.index} (${comment.block.type}) but the layout now has ${blocks.length} blocks — locate the block by its recorded type/label instead` }
          : null;
      const journeyRefs = ws.project.journeys.flatMap((j) =>
        Object.entries(j.states)
          .filter(([, s]) => s.screen === comment.screen)
          .map(([stateId, s]) => ({ journey: j.id, state: stateId, final: s.final ?? false, on: s.on ?? {} })),
      );
      return json({
        comment: { ...comment, status: commentStatus(comment) },
        anchoredBlock,
        screen: screen ?? { note: `screen "${comment.screen}" is no longer in the project — the comment may be outdated; resolve it with a note saying so` },
        journeyRefs,
        screenFindings: screen ? critiqueScreen(ws.project, comment.screen) : [],
        instruction:
          "Address exactly what the comment asks — via the MCP tools or by editing the project file — then call comment_resolve with a resolution note the reviewer will read. Never resolve without addressing.",
      });
    },
  );

  server.tool(
    "comment_resolve",
    "Resolve a reviewer comment after addressing it. The resolution note is shown to the reviewer and persisted; the pin clears live in every open preview. Never resolve without actually making the change.",
    {
      id: z.string().describe("Comment id"),
      resolution: z
        .string()
        .min(10)
        .describe("What was changed and why — a real sentence the reviewer will read, not an acknowledgment"),
    },
    async ({ id, resolution }) => {
      const ws = loadWorkspace(store.path);
      const comment = ws.comments.find((c) => c.id === id);
      if (!comment) {
        return json({
          error: `no comment with id "${id}"`,
          unresolvedIds: ws.comments.filter((c) => commentStatus(c) !== "resolved").map((c) => c.id),
        });
      }
      if (commentStatus(comment) === "resolved") {
        return json({ error: `comment "${id}" is already resolved`, comment });
      }
      comment.status = "resolved";
      comment.resolved = true;
      comment.resolvedAt = new Date().toISOString();
      comment.resolvedBy = "agent";
      comment.resolution = resolution;
      saveComments(ws.commentsPath, ws.comments);
      const remaining = ws.comments.filter((c) => commentStatus(c) !== "resolved");
      const assigned = remaining.filter((c) => commentStatus(c) === "assigned");
      return json({
        ok: true,
        resolved: comment,
        remaining: { open: remaining.length - assigned.length, assigned: assigned.length },
        next:
          assigned.length > 0
            ? `${assigned.length} assigned comment(s) remain — continue with comment_context on "${assigned[0].id}".`
            : remaining.length > 0
              ? `${remaining.length} open comment(s) remain — address them too.`
              : "All reviewer comments resolved.",
      });
    },
  );

  server.tool(
    "project_audit",
    "Audit the implementation against the design contract (drift detection). Static tiers: the uxloom.map.json screen registry and data-ux-screen/data-ux-state markers in source. Returns per-state verdicts (implemented with file:line evidence / unimplemented / unproven) and findings with fixes. When implementing screens from the contract, emit data-ux-state markers so the code stays self-auditing.",
    {
      root: z
        .string()
        .optional()
        .describe("Implementation root directory to scan (default: the project file's directory)"),
    },
    async ({ root }) => {
      const project = store.load();
      const auditRoot = root ?? dirname(store.path);
      const map = loadMap(resolve(auditRoot, "uxloom.map.json"));
      return json(runAudit(project, auditRoot, map));
    },
  );

  server.tool(
    "project_validate",
    "Run every critic: journey completeness (unreachable states, dead ends, broken transitions), state coverage, WCAG contrast, touch targets, text expansion — plus fragment-merge errors and open reviewer comments from the preview. Honors uxloom.config.json thresholds. Iterate until errors = 0 and reviewer comments are addressed.",
    {},
    async () => {
      const ws = loadWorkspace(store.path);
      const report = critique(ws.project, criticOptionsFor(ws.config));
      const extra = [...ws.loadFindings, ...commentFindings(ws.comments)];
      return json({
        ...report,
        findings: [...extra, ...report.findings],
        summary: {
          ...report.summary,
          errors: report.summary.errors + extra.filter((f) => f.severity === "error").length,
          warnings: report.summary.warnings + extra.filter((f) => f.severity === "warning").length,
          openReviewerComments: ws.comments.filter((c) => !c.resolved).length,
          assignedComments: ws.comments.filter((c) => commentStatus(c) === "assigned").length,
          fragments: ws.fragments.length,
        },
      });
    },
  );

  server.tool(
    "screen_critique",
    "Findings scoped to a single screen. Use during iteration on one screen.",
    { screenId: z.string() },
    async ({ screenId }) => {
      const project = store.load();
      return json({ screenId, findings: critiqueScreen(project, screenId) });
    },
  );

  server.tool(
    "coverage_report",
    "The demo number: screens delivered vs. states the journeys actually need. Returns per-screen coverage and the missing-state list.",
    {},
    async () => {
      const project = store.load();
      const report = critique(project);
      const perScreen = project.screens.map((s) => ({
        screen: s.id,
        required: s.requiredStates.length,
        designed: s.requiredStates.filter((st) => s.designedStates.includes(st)).length,
        missing: s.requiredStates.filter((st) => !s.designedStates.includes(st)),
      }));
      const missingTotal = perScreen.reduce((n, s) => n + s.missing.length, 0);
      // A weak contract hides gaps: count screens whose contract itself is
      // happy-path-only, so a rosy "0 missing" can't mislead.
      const happyPathScreens = new Set(
        report.findings
          .filter((f) => f.code === "happy-path-contract")
          .map((f) => f.screen),
      ).size;
      const headline =
        `${project.screens.length} screens registered — ${missingTotal} required states not yet designed` +
        (happyPathScreens > 0
          ? `, and ${happyPathScreens} screen contracts are happy-path-only (their gaps are not even counted yet).`
          : ".");
      return json({
        headline,
        perScreen,
        happyPathScreens,
        errors: report.summary.errors,
        warnings: report.summary.warnings,
      });
    },
  );

  return server;
}
