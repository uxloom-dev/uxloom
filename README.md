# UXLoom

**Agent-native UI/UX design tooling — in development.**

Your AI generator gave you 6 screens. UXLoom proves you're missing 9 states.

UXLoom is a journey-graph validator and design critic engine that works with any
AI agent (Claude, Codex, or any MCP client). It takes the screens any generator
produces and verifies what generation alone can't: journey completeness,
state coverage (empty / loading / error / offline), WCAG contrast, touch-target
sizes, and text-expansion overflow — before a line of production code exists.

Built on **JourneyGraph**, an open design-as-data format where user journeys are
state machines and screens are nodes.

- Website: [uxloom.dev](https://uxloom.dev)
- Status: pre-release. This package currently reserves the name; the first
  working release (MCP server + critics) is under active development.

## License

MIT
