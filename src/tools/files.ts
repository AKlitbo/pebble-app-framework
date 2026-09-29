/**
 * File writing the build tools share.
 */
import fs from 'node:fs';

/**
 * Writes a file only when its contents would change.
 *
 * A rewrite with the same text still moves the file's mtime, and the waf build copies and
 * recompiles by mtime, so an untouched file stays untouched.
 *
 * @param file The file to write.
 * @param text What it should hold.
 * @return True when the file was written, false when it already held exactly this.
 */
export function writeIfChanged(file: string, text: string): boolean {
  try {
    if (fs.readFileSync(file, 'utf8') === text) {
      return false;
    }
  } catch {
    // missing, so it gets written below
  }
  fs.writeFileSync(file, text);
  return true;
}
