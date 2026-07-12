/**
 * The interview protocol, v0.
 *
 * Implemented as plain structured tool results so it works on every MCP
 * client today. Semantically aligned with MCP SEP-2322 (multi round-trip
 * requests); when clients adopt the 2026-07-28 spec, these questionnaires
 * move into `inputRequests` unchanged.
 *
 * Design rules:
 *  - every question ships a researched default → questions are requests
 *    for correction, not blank fields
 *  - `askHuman: false` → the agent should answer from conversation
 *    context; only `askHuman: true` questions escalate to the user
 *  - every defaulted answer lands in the assumption ledger
 */

export interface BriefQuestion {
  id: string;
  question: string;
  /** JSON-ish shape hint for the answer. */
  expects: string;
  default: unknown;
  rationale: string;
  askHuman: boolean;
}

export interface Brief {
  prompt: string;
  answers: Record<string, unknown>;
  /** Decisions taken from defaults, with rationale — auditable, reversible. */
  assumptionLedger: Array<{ question: string; assumed: unknown; rationale: string }>;
}

export function briefQuestions(prompt: string): BriefQuestion[] {
  return [
    {
      id: "platforms",
      question: "Which platforms does this product ship on?",
      expects: `array of "web" | "mweb" | "ios" | "android"`,
      default: ["web", "mweb"],
      rationale:
        "Web-first is the safest default; add native platforms only when the prompt or user context indicates them.",
      askHuman: false,
    },
    {
      id: "journeys",
      question: "Which user journeys must the design cover, in priority order?",
      expects: "array of short journey names with one-line goals",
      default: null,
      rationale:
        "Derive from the product prompt; a checkout product implies order/track/reorder, a SaaS implies signup/onboard/core-task.",
      askHuman: false,
    },
    {
      id: "audience",
      question: "Who is the primary user and what is their context of use?",
      expects: "one sentence: persona + device + situation",
      default: null,
      rationale: "Usually inferable from the prompt; drives platform and density decisions.",
      askHuman: false,
    },
    {
      id: "offline",
      question: "Must key journeys survive flaky or no connectivity?",
      expects: "boolean",
      default: false,
      rationale:
        "Adds offline states to every network-dependent screen's contract when true. Say true for field/commerce/mobility products.",
      askHuman: false,
    },
    {
      id: "brand",
      question: "Are there existing brand constraints (colors, type, tone)?",
      expects: "object with any of: primaryColor, tone, typeface — or null",
      default: null,
      rationale: "Taste and brand are the human's call — never assumed.",
      askHuman: true,
    },
  ];
}

/** Compile answered questions into a brief + assumption ledger. */
export function compileBrief(
  prompt: string,
  provided: Record<string, unknown>,
): Brief {
  const questions = briefQuestions(prompt);
  const answers: Record<string, unknown> = {};
  const assumptionLedger: Brief["assumptionLedger"] = [];

  for (const q of questions) {
    if (q.id in provided && provided[q.id] !== undefined && provided[q.id] !== null) {
      answers[q.id] = provided[q.id];
    } else {
      answers[q.id] = q.default;
      assumptionLedger.push({
        question: q.question,
        assumed: q.default,
        rationale: q.rationale,
      });
    }
  }

  return { prompt, answers, assumptionLedger };
}
