import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStageLayoutKind,
  getStageGridTemplateCols,
  getStageGridTemplateRows,
  getStageTileGridColumn,
  getStageTileGridRow,
  getStageTileStyle,
  STAGE_MAX_GUESTS,
  STAGE_MAX_PARTICIPANTS,
  type StageLayoutKind,
} from '@/lib/live-stage-layout';

// ── Constants ────────────────────────────────────────────────────────────────

test('STAGE_MAX_GUESTS allows up to 4 guests', () => {
  assert.equal(STAGE_MAX_GUESTS, 4);
});

test('STAGE_MAX_PARTICIPANTS is host + STAGE_MAX_GUESTS', () => {
  assert.equal(STAGE_MAX_PARTICIPANTS, STAGE_MAX_GUESTS + 1);
});

// ── getStageLayoutKind ───────────────────────────────────────────────────────

test('getStageLayoutKind: 0 or 1 participant → solo', () => {
  assert.equal(getStageLayoutKind(0), 'solo');
  assert.equal(getStageLayoutKind(1), 'solo');
});

test('getStageLayoutKind: 2 participants → split', () => {
  assert.equal(getStageLayoutKind(2), 'split');
});

test('getStageLayoutKind: 3 participants → grid-3', () => {
  assert.equal(getStageLayoutKind(3), 'grid-3');
});

test('getStageLayoutKind: 4 participants → grid-4', () => {
  assert.equal(getStageLayoutKind(4), 'grid-4');
});

test('getStageLayoutKind: 5 participants → grid-5', () => {
  assert.equal(getStageLayoutKind(5), 'grid-5');
});

test('getStageLayoutKind: counts above max are clamped to grid-5', () => {
  assert.equal(getStageLayoutKind(6), 'grid-5');
  assert.equal(getStageLayoutKind(100), 'grid-5');
});

test('getStageLayoutKind: negative counts are treated as solo', () => {
  assert.equal(getStageLayoutKind(-1), 'solo');
});

// ── Layout coverage: every participant count maps to a unique layout ─────────

test('layout kind changes at each participant count from 1 to 5', () => {
  const layouts = [1, 2, 3, 4, 5].map(getStageLayoutKind);
  const unique = new Set(layouts);
  assert.equal(unique.size, 5, `Expected 5 distinct layouts, got: ${[...unique].join(', ')}`);
});

// ── getStageGridTemplateCols ─────────────────────────────────────────────────

test('getStageGridTemplateCols: solo is single column', () => {
  assert.equal(getStageGridTemplateCols('solo'), '1fr');
});

test('getStageGridTemplateCols: split is two equal columns', () => {
  assert.equal(getStageGridTemplateCols('split'), '1fr 1fr');
});

test('getStageGridTemplateCols: grid-3 is two columns', () => {
  assert.equal(getStageGridTemplateCols('grid-3'), '1fr 1fr');
});

test('getStageGridTemplateCols: grid-4 is two equal columns (2×2)', () => {
  assert.equal(getStageGridTemplateCols('grid-4'), '1fr 1fr');
});

test('getStageGridTemplateCols: grid-5 has three columns with host wider', () => {
  // Host column is double-width (2fr), two guest columns are 1fr each
  assert.equal(getStageGridTemplateCols('grid-5'), '2fr 1fr 1fr');
});

// ── getStageGridTemplateRows ─────────────────────────────────────────────────

test('getStageGridTemplateRows: solo and split are single-row', () => {
  assert.equal(getStageGridTemplateRows('solo'), '1fr');
  assert.equal(getStageGridTemplateRows('split'), '1fr');
});

test('getStageGridTemplateRows: grid-3, grid-4, grid-5 are two rows', () => {
  assert.equal(getStageGridTemplateRows('grid-3'), '1fr 1fr');
  assert.equal(getStageGridTemplateRows('grid-4'), '1fr 1fr');
  assert.equal(getStageGridTemplateRows('grid-5'), '1fr 1fr');
});

// ── getStageTileGridColumn ───────────────────────────────────────────────────

test('getStageTileGridColumn: host in grid-3 spans both columns', () => {
  assert.equal(getStageTileGridColumn('grid-3', 0), '1 / span 2');
});

test('getStageTileGridColumn: guests in grid-3 do not span', () => {
  assert.equal(getStageTileGridColumn('grid-3', 1), '');
  assert.equal(getStageTileGridColumn('grid-3', 2), '');
});

