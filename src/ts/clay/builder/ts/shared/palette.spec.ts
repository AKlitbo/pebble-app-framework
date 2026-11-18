// @vitest-environment jsdom
/**
 * Specs for a builder's palette.
 *
 * The palette filters by group so each list stays a short drag from the face. That makes the
 * filter the thing to pin: which groups a size shows and in what order, a panel whose group the face
 * never listed still showing, opening on a group rather than everything, the status line that says
 * what is left out, and the placed dimming surviving a redraw, since every group switch rebuilds the
 * tiles. The groups and sizes are the face's, so the order they come in is the order the tabs show.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createPalette, groupsForSize } from './palette';
import type { PaletteGroup, PaletteModule } from './palette';

/** A panel at the given sizes and group, with the fields the palette only draws left plain. */
function module(value: number, label: string, sizes: string[], group?: string): PaletteModule {
  return { value: value, label: label, icon: '·', color: '#999', sizes: sizes, group: group };
}

// the face's own order, which is not alphabetical, so a sort would show
const GROUPS: PaletteGroup[] = [
  { name: 'Date', icon: 'D' },
  { name: 'Weather', icon: 'W' },
  { name: 'Health', icon: 'H' },
  { name: 'Status', icon: 'S' },
];

const modules: PaletteModule[] = [
  module(2, 'Battery', ['1x2', '2x2'], 'Status'),
  module(3, 'Weather', ['1x2', '2x2'], 'Weather'),
  module(4, 'Temperature', ['1x2'], 'Weather'),
  module(6, 'Steps', ['1x2', '2x2'], 'Health'),
  module(17, 'Date', ['1x2'], 'Date'),
  module(25, 'Forecast (Hourly)', ['1x4'], 'Weather'),
  module(70, 'Mystery', ['1x2']),
  module(71, 'Orphan', ['1x2'], 'Retired'),
];

const SIZES = [
  { key: '1x2', wide: false },
  { key: '1x4', wide: true },
  { key: '2x2', wide: false },
  { key: '2x4', wide: true },
];

/** Builds a palette over the panels above, with no thumbnails unless a lookup is given. */
function mountPalette(overrides?: { thumbFor?: (value: number, size: string) => string | null; onPick?: (picked: PaletteModule, size: string) => void }) {
  const container = document.createElement('div');

  document.body.appendChild(container);

  const palette = createPalette({
    container: container,
    modules: modules,
    groups: GROUPS,
    sizes: SIZES,
    thumbFor: (overrides && overrides.thumbFor) || function () {
      return null;
    },
    onPick: (overrides && overrides.onPick) || function () {},
  });

  return { container, palette };
}

/** The panel values of the tiles showing, in order. */
function tileValues(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.pf-palette-tile')).map((tile) => Number(tile.dataset.value));
}

/** Clicks the group tab with this name. */
function pickGroup(container: HTMLElement, label: string): void {
  const tabs = Array.from(container.querySelectorAll<HTMLElement>('.pf-palette-group'));

  tabs.find((tab) => tab.querySelector('.pf-palette-group-name').textContent === label).click();
}

