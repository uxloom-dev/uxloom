/**
 * RFC 0007 R26 — the naming grammar shared by the forward SVG export and the
 * reverse design audit. One grammar, written by one side and read by the
 * other, is what makes the Figma/Penpot round-trip lossless with zero API:
 *
 *     <Journey> ▸ <Screen> / <state>
 *
 * Identity is carried by contract *ids* (not human titles) so that
 * `parseFrameName(frameName(screen, state))` round-trips exactly. Screen and
 * state ids in JourneyGraph are drawn from `[\w.\-]+` (the same charset the
 * audit markers accept), so neither the " ▸ " nor the " / " separator can
 * occur inside an id.
 */

/** Page/section separator: `<Journey> ▸ …`. */
export const PAGE_SEP = " ▸ ";
/** Frame separator: `<Screen> / <state>`. */
export const FRAME_SEP = " / ";

/** Page/section name for a journey (its id — the thing that round-trips). */
export function pageName(journeyId: string): string {
  return journeyId;
}

/** Frame name for one screen × state, e.g. `Payment / error.declined`. */
export function frameName(screenId: string, stateId: string): string {
  return `${screenId}${FRAME_SEP}${stateId}`;
}

/** Fully-qualified name including the journey, e.g. `Checkout ▸ Payment / default`. */
export function qualifiedName(journeyId: string, screenId: string, stateId: string): string {
  return `${pageName(journeyId)}${PAGE_SEP}${frameName(screenId, stateId)}`;
}

/** Layer name for a layout block, e.g. `2 · form: Card details`. */
export function blockLayerName(index: number, type: string, label?: string): string {
  return label ? `${index} · ${type}: ${label}` : `${index} · ${type}`;
}

/** A screen×state identity recovered from a design frame name. */
export interface FrameId {
  screen: string;
  state: string;
  /** Present only when the name carried a `<Journey> ▸ …` prefix. */
  journey?: string;
}

/**
 * Parse a frame name back to its screen×state identity, tolerating the shapes
 * design tools emit: an optional `<Journey> ▸ ` prefix, and either the spaced
 * (` ▸ `, ` / `) or unspaced (`▸`, `/`) separators a designer may hand-type.
 * The state segment is constrained to the id charset so a screen id that
 * contains spaces still parses (the split is anchored on the trailing state).
 * Returns null when the string is not a frame name.
 */
export function parseFrameName(name: string): FrameId | null {
  const m = /^(?:(.+?)\s*▸\s*)?(.+?)\s*\/\s*([\w.\-]+)$/.exec(name.trim());
  if (!m) return null;
  const journey = m[1]?.trim();
  const screen = m[2]?.trim();
  const state = m[3]?.trim();
  if (!screen || !state) return null;
  return journey ? { screen, state, journey } : { screen, state };
}

/** A layout-block identity recovered from a block layer name. */
export interface BlockId {
  index: number;
  type: string;
  label?: string;
}

/** Inverse of {@link blockLayerName}; returns null when the name doesn't match. */
export function parseBlockLayerName(name: string): BlockId | null {
  const m = /^(\d+)\s*·\s*([\w.\-]+)(?::\s*(.+))?$/.exec(name.trim());
  if (!m) return null;
  const label = m[3]?.trim();
  return label ? { index: Number(m[1]), type: m[2], label } : { index: Number(m[1]), type: m[2] };
}
