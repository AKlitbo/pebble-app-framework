/**
 * A temp folder for a spec that writes files, removed once that spec has run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { onTestFinished } from 'vitest';

/**
 * Makes a fresh folder in the system temp folder, and removes it when the spec that asked for it
 * finishes, whether it passed or not.
 *
 * @param prefix The start of the folder's name, which says which spec left it if one ever stays.
 * @return The folder.
 */
export function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
