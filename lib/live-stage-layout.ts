/**
 * live-stage-layout.ts
 *
 * Pure utility for computing TikTok-style multi-participant live stage layouts.
 * No React / JSX dependencies — fully testable in Node.js.
 *
 * Layout rules (by participant count):
 *   1 → solo:   full-width, single tile
 *   2 → split:  two equal columns
 *   3 → grid-3: two columns; host tile spans both columns (top row), two guests below
 *   4 → grid-4: 2×2 equal grid
 *   5 → grid-5: three columns; host tile spans two columns (top-left), one guest top-right,
 *               three guests fill the bottom row
 */

/** Supported layout kinds keyed by participant count. */
export type StageLayoutKind = 'solo' | 'split' | 'grid-3' | 'grid-4' | 'grid-5';

/** Maximum number of guests that can be on stage alongside the host. */
export const STAGE_MAX_GUESTS = 4;

/** Maximum total participants on stage (host + guests). */
export const STAGE_MAX_PARTICIPANTS = STAGE_MAX_GUESTS + 1;

/**
 * Derive the layout kind from the number of participants.
 * The count is clamped to [1, STAGE_MAX_PARTICIPANTS].
 */
export function getStageLayoutKind(participantCount: number): StageLayoutKind {
  const n = Math.max(1, Math.min(STAGE_MAX_PARTICIPANTS, participantCount));
  if (n <= 1) return 'solo';
  if (n === 2) return 'split';
  if (n === 3) return 'grid-3';
  if (n === 4) return 'grid-4';
  return 'grid-5';
}

/**
 * Returns the CSS `grid-template-columns` value for the stage container.
 * Combine with a fixed height on the container for predictable tile sizing.
 */
export function getStageGridTemplateCols(layout: StageLayoutKind): string {
  switch (layout) {
    case 'solo':   return '1fr';
    case 'split':  return '1fr 1fr';
    case 'grid-3': return '1fr 1fr';
    case 'grid-4': return '1fr 1fr';
    case 'grid-5': return '2fr 1fr 1fr';
  }
}

/**
 * Returns the CSS `grid-template-rows` value for the stage container.
 * Use 'auto' for single-row layouts.
 */
export function getStageGridTemplateRows(layout: StageLayoutKind): string {
  switch (layout) {
    case 'solo':   return '1fr';
    case 'split':  return '1fr';
    case 'grid-3': return '1fr 1fr';
    case 'grid-4': return '1fr 1fr';
    case 'grid-5': return '1fr 1fr';
  }
}

/**
 * Returns the CSS `grid-column` value for a tile at `index` in a layout.
 * Returns empty string when no special spanning is needed.
 */
export function getStageTileGridColumn(layout: StageLayoutKind, index: number): string {
  // Host tile (index 0) spans both columns in the 3-participant layout.
  if (layout === 'grid-3' && index === 0) return '1 / span 2';
  return '';
}

/**
 * Returns the CSS `grid-row` value for a tile at `index` in a layout.
 * Returns empty string when no special spanning is needed.
 */
export function getStageTileGridRow(layout: StageLayoutKind, index: number): string {
  // In grid-5, the host tile spans both rows in the first two columns.
  if (layout === 'grid-5' && index === 0) return '1 / span 2';
  return '';
}

/**
 * Convenience: returns an inline-style object for a tile element.
 * Safe to spread directly onto a React element's `style` prop.
 */
export function getStageTileStyle(
  layout: StageLayoutKind,
  index: number,
): Record<string, string> {
  const col = getStageTileGridColumn(layout, index);
  const row = getStageTileGridRow(layout, index);
  const style: Record<string, string> = {};
  if (col) style.gridColumn = col;
  if (row) style.gridRow = row;
  return style;
}
