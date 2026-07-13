import type { Finding, Project } from "@uxloom/journeygraph";
import { getScreen, splitTarget } from "@uxloom/journeygraph";

const CRITIC = "journey-completeness";

/**
 * Proves structural properties of every journey:
 *  - entry state exists
 *  - every referenced screen exists
 *  - every transition target resolves (state, and screen state when "#" used)
 *  - every state is reachable from entry
 *  - no dead ends (non-final states with no outgoing events)
 *  - at least one final state per journey
 */
export function journeyCompleteness(project: Project): Finding[] {
  const findings: Finding[] = [];

  for (const journey of project.journeys) {
    const stateIds = Object.keys(journey.states);

    if (!journey.states[journey.entry]) {
      findings.push({
        critic: CRITIC,
        code: "entry-missing",
        severity: "error",
        journey: journey.id,
        message: `Entry state "${journey.entry}" is not defined in journey "${journey.id}".`,
        fix: `Add a state named "${journey.entry}" or change the journey's entry.`,
      });
      continue; // reachability is meaningless without a valid entry
    }

    let hasFinal = false;

    for (const [stateId, state] of Object.entries(journey.states)) {
      if (state.final) hasFinal = true;

      const screen = getScreen(project, state.screen);
      if (!screen) {
        findings.push({
          critic: CRITIC,
          code: "screen-missing",
          severity: "error",
          journey: journey.id,
          state: stateId,
          message: `State "${stateId}" references screen "${state.screen}", which is not registered.`,
          fix: `Register screen "${state.screen}" or point the state at an existing screen.`,
        });
      }

      for (const [event, target] of Object.entries(state.on ?? {})) {
        const { state: targetState, screenState } = splitTarget(target);
        const resolved = journey.states[targetState];
        if (!resolved) {
          findings.push({
            critic: CRITIC,
            code: "target-missing",
            severity: "error",
            journey: journey.id,
            state: stateId,
            message: `Event "${event}" targets "${targetState}", which is not a state of journey "${journey.id}".`,
            fix: `Add state "${targetState}" or retarget the event.`,
          });
          continue;
        }
        if (screenState) {
          const targetScreen = getScreen(project, resolved.screen);
          if (targetScreen && !targetScreen.requiredStates.includes(screenState)) {
            findings.push({
              critic: CRITIC,
              code: "target-state-missing",
              severity: "error",
              journey: journey.id,
              state: stateId,
              screen: resolved.screen,
              message: `Event "${event}" lands on "${resolved.screen}#${screenState}", but "${screenState}" is not in that screen's requiredStates.`,
              fix: `Add "${screenState}" to requiredStates of screen "${resolved.screen}".`,
            });
          }
        }
      }

      if (!state.final && Object.keys(state.on ?? {}).length === 0) {
        findings.push({
          critic: CRITIC,
          code: "dead-end",
          severity: "error",
          journey: journey.id,
          state: stateId,
          message: `State "${stateId}" is a dead end: not final and no outgoing events. Users who reach it are stuck.`,
          fix: `Mark it final, or add events (including a back/cancel path).`,
        });
      }
    }

    // Reachability: BFS from entry over resolved targets.
    const reachable = new Set<string>([journey.entry]);
    const queue = [journey.entry];
    while (queue.length) {
      const current = queue.shift()!;
      const state = journey.states[current];
      if (!state) continue;
      for (const target of Object.values(state.on ?? {})) {
        const { state: next } = splitTarget(target);
        if (journey.states[next] && !reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    for (const stateId of stateIds) {
      if (!reachable.has(stateId)) {
        findings.push({
          critic: CRITIC,
          code: "unreachable",
          severity: "error",
          journey: journey.id,
          state: stateId,
          message: `State "${stateId}" is unreachable from entry "${journey.entry}". It was designed but no user can ever arrive there.`,
          fix: `Add a transition leading to "${stateId}" or remove it.`,
        });
      }
    }

    if (!hasFinal) {
      findings.push({
        critic: CRITIC,
        code: "no-final-state",
        severity: "error",
        journey: journey.id,
        message: `Journey "${journey.id}" has no final state — it can never complete.`,
        fix: `Mark at least one state as final.`,
      });
    }
  }

  return findings;
}
