/**
 * Dogfood harness: drives the real MCP server (stdio, like any agent client)
 * through three realistic products, twice each:
 *   phase "generated" — screens the way a happy-path generator produces them
 *   phase "repaired"  — after acting on the validation report
 * Artifacts land in examples/<name>/ (project file + both reports).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverPath = join(root, "packages/mcp-server/dist/index.js");

async function runPhase(name, phase, def) {
  const dir = join(root, "examples", name);
  mkdirSync(dir, { recursive: true });
  const projectFile = join(dir, "uxloom.project.json");

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    env: { ...process.env, UXLOOM_PROJECT: projectFile },
  });
  const client = new Client({ name: "dogfood", version: "0.0.0" });
  await client.connect(transport);

  const call = async (tool, args = {}) => {
    const res = await client.callTool({ name: tool, arguments: args });
    return JSON.parse(res.content[0].text);
  };

  await call("project_init", { name, platforms: def.platforms });
  for (const journey of def.journeys) await call("journey_define", { journey });
  for (const screen of def.screens) await call("screen_register", { screen });

  const report = await call("project_validate");
  const coverage = await call("coverage_report");
  writeFileSync(join(dir, `report.${phase}.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(dir, `coverage.${phase}.json`), JSON.stringify(coverage, null, 2));
  await client.close();

  return { report, coverage };
}

/* ---------- Project 1: shopmweb — e-commerce checkout (mweb + android) */

const shopGenerated = {
  platforms: ["mweb", "android"],
  journeys: [
    {
      id: "checkout",
      goal: "Returning shopper completes purchase in under 90 seconds",
      entry: "cart",
      states: {
        cart: { screen: "CartScreen", on: { CHECKOUT: "address" } },
        address: { screen: "AddressScreen", on: { CONTINUE: "payment" } },
        payment: { screen: "PaymentScreen", on: { PAY: "confirm" } },
        confirm: { screen: "ConfirmScreen", final: true },
        promo: { screen: "PromoScreen", on: { APPLY: "cart" } },
      },
    },
  ],
  screens: [
    {
      id: "CartScreen",
      intent: "Review items, reach checkout in one action",
      requiredStates: ["default", "empty", "loading"],
      designedStates: ["default"],
      components: [
        { semantic: "Button.Primary", interactive: true, minTargetPx: 40,
          label: { key: "cart.checkout", en: "Proceed to secure checkout", maxChars: 24 },
          fg: "#8A8F98", bg: "#F4F4F4" },
      ],
    },
    { id: "AddressScreen", requiredStates: ["default"], designedStates: ["default"] },
    { id: "PaymentScreen", intent: "Collect payment with minimum anxiety",
      requiredStates: ["default", "loading", "error.declined", "error.network"],
      designedStates: ["default"] },
    { id: "ConfirmScreen", requiredStates: ["default"], designedStates: ["default"] },
    { id: "PromoScreen", requiredStates: ["default"], designedStates: ["default"] },
  ],
};

