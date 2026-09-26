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
  return { face: 'face', target: 'face', platform: 'emery', image: 1000, virtualSize: 1000, resources: 0, footprint: 0, free: 0, ...fields };
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

  /** A binary that could not be read showed as 0% and sorted last, so a face that may be near a limit looked the safest. */
  test('puts a row whose binary was missing first', () => {
    const tight = row({ face: 'tight', virtualSize: 62000 });
    const missing = row({ face: 'missing', image: 0, virtualSize: 0 });

    const result = rankRows([tight, missing]);

    expect(result.map((entry) => entry.face)).toEqual(['missing', 'tight']);
    expect(result[0].measured).toBe(false);
  });

  /** A binary too short for its header read a static size of 0, so the face ranked as the safest when nobody knew its size. */
  test('treats a static size of 0 as not measured', () => {
    const tight = row({ face: 'tight', virtualSize: 62000 });
    const short = row({ face: 'short', image: 40, virtualSize: 0 });

    const result = rankRows([tight, short]);

    expect(result.map((entry) => entry.face)).toEqual(['short', 'tight']);
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

    const cells = result.split('\n').find((text) => text.startsWith('| **face**')).split(' | ');
    expect(cells[4]).toMatch(new RegExp(`%\\)${mark}$`));
  });

  /** The mark always sat on Static, so a face near its app image cap sent the reader to the wrong column. */
  test('marks the app image when that is the tighter limit', () => {
    const ranked = rankRows([row({ image: 60000, virtualSize: 40000 })]);

    const result = renderReport(ranked);

    const cells = result.split('\n').find((text) => text.startsWith('| **face**')).split(' | ');
    expect(cells[3]).toContain(':rotating_light:');
    expect(cells[4]).not.toContain(':rotating_light:');
  });

  /** A row read as 0 KB looked like the smallest face rather than one nobody could measure. */
  test('says a row whose binary was missing was not measured', () => {
    const ranked = rankRows([row({ image: 0, virtualSize: 0 })]);

    const result = renderReport(ranked);

    expect(result).toContain('| not measured :grey_question: | not measured :grey_question: |');
  });
});
