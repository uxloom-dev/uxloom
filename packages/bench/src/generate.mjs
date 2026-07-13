/**
 * Golden-set generator: builds clean JourneyGraph projects, then injects
 * defects from a catalog with known ground truth. Seeded RNG makes every
 * run reproducible.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FULL_CONTRACT = ["default", "empty", "loading", "error.network"];

/** A project with n screens in a chain journey — zero findings by design. */
export function buildCleanProject(n, name = `clean-${n}`) {
  const screens = [];
  const states = {};
  for (let i = 0; i < n; i++) {
    const id = `Screen${i}`;
    screens.push({
      id,
      intent: `Step ${i} of the flow`,
      requiredStates: [...FULL_CONTRACT],
      designedStates: [...FULL_CONTRACT],
      components: [
        {
          semantic: "Button.Primary",
          interactive: true,
          minTargetPx: 48,
          label: { key: `s${i}.next`, en: "Continue", maxChars: 16 },
          fg: "#FFFFFF",
          bg: "#1D4ED8",
        },
      ],
    });
    const stateId = `step${i}`;
    if (i === n - 1) {
      states[stateId] = { screen: id, final: true };
    } else {
      states[stateId] = {
        screen: id,
        on: i === 0
          ? { NEXT: `step${i + 1}` }
          : { NEXT: `step${i + 1}`, BACK: `step${i - 1}` },
      };
    }
  }
  return {
    name,
    formatVersion: "0.1",
    platforms: ["android"],
    journeys: [{ id: "flow", goal: "Complete the flow", entry: "step0", states }],
    screens,
  };
}

/**
 * Defect catalog. Each injector mutates a clean project in place and
 * returns the ground-truth findings it planted: { code, where }.
 * `where` matches Finding.state / .screen depending on the code.
 */
export const DEFECTS = {
  "unreachable": (p) => {
    p.screens.push({ id: "OrphanScreen", requiredStates: [...FULL_CONTRACT], designedStates: [...FULL_CONTRACT] });
    p.journeys[0].states["orphan"] = { screen: "OrphanScreen", on: { GO: "step0" } };
    return [{ code: "unreachable", state: "orphan" }];
  },
  "dead-end": (p) => {
    p.screens.push({ id: "TrapScreen", requiredStates: [...FULL_CONTRACT], designedStates: [...FULL_CONTRACT] });
    p.journeys[0].states["trap"] = { screen: "TrapScreen" };
    p.journeys[0].states["step0"].on.DETOUR = "trap";
    return [{ code: "dead-end", state: "trap" }];
  },
  "no-final-state": (p) => {
    const states = p.journeys[0].states;
    const last = Object.keys(states).at(-1);
    delete states[last].final;
    // the ex-final state now also has no outgoing events
    return [{ code: "no-final-state", journey: "flow" }, { code: "dead-end", state: last }];
  },
  "target-missing": (p) => {
    p.journeys[0].states["step0"].on.BROKEN = "ghost";
    return [{ code: "target-missing", state: "step0" }];
  },
  "screen-missing": (p) => {
    p.journeys[0].states["step0"].screen = "GhostScreen";
    return [{ code: "screen-missing", state: "step0" }];
  },
  "target-state-missing": (p) => {
    p.journeys[0].states["step0"].on.FAIL = "step1#error.undeclared";
    return [{ code: "target-state-missing", state: "step0" }];
  },
  "state-undesigned": (p) => {
    const s = p.screens[1];
    s.designedStates = s.designedStates.filter((x) => x !== "loading");
    return [{ code: "state-undesigned", screen: s.id, state: "loading" }];
  },
  "contract-drift": (p) => {
    p.screens[1].designedStates.push("celebration");
    return [{ code: "contract-drift", screen: p.screens[1].id, state: "celebration" }];
  },
  "happy-path-contract": (p) => {
    const s = p.screens[2];
    s.requiredStates = ["default"];
    s.designedStates = ["default"];
    return [{ code: "happy-path-contract", screen: s.id }];
  },
  "contradictory-exemption": (p) => {
    p.screens[1].exemptions = [
      { state: "empty", reason: "This exemption contradicts the contract on purpose." },
    ];
    return [{ code: "contradictory-exemption", screen: p.screens[1].id }];
  },
  "contrast-below-aa": (p) => {
    const c = p.screens[0].components[0];
    c.fg = "#8A8F98"; c.bg = "#F4F4F4";
    return [{ code: "contrast-below-aa", screen: p.screens[0].id }];
  },
  "target-too-small": (p) => {
    p.screens[0].components[0].minTargetPx = 30;
    return [{ code: "target-too-small", screen: p.screens[0].id }];
  },
  "label-overflow": (p) => {
    p.screens[0].components[0].label = {
      key: "s0.next", en: "Proceed to the secure checkout area", maxChars: 20,
    };
    return [{ code: "label-overflow", screen: p.screens[0].id }];
  },
};

/** Build the golden set: one isolation case per defect + compound cases. */
export function buildGoldenSet(rng) {
  const cases = [];
  for (const [defect, inject] of Object.entries(DEFECTS)) {
    const project = buildCleanProject(6, `iso-${defect}`);
    const truth = inject(project);
    cases.push({ id: `iso-${defect}`, project, truth });
  }
  // Compound cases: several independent defects in one project.
  const compoundable = [
    "unreachable", "dead-end", "target-missing", "state-undesigned",
    "contract-drift", "contradictory-exemption", "contrast-below-aa",
    "target-too-small", "label-overflow",
  ];
  for (let c = 0; c < 5; c++) {
    const project = buildCleanProject(10, `compound-${c}`);
    const picks = [...compoundable].sort(() => rng() - 0.5).slice(0, 4);
    const truth = picks.flatMap((d) => DEFECTS[d](project));
    cases.push({ id: `compound-${c}`, project, truth });
  }
  // Specificity cases: fully clean, expected zero findings.
  cases.push({ id: "clean-5", project: buildCleanProject(5), truth: [] });
  cases.push({ id: "clean-25", project: buildCleanProject(25), truth: [] });
  return cases;
}