const shopRepaired = {
  platforms: ["mweb", "android"],
  journeys: [
    {
      id: "checkout",
      goal: "Returning shopper completes purchase in under 90 seconds",
      entry: "cart",
      states: {
        cart: { screen: "CartScreen",
          on: { CHECKOUT: "address", APPLY_PROMO: "promo", CART_EMPTY: "cart#empty" } },
        promo: { screen: "PromoScreen", on: { APPLY: "cart", CANCEL: "cart" } },
        address: { screen: "AddressScreen",
          on: { CONTINUE: "payment", INVALID_ADDRESS: "address#error.validation", BACK: "cart" } },
        payment: { screen: "PaymentScreen",
          on: { PAY: "confirm", CARD_DECLINED: "payment#error.declined",
                OFFLINE: "payment#error.network", BACK: "address" } },
        confirm: { screen: "ConfirmScreen", final: true },
      },
    },
  ],
  screens: [
    {
      id: "CartScreen",
      intent: "Review items, reach checkout in one action",
      requiredStates: ["default", "empty", "loading", "error.network"],
      designedStates: ["default", "empty", "loading", "error.network"],
      components: [
        { semantic: "Button.Primary", interactive: true, minTargetPx: 48,
          label: { key: "cart.checkout", en: "Checkout", maxChars: 24 },
          fg: "#FFFFFF", bg: "#B3541E" },
      ],
    },
    { id: "AddressScreen", intent: "Capture delivery address with validation",
      requiredStates: ["default", "loading", "error.validation"],
      designedStates: ["default", "loading", "error.validation"],
      exemptions: [{ state: "empty", reason: "Form screen; fields start blank by definition, no empty-data state exists." }] },
    { id: "PaymentScreen", intent: "Collect payment with minimum anxiety",
      requiredStates: ["default", "loading", "error.declined", "error.network"],
      designedStates: ["default", "loading", "error.declined", "error.network"],
      exemptions: [{ state: "empty", reason: "Payment form has no data-list to be empty." }] },
    { id: "ConfirmScreen", intent: "Reassure: order placed, what happens next",
      requiredStates: ["default", "loading"],
      designedStates: ["default", "loading"],
      exemptions: [
        { state: "empty", reason: "Terminal confirmation; reached only with a placed order." },
        { state: "error.any", reason: "Failures surface on PaymentScreen before this state is reachable." },
      ] },
    { id: "PromoScreen", intent: "Apply a promo code without losing the cart",
      requiredStates: ["default", "loading", "error.invalid"],
      designedStates: ["default", "loading", "error.invalid"],
      exemptions: [{ state: "empty", reason: "Single input form; no list content." }] },
  ],
};

/* ---------- Project 2: taskflow — SaaS signup & onboarding (web) */

const saasGenerated = {
  platforms: ["web"],
  journeys: [
    {
      id: "onboarding",
      goal: "New user reaches a working dashboard with one project created",
      entry: "signup",
      states: {
        signup: { screen: "SignupScreen", on: { SUBMIT: "verify" } },
        verify: { screen: "VerifyEmailScreen", on: { VERIFIED: "workspace" } },
        workspace: { screen: "WorkspaceScreen", on: { CREATE: "invite" } },
        invite: { screen: "InviteScreen", on: { SENT: "dashboard" } },
        dashboard: { screen: "DashboardScreen", final: true },
      },
    },
  ],
  screens: [
    { id: "SignupScreen", requiredStates: ["default"], designedStates: ["default"],
      components: [
        { semantic: "Button.Primary", interactive: true, minTargetPx: 44,
          label: { key: "signup.cta", en: "Create your free account", maxChars: 22 },
          fg: "#FFFFFF", bg: "#4F46E5" },
        { semantic: "Button.Secondary", interactive: true, minTargetPx: 44,
          label: { key: "signup.sso", en: "Continue with Google", maxChars: 30 },
          fg: "#9CA3AF", bg: "#F9FAFB" },
      ] },
    { id: "VerifyEmailScreen", requiredStates: ["default"], designedStates: ["default"] },
    { id: "WorkspaceScreen", requiredStates: ["default"], designedStates: ["default"] },
    { id: "InviteScreen", requiredStates: ["default"], designedStates: ["default"] },
    { id: "DashboardScreen", requiredStates: ["default"], designedStates: ["default"] },
  ],
};

