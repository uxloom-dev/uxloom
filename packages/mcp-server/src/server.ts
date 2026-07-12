import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  JourneySchema,
  ScreenSchema,
  PlatformIdSchema,
  type Journey,
  type Screen,
} from "@uxloom/journeygraph";
import { critique, critiqueScreen } from "@uxloom/critics";
import { ProjectStore } from "./store.js";
import { briefQuestions, compileBrief } from "./brief.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function createServer(store = new ProjectStore()): McpServer {
  const server = new McpServer({ name: "uxloom", version: "0.1.0" });

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
    "Start a design brief. Returns a structured questionnaire. Answer every question you can from conversation context yourself; only relay questions marked askHuman:true to the user. Then call brief_answer.",
    { prompt: z.string().describe("The product/design request, verbatim") },
    async ({ prompt }) => {
      return json({
        resultType: "inputRequired",
        instructions:
          "Fill answers from conversation context. Only askHuman:true questions go to the user. Unanswered questions fall back to their default and are logged in the assumption ledger.",
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
    "project_validate",
    "Run every critic: journey completeness (unreachable states, dead ends, broken transitions), state coverage, WCAG contrast, touch targets, text expansion. Returns all findings with fixes. Iterate until errors = 0.",
    {},
    async () => {
      const project = store.load();
      return json(critique(project));
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
