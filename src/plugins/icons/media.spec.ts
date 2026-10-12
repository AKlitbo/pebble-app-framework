/**
 * Specs for how the icons check reads a committed PNG's size.
 *
 * paf check compares each icon PNG's width and height with icons.json, so an icons.json size edit
 * without a regenerate cannot ship the old icon. It reads them straight from the PNG header with no
 * image library, so a misread header would pass a stale icon or fail a good one, and the guards that
 * keep it from reading past a short or foreign file are what turn one into a plain report.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { tempDir } from '../../ts/testing/temp-dir';
import { iconSizeProblems, pngSize, readPngHeader } from './media';
import type { IconManifest } from './media';

/** The header of a PNG of the given size, built by hand so the size is exact. */
function pngOf(width: number, height: number, chunk: string = 'IHDR'): Buffer {
  const bytes = Buffer.alloc(24);

  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write(chunk, 12, 'latin1');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);

  return bytes;
}

describe('pngSize', () => {
  /** The check compares this against icons.json, so it has to match what a real encoder writes. */
  test('reads the width and height out of a real PNG', async () => {
    const png = await sharp({ create: { width: 24, height: 12, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

    const result = pngSize(png);

    expect(result).toEqual([24, 12]);
  });

  /** A file that is not a PNG is reported as one rather than read as a size made of whatever bytes it holds. */
  test('gives null for bytes that are not a PNG', () => {
    const result = pngSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));

    expect(result).toBeNull();
  });

  /** A truncated or empty PNG would otherwise read past the buffer and throw, which the check prints as a crash. */
  test('gives null for a PNG cut short before its size', () => {
    const result = pngSize(pngOf(24, 24).subarray(0, 20));

    expect(result).toBeNull();
  });

  /** The width and height are only where they are read when the first chunk is IHDR. */
  test('gives null when the first chunk is not IHDR', () => {
    const result = pngSize(pngOf(24, 24, 'tEXt'));

    expect(result).toBeNull();
  });
});

describe('readPngHeader', () => {
  /** An icon with no PNG is reported as missing rather than stopping the check with a file error. */
  test('gives null for a file that is not there', () => {
    const result = readPngHeader(path.join(tempDir('media-spec-'), 'icon.png'));

    expect(result).toBeNull();
  });

  /** Only the header is read, so a check over hundreds of icons does not load every image. */
  test('reads only the first 24 bytes', () => {
    const file = path.join(tempDir('media-spec-'), 'icon.png');

    fs.writeFileSync(file, Buffer.concat([pngOf(24, 24), Buffer.alloc(1000)]));

    const result = readPngHeader(file);

    expect(result).toEqual(pngOf(24, 24));
  });

  /** A folder in the PNG's place stops the check with a line naming it, not a stack trace. */
  test('names a path it cannot read as a PNG', () => {
    const folder = path.join(tempDir('media-spec-'), 'icon.png');

    fs.mkdirSync(folder);

    const result = () => readPngHeader(folder);

    expect(result).toThrow('could not be read');
  });
});

describe('iconSizeProblems', () => {
  const manifest: IconManifest = { 'weather-now-clear': { svg: 'weather/day-sunny', size: [24, 24] } };

  /**
   * The bug this catches. A size edited in icons.json without paf gen leaves the media block as it was,
   * so the old PNG ships and draws at the old size inside a box laid out for the new one.
   */
  test('reports a PNG that is not the size icons.json asks for', () => {
    const result = iconSizeProblems(manifest, () => pngOf(18, 18));

    expect(result).toEqual(['resources/icons/weather-now-clear.png is 18x18 where icons.json asks for 24x24']);
  });

  /** An icon listed with no PNG would leave the build with a resource it cannot find. */
  test('reports an icon with no PNG', () => {
    const result = iconSizeProblems(manifest, () => null);

    expect(result).toEqual(['resources/icons/weather-now-clear.png is missing']);
  });

  /** A file in the PNG's place that is not one is named as such, not given a made-up size. */
  test('reports a file that is not a PNG', () => {
    const result = iconSizeProblems(manifest, () => Buffer.from('not a png at all, just text'));

    expect(result).toEqual(['resources/icons/weather-now-clear.png is not a PNG']);
  });

  /** Every committed icon matches today, so a matching PNG has to pass or every face goes red. */
  test('passes a PNG of the size icons.json asks for', () => {
    const result = iconSizeProblems(manifest, () => pngOf(24, 24));

    expect(result).toEqual([]);
  });
});
