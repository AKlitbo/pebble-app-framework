/**
 * Specs for ranking the memory rows and laying out the report.
 *
 * The table exists to answer one question at a glance, which face is closest to failing its build. So what
 * is worth pinning is that the ranking follows whichever limit a row is closest to rather than raw size, and
 * that the marks land at the right thresholds.
 */
import { describe, expect, test } from 'vitest';
import { rankRows, renderReport } from './lib.js';

function row(fields) {
  return { face: 'face', target: 'face', platform: 'emery', image: 0, virtualSize: 0, resources: 0, footprint: 0, free: 0, ...fields };
}

describe('rankRows', () => {
  /** Ranking on the bigger image would put a face with room to spare above one about to overflow its uint16 static size. */
  test('ranks on whichever limit a row is closest to', () => {
    const roomy = row({ face: 'roomy', image: 50000, virtualSize: 30000 });
    const tight = row({ face: 'tight', image: 40000, virtualSize: 62000 });

    const result = rankRows([roomy, tight]);

    expect(result.map((entry) => entry.face)).toEqual(['tight', 'roomy']);
    expect(result[0].tighter).toBe('static size');
  });
});

describe('renderReport', () => {
  /** A mark that fires too late gives no warning before a build starts failing, and one that fires too early gets ignored. */
  test.each([
    [52400, ''],
    [52500, ' :warning:'],
    [59000, ' :rotating_light:'],
  ])('marks a static size of %i bytes with "%s"', (virtualSize, mark) => {
    const ranked = rankRows([row({ virtualSize })]);

    const result = renderReport(ranked);

    const line = result.split('\n').find((text) => text.startsWith('| **face**'));
    expect(line).toMatch(new RegExp(`%\\)${mark.replace(/[:]/g, '\\:')} \\|`));
  });
});