test('getStageTileGridColumn: no tile spans in solo, split, grid-4, grid-5', () => {
  const layouts: StageLayoutKind[] = ['solo', 'split', 'grid-4', 'grid-5'];
  for (const layout of layouts) {
    for (let i = 0; i < 5; i++) {
      assert.equal(getStageTileGridColumn(layout, i), '', `Expected no column span for ${layout}[${i}]`);
    }
  }
});

// ── getStageTileGridRow ──────────────────────────────────────────────────────

test('getStageTileGridRow: host in grid-5 spans both rows', () => {
  assert.equal(getStageTileGridRow('grid-5', 0), '1 / span 2');
});

test('getStageTileGridRow: guests in grid-5 do not span rows', () => {
  assert.equal(getStageTileGridRow('grid-5', 1), '');
  assert.equal(getStageTileGridRow('grid-5', 4), '');
});

test('getStageTileGridRow: no tile spans rows in solo, split, grid-3, grid-4', () => {
  const layouts: StageLayoutKind[] = ['solo', 'split', 'grid-3', 'grid-4'];
  for (const layout of layouts) {
    for (let i = 0; i < 5; i++) {
      assert.equal(getStageTileGridRow(layout, i), '', `Expected no row span for ${layout}[${i}]`);
    }
  }
});

// ── getStageTileStyle ────────────────────────────────────────────────────────

test('getStageTileStyle: returns gridColumn for grid-3 host', () => {
  const style = getStageTileStyle('grid-3', 0);
  assert.equal(style.gridColumn, '1 / span 2');
  assert.equal('gridRow' in style, false);
});

test('getStageTileStyle: returns gridRow for grid-5 host', () => {
  const style = getStageTileStyle('grid-5', 0);
  assert.equal(style.gridRow, '1 / span 2');
  assert.equal('gridColumn' in style, false);
});

test('getStageTileStyle: returns empty object for non-special tiles', () => {
  const style = getStageTileStyle('grid-4', 0);
  assert.deepEqual(style, {});
});

test('getStageTileStyle: returns empty object for solo host tile', () => {
  const style = getStageTileStyle('solo', 0);
  assert.deepEqual(style, {});
});

// ── Capacity enforcement helpers ─────────────────────────────────────────────

test('capacity: accepting a 5th guest would exceed STAGE_MAX_GUESTS', () => {
  const currentGuests = 4;
  assert.ok(currentGuests >= STAGE_MAX_GUESTS, 'Room is full at 4 active guests');
});

test('capacity: 4 accepted guests + 1 host = STAGE_MAX_PARTICIPANTS', () => {
  const host = 1;
  const maxGuests = STAGE_MAX_GUESTS;
  assert.equal(host + maxGuests, STAGE_MAX_PARTICIPANTS);
});

// ── Request-to-join flow helpers (layout-adjacent logic) ─────────────────────

test('layout transitions smoothly as participants join: 1 → 2 → 3 → 4 → 5', () => {
  const expected: StageLayoutKind[] = ['solo', 'split', 'grid-3', 'grid-4', 'grid-5'];
  for (let i = 0; i < expected.length; i++) {
    assert.equal(
      getStageLayoutKind(i + 1),
      expected[i],
      `Participant count ${i + 1} should map to ${expected[i]}`,
    );
  }
});

test('layout transitions smoothly as participants leave: 5 → 4 → 3 → 2 → 1', () => {
  const expected: StageLayoutKind[] = ['grid-5', 'grid-4', 'grid-3', 'split', 'solo'];
  for (let i = 5; i >= 1; i--) {
    const layout = getStageLayoutKind(i);
    const expectedLayout = expected[5 - i];
    assert.equal(layout, expectedLayout, `Participant count ${i} should map to ${expectedLayout}`);
  }
});

// ── Host permissions boundary ─────────────────────────────────────────────────

test('host controls: only the host tile at index 0 is the host', () => {
  // All tiles with index > 0 are guest tiles — they may have a remove button
  // visible only to the host. This is controlled by the parent component
  // checking isHost prop. The layout utility only cares about index.
  assert.equal(getStageTileGridColumn('grid-4', 0), ''); // host has no span in grid-4
  assert.equal(getStageTileGridColumn('grid-4', 1), ''); // guest 1 — no span
  assert.equal(getStageTileGridColumn('grid-4', 3), ''); // guest 3 — no span
});