/** Clicks the size tab with this key. */
function pickSize(container: HTMLElement, key: string): void {
  container.querySelector<HTMLElement>('.pf-palette-size[data-size="' + key + '"]').click();
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('groupsForSize', () => {
  /** The group tabs follow the face's order, so a shuffle here reorders every tab row on the page. */
  test('lists the groups with panels at the size in the order the face gives them', () => {
    const result = groupsForSize(modules, GROUPS, '1x2').map((section) => section.group.name);

    expect(result).toEqual(['Date', 'Weather', 'Health', 'Status', 'Other']);
  });

  /** A panel nobody gave a group, or one whose group the face dropped, must still be placeable rather than vanish. */
  test('puts a panel with no group or an unknown group under Other at the end', () => {
    const sections = groupsForSize(modules, GROUPS, '1x2');

    const result = sections[sections.length - 1].modules.map((entry) => entry.label);

    expect(result).toEqual(['Mystery', 'Orphan']);
  });

  /** A face with no groups at all still gets every panel, all under Other. */
  test('puts every panel under Other for a face with no groups', () => {
    const result = groupsForSize(modules, [], '2x2');

    expect(result).toEqual([{ group: { name: 'Other', icon: '·' }, modules: [modules[0], modules[1], modules[3]] }]);
  });
});

describe('createPalette', () => {
  /** Opening on every panel makes a long list, and a panel near its end is a long drag from the face. */
  test('opens a size on its first group rather than on every panel', () => {
    const { container } = mountPalette();

    const result = tileValues(container);

    expect(result).toEqual([17]);
  });

  /** Without the status line a short list reads as everything, and the other panels look missing. */
  test('the status line names the group and how many panels it leaves out', () => {
    const { container } = mountPalette();

    pickGroup(container, 'Weather');
    const result = container.querySelector<HTMLElement>('.pf-palette-status span').textContent;

    expect(result).toBe('Weather · 2 of 7');
    expect(tileValues(container)).toEqual([3, 4]);
  });

  /** Show all is the way back to every panel, so it must show them all and drop the status line. */
  test('Show all lists every panel at the size and drops the status line', () => {
    const { container } = mountPalette();

    container.querySelector<HTMLElement>('.pf-palette-all').click();
    const result = tileValues(container);

    expect(result).toEqual([17, 3, 4, 6, 2, 70, 71]);
    expect(container.querySelector('.pf-palette-status')).toBeNull();
  });

  /** Losing the pick on a size switch sends you hunting for the same group again every time. */
  test('keeps the group picked on a size when switching away and back', () => {
    const { container } = mountPalette();

    pickGroup(container, 'Health');
    pickSize(container, '2x2');
    pickSize(container, '1x2');
    const result = tileValues(container);

    expect(result).toEqual([6]);
  });

  /** The pick belongs to its size, so Date picked on one size must not leave another opening on a group it has no panels in. */
  test('opens each size on its own first group whatever another size has picked', () => {
    const { container } = mountPalette();

    pickGroup(container, 'Date');
    pickSize(container, '2x2');
    const result = tileValues(container);

    expect(result).toEqual([3]);
  });

  /** Every group switch rebuilds the tiles, and losing the dimming lets a panel be placed twice. */
  test('a placed panel stays dimmed after switching group away and back', () => {
    const { container, palette } = mountPalette();

    palette.markPlaced([3]);
    pickGroup(container, 'Weather');
    pickGroup(container, 'Date');
    pickGroup(container, 'Weather');
    const result = container.querySelector<HTMLElement>('.pf-palette-tile[data-value="3"]').classList.contains('placed');

    expect(result).toBe(true);
  });

  /** A size with one group has nothing to choose between, so a lone group tab is just clutter. */
  test('a size with a single group shows its panels with no group row', () => {
    const { container } = mountPalette();

    pickSize(container, '1x4');
    const result = container.querySelector<HTMLElement>('.pf-palette-groups').hidden;

    expect(result).toBe(true);
    expect(tileValues(container)).toEqual([25]);
  });

  /** A size no panel comes in would open on an empty list, so it gets no tab at all. */
  test('leaves out the tab for a size no panel comes in', () => {
    const { container } = mountPalette();

    const result = Array.from(container.querySelectorAll<HTMLElement>('.pf-palette-size')).map((tab) => tab.dataset.size);

    expect(result).toEqual(['1x2', '1x4', '2x2']);
  });

  /** A full width shot in a half width tile is too small to read. */
  test('gives a full width size the wide tile', () => {
    const { container } = mountPalette();

    pickSize(container, '1x4');
    const result = container.querySelector<HTMLElement>('.pf-palette-tile').className;

    expect(result).toBe('pf-palette-tile wide');
  });

  /** The shot has to be the one for the size on show, or a tall panel's tile shows its short shot. */
  test('asks for the shot at the size on show', () => {
    const thumbFor = vi.fn((value: number, size: string) => (value === 6 ? 'shot-' + size : null));
    const { container } = mountPalette({ thumbFor });

    pickSize(container, '2x2');
    pickGroup(container, 'Health');
    const result = container.querySelector<HTMLImageElement>('.pf-palette-tile[data-value="6"] img').getAttribute('src');

    expect(result).toBe('shot-2x2');
  });

  /** A panel with no shot yet still needs something to grab, so it shows its icon on its colour. */
  test('shows the icon for a panel with no shot', () => {
    const { container } = mountPalette();

    pickGroup(container, 'Status');
    const result = container.querySelector('.pf-palette-tile[data-value="2"] .pf-palette-icon').textContent;

    expect(result).toBe('·');
  });

  /** A drag that starts with the wrong panel or size drops something the wearer never picked. */
  test('hands the drag the panel and the size on show', () => {
    const onPick = vi.fn();
    const { container } = mountPalette({ onPick });

    pickSize(container, '2x2');
    pickGroup(container, 'Health');
    container.querySelector<HTMLElement>('.pf-palette-tile[data-value="6"]').dispatchEvent(new Event('pointerdown'));
    const result = onPick.mock.calls[0].slice(0, 2);

    expect(result).toEqual([modules[3], '2x2']);
  });
});
