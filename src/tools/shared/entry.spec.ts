/**
 * Specs for how a tool knows it was started as a script.
 *
 * Under a Node with no import.meta.main, such as 24.1, a tool that reads the missing value as false exits
 * 0 having done nothing, so a generator reports success with nothing written. The missing case is the bug
 * itself, and an imported file has to read as not the script, or a tool runs its command line on import.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { isMainScript } from './entry.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isMainScript', () => {
  /** A tool imported by another, or by a spec, must not run its command line on import. */
  test('says no for a file that was imported', () => {
    const result = isMainScript({ main: false } as ImportMeta);

    expect(result).toBe(false);
  });

  /**
   * The bug this exists for. Node 24.1 has no import.meta.main, and a tool that reads it as false exits
   * 0, so the started script has to stop the run with exit code 1 and say which Nodes have it.
   */
  test('stops with exit code 1 under a Node with no import.meta.main', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exited');
    });
    const write = vi.spyOn(fs, 'writeSync').mockImplementation(() => 0);

    const result = () => isMainScript({ url: pathToFileURL(process.argv[1]).href } as ImportMeta);

    expect(result).toThrow('exited');
    expect(exit).toHaveBeenCalledWith(1);
    expect(write).toHaveBeenCalledWith(2, expect.stringMatching(/22\.18 or newer on Node 22, or 24\.2 or newer\. This is /));
  });

  /** A release step imports build-manifests.ts, and a tool that exited on import took the whole step down with it. */
  test('gives false for an imported file under a Node with no import.meta.main', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exited');
    });

    const result = isMainScript({ url: import.meta.url } as ImportMeta);

    expect(result).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });
});
