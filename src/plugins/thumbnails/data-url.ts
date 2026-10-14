/**
 * Turning a PNG on disk into the data URL a Clay settings page can carry.
 *
 * A Clay builder runs in a sandboxed config webview that cannot reach local files, so every picture
 * has to travel inline as a data URL. Both generators in this plugin encode the same way through
 * here, so a panel thumbnail and a theme preview come out byte for byte alike.
 */
import fs from 'node:fs';

/** The eight bytes every PNG opens with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Whether a file really is a PNG, by its signature rather than its name.
 *
 * A manifest can point at any path, so a file renamed to .png or a stray JPEG would otherwise land
 * in the page as a broken image. Reading the first eight bytes catches it before it ships.
 *
 * @param file The file to check.
 * @return True when the file opens with the PNG signature.
 */
export function isPng(file: string): boolean {
  let handle: number | null = null;

  try {
    handle = fs.openSync(file, 'r');
    const head = Buffer.alloc(PNG_SIGNATURE.length);
    const read = fs.readSync(handle, head, 0, head.length, 0);

    return read === PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => head[index] === byte);
  } catch {
    return false;
  } finally {
    if (handle !== null) {
      fs.closeSync(handle);
    }
  }
}

/**
 * Reads a PNG and encodes it as a base64 data URL.
 *
 * @param file The PNG to encode.
 * @return The data URL, ready to drop into a Clay page.
 */
export function pngDataUrl(file: string): string {
  return 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
}