const saasRepaired = {
  platforms: ["web"],
  journeys: [
    {
      id: "onboarding",
      goal: "New user reaches a working dashboard with one project created",
      entry: "signup",
      states: {
        signup: { screen: "SignupScreen",
          on: { SUBMIT: "verify", INVALID: "signup#error.validation", EMAIL_TAKEN: "signup#error.taken" } },
        verify: { screen: "VerifyEmailScreen",
          on: { VERIFIED: "workspace", RESEND: "verify", CHANGE_EMAIL: "signup", EXPIRED: "verify#error.expired" } },
        workspace: { screen: "WorkspaceScreen",
          on: { CREATE: "invite", CREATE_FAILED: "workspace#error.network" } },
        invite: { screen: "InviteScreen",
          on: { SENT: "dashboard", SKIP: "dashboard", INVALID_EMAIL: "invite#error.validation" } },
        dashboard: { screen: "DashboardScreen", final: true },
      },
    },
  ],
  screens: [
    { id: "SignupScreen", intent: "Zero-friction account creation",
      requiredStates: ["default", "loading", "error.validation", "error.taken"],
      designedStates: ["default", "loading", "error.validation", "error.taken"],
      exemptions: [{ state: "empty", reason: "Signup form starts blank by definition." }],
      components: [
        { semantic: "Button.Primary", interactive: true, minTargetPx: 44,
          label: { key: "signup.cta", en: "Create account", maxChars: 22 },
          fg: "#FFFFFF", bg: "#4F46E5" },
        { semantic: "Button.Secondary", interactive: true, minTargetPx: 44,
          label: { key: "signup.sso", en: "Continue with Google", maxChars: 30 },
          fg: "#374151", bg: "#F9FAFB" },
      ] },
    { id: "VerifyEmailScreen", intent: "Get the user back from their inbox",
      requiredStates: ["default", "loading", "error.expired"],
      designedStates: ["default", "loading", "error.expired"],
      exemptions: [{ state: "empty", reason: "Static instruction screen; no data content." }] },
    { id: "WorkspaceScreen", intent: "Name the workspace, pick a use-case",
      requiredStates: ["default", "loading", "error.network"],
      designedStates: ["default", "loading", "error.network"],
      exemptions: [{ state: "empty", reason: "Setup form starts blank by definition." }] },
    { id: "InviteScreen", intent: "Invite teammates, or skip without guilt",
      requiredStates: ["default", "loading", "error.validation"],
      designedStates: ["default", "loading", "error.validation"],
      exemptions: [{ state: "empty", reason: "Invite form starts blank; skip path exists." }] },
    { id: "DashboardScreen", intent: "First-run: show the path to value, not a void",
      requiredStates: ["default", "empty", "loading", "error.network"],
      designedStates: ["default", "empty", "loading", "error.network"] },
  ],
};

/* ---------- Project 3: ridenow — ride booking (ios + android, offline-critical) */

const rideGenerated = {
  platforms: ["ios", "android"],
  journeys: [
    {
      id: "book-ride",
      goal: "Rider books and completes a trip",
      entry: "search",
      states: {
        search: { screen: "SearchScreen", on: { DEST_SET: "select" } },
        select: { screen: "SelectRideScreen", on: { RIDE_CHOSEN: "pickup" } },
        pickup: { screen: "PickupScreen", on: { CONFIRM: "tracking" } },
        tracking: { screen: "TrackingScreen", on: { ARRIVED: "complete" } },
        complete: { screen: "CompleteScreen", final: true },
        schedule: { screen: "ScheduleScreen", on: { SCHEDULED: "complete" } },
      },
    },
  ],
  screens: [
    { id: "SearchScreen", requiredStates: ["default"], designedStates: ["default"],
      components: [
        { semantic: "Button.Icon", interactive: true, minTargetPx: 36,
          label: { key: "search.locate", en: "Use my current location", maxChars: 20 } },
      ] },
    { id: "SelectRideScreen", requiredStates: ["default"], designedStates: ["default"] },
    { id: "PickupScreen", requiredStates: ["default"], designedStates: ["default"] },
    { id: "TrackingScreen", requiredStates: ["default"], designedStates: ["default"] },
    { id: "CompleteScreen", requiredStates: ["default"], designedStates: ["default"] },
    { id: "ScheduleScreen", requiredStates: ["default"], designedStates: ["default"] },
  ],
};

