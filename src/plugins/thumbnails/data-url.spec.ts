/**
 * Specs for the shared picture encoder.
 *
 * A manifest can point at any path, so isPng by signature is what keeps a renamed file or a stray
 * JPEG off the settings page. pngDataUrl is the one encoding both generators share, so its prefix
 * and base64 are what the page relies on.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isPng, pngDataUrl } from './data-url';
import { tempDir } from '../../ts/testing/temp-dir';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Writes bytes to a fresh temp file and gives back its path. */
function writeFile(name: string, bytes: Buffer): string {
  const file = path.join(tempDir('data-url-'), name);

  fs.writeFileSync(file, bytes);
  return file;
}

describe('isPng', () => {
  /** A real PNG is the only thing that should reach the page, so its signature has to pass. */
  test('accepts a file that opens with the PNG signature', () => {
    const file = writeFile('real.png', Buffer.concat([PNG_HEADER, Buffer.from([1, 2, 3])]));

    const result = isPng(file);

    expect(result).toBe(true);
  });

  /** A JPEG renamed to .png would otherwise land in the page as a broken image. */
  test('rejects a file that does not open with the signature', () => {
    const file = writeFile('fake.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));

    const result = isPng(file);

    expect(result).toBe(false);
  });

  /** A file shorter than the signature cannot be a PNG and must not read past its end. */
  test('rejects a file shorter than the signature', () => {
    const file = writeFile('short.png', Buffer.from([0x89, 0x50]));

    const result = isPng(file);

    expect(result).toBe(false);
  });

  /** A missing path is a manifest slip, not a crash, so it reads as not a PNG. */
  test('returns false for a path that is not there', () => {
    const result = isPng(path.join(tempDir('data-url-'), 'gone.png'));

    expect(result).toBe(false);
  });
});

describe('pngDataUrl', () => {
  /** The page can only carry a data URL, so the bytes come back base64 behind the png prefix. */
  test('encodes the file as a base64 png data url', () => {
    const file = writeFile('pic.png', Buffer.from('hello'));

    const result = pngDataUrl(file);

    expect(result).toBe('data:image/png;base64,aGVsbG8=');
  });
});
