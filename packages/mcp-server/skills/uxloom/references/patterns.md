# Market pattern library — category conventions with grounding

Curated qualitative conventions from published usability research and
platform guidelines. Use as the offline grounding for Phase 1 research;
supplement with live web research when available. These are documented
conventions, not statistics — cite the research body, never invent numbers.

## Contents
- E-commerce & checkout
- SaaS dashboards & admin tools
- Onboarding & signup
- Content & media
- Messaging & social
- Booking & scheduling
- Cross-category invariants

## E-commerce & checkout
*(grounding: Baymard Institute checkout usability research; platform HIGs)*

- **Guest checkout is expected**; forced account creation is among the
  most-documented abandonment causes. Offer account creation *after*
  purchase.
- **Linear, single-column checkout** with visible progress; distraction is
  the enemy of completion. Persistent cart summaries belong on desktop
  only, subordinated to the form.
- **Trust signals near payment**: recognizable payment marks, clear error
  recovery on declined cards (state `error.declined` with a path forward,
  never a dead end).
- Cart is a *screen with an empty state that sells* (first-run guidance),
  not a blank void. Promo codes hidden behind a link — an open field
  invites coupon-hunting abandonment.
- Mobile: sticky primary CTA, 44px+ targets, numeric keyboards for card
  fields (document in `data`/`validation`).

## SaaS dashboards & admin tools
*(grounding: Nielsen Norman Group on dashboards and complex apps)*

- **Overview-first IA**: land on "what needs attention", not settings.
  Left-rail navigation for ≥5 sections; top tabs only for ≤4.
- **Dense tables are the workhorse**: real columns, sort/filter intent
  declared, URL-driven filter state (shareable views).
- **The "one-click answers why" detail page**: every list row opens a
  detail with a full event history/timeline. Status pills use semantic
  colors distinct from the brand accent.
- Empty states are onboarding: first-run screens show the path to value,
  never a blank table.
- Destructive actions: typed confirmation for irreversible operations;
  plain confirm for recoverable ones.

## Onboarding & signup
*(grounding: NN/g on forms and onboarding; growth-team conventions)*

- **Minimize fields before value**: ask only what the first session needs;
  defer profile completeness. Every extra field is measurable friction.
- SSO first-position when offered; email fallback always present.
- **Verification must not dead-end**: resend, change-email, and expired
  states are part of the contract (`error.expired`, RESEND/CHANGE_EMAIL
  events).
- Skippable steps must be honestly skippable ("Skip" without guilt copy).
- First-run destination shows the path to the product's core value in one
  action — not an empty dashboard.

## Content & media

- Card grids for browsing, list rows for scanning; infinite scroll for
  leisure consumption, pagination for reference/return tasks.
- Reader modes: typography-first, chrome recedes; progress indication for
  long content.
- Search is a first-class journey (with `empty` no-results state that
  suggests, not shrugs).

## Messaging & social

- Newest-at-bottom for conversation (chat mental model), newest-at-top
  for feeds. Compose is persistent, never behind navigation.
- Optimistic send with honest failure recovery (`error.send` state with
  retry — never silently drop a message).
- Presence/read state only where the product's trust model supports it.

## Booking & scheduling

- **Availability before commitment**: show open slots before asking for
  details. Calendar pickers on desktop; wheel/list pickers on native
  mobile (platform norms).
- Time zones explicit whenever parties can differ; confirmation screens
  restate everything (what/when/where/cancellation terms).
- Offline/degraded matters: booking flows are used in transit —
  `error.offline` states with preserved input are category table stakes.

## Cross-category invariants (always apply)

- Platform navigation norms win by default: bottom tabs (iOS) / bottom
  nav or drawer (Android) / top or left nav (web) — divergence needs an
  argument.
- Every network-touching screen contracts loading and error states; every
  list contracts empty. (UXLoom enforces this; the convention is *why*.)
- Users read F-pattern on dense screens: primary action top-left-weighted
  on LTR web, thumb-reachable bottom on mobile.
- Copy is design: buttons say what they do; errors say what went wrong
  and how to fix it. (See HIG/Material writing guidance.)
- When two category conventions conflict, the user's primary goal on that
  screen decides — record the conflict in the rationale's alternatives.