const rideRepaired = {
  platforms: ["ios", "android"],
  journeys: [
    {
      id: "book-ride",
      goal: "Rider books and completes a trip",
      entry: "search",
      states: {
        search: { screen: "SearchScreen",
          on: { DEST_SET: "select", SCHEDULE_LATER: "schedule",
                OFFLINE: "search#error.offline", NO_GPS: "search#error.gps" } },
        select: { screen: "SelectRideScreen",
          on: { RIDE_CHOSEN: "pickup", NO_RIDES: "select#empty", BACK: "search" } },
        pickup: { screen: "PickupScreen",
          on: { CONFIRM: "tracking", BACK: "select", OFFLINE: "pickup#error.offline" } },
        tracking: { screen: "TrackingScreen",
          on: { ARRIVED: "complete", DRIVER_CANCELLED: "select",
                OFFLINE: "tracking#error.offline", GPS_LOST: "tracking#error.gps" } },
        complete: { screen: "CompleteScreen", final: true },
        schedule: { screen: "ScheduleScreen",
          on: { SCHEDULED: "complete", CANCEL: "search", OFFLINE: "schedule#error.offline" } },
      },
    },
  ],
  screens: [
    { id: "SearchScreen", intent: "Destination in, minimum taps",
      requiredStates: ["default", "loading", "error.offline", "error.gps"],
      designedStates: ["default", "loading", "error.offline", "error.gps"],
      exemptions: [{ state: "empty", reason: "Map canvas is never empty; recents list has its own zero-item design inside default." }],
      components: [
        { semantic: "Button.Icon", interactive: true, minTargetPx: 48,
          label: { key: "search.locate", en: "Locate me", maxChars: 20 } },
      ] },
    { id: "SelectRideScreen", intent: "Compare options, pick in one tap",
      requiredStates: ["default", "empty", "loading", "error.offline"],
      designedStates: ["default", "empty", "loading", "error.offline"] },
    { id: "PickupScreen", intent: "Confirm pickup point with confidence",
      requiredStates: ["default", "loading", "error.offline"],
      designedStates: ["default", "loading", "error.offline"],
      exemptions: [{ state: "empty", reason: "Pin-on-map confirmation; no list content." }] },
    { id: "TrackingScreen", intent: "Reduce anxiety while waiting",
      requiredStates: ["default", "loading", "error.offline", "error.gps"],
      designedStates: ["default", "loading", "error.offline", "error.gps"],
      exemptions: [{ state: "empty", reason: "Only reachable with an active trip." }] },
    { id: "CompleteScreen", intent: "Close the loop: fare, rating, receipt",
      requiredStates: ["default", "loading"],
      designedStates: ["default", "loading"],
      exemptions: [
        { state: "empty", reason: "Terminal screen; reached only with a completed trip." },
        { state: "error.any", reason: "Payment failures are handled inside the trip flow before arrival." },
      ] },
    { id: "ScheduleScreen", intent: "Book for later without re-entering details",
      requiredStates: ["default", "loading", "error.offline"],
      designedStates: ["default", "loading", "error.offline"],
      exemptions: [{ state: "empty", reason: "Date-picker form; starts at sensible defaults." }] },
  ],
};

/* ---------- run all */

const projects = [
  ["shopmweb", shopGenerated, shopRepaired],
  ["taskflow", saasGenerated, saasRepaired],
  ["ridenow", rideGenerated, rideRepaired],
];

for (const [name, generated, repaired] of projects) {
  const g = await runPhase(name, "generated", generated);
  const r = await runPhase(name, "repaired", repaired);
  console.log(
    `${name.padEnd(10)} generated: ${String(g.report.summary.errors).padStart(2)} errors ${String(g.report.summary.warnings).padStart(2)} warnings | ` +
    `repaired: ${r.report.summary.errors} errors ${r.report.summary.warnings} warnings | ${g.coverage.headline}`,
  );
  const leftovers = r.report.findings.filter((f) => f.severity === "error");
  if (leftovers.length) {
    console.log(`  UNRESOLVED ERRORS in repaired ${name}:`);
    for (const f of leftovers) console.log(`   - [${f.critic}] ${f.message}`);
  }
  const noise = r.report.findings.filter((f) => f.severity === "warning");
  if (noise.length) {
    console.log(`  residual warnings in repaired ${name}:`);
    for (const f of noise) console.log(`   - [${f.critic}] ${f.message}`);
  }
}
console.log("DOGFOOD RUN COMPLETE");
