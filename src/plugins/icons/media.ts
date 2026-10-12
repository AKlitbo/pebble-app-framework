/**
 * The icon side of a face's appinfo media array: which Pebble resource each icon becomes, how
 * icons.json folds into the array, and how the array is written back without disturbing the rest
 * of the file.
 *
 * Kept apart from the rasterizer so the icon check can compare media blocks without loading sharp.
 */
import fs from 'node:fs';
import path from 'node:path';
import { faceDir } from '../../tools/shared/faces.ts';
import { ToolError } from '../../tools/shared/tool-error.ts';
import type { MediaEntry } from '../../tools/manifest/build-manifests.ts';

/** One icon's row in resources/icons.json: which vendored svg and its final pixel size. */
export type IconSpec = { svg: string; size: [number, number]; trim?: boolean };

/** resources/icons.json, keyed by icon name (the file basename). */
export type IconManifest = Record<string, IconSpec>;

/**
 * Where a face declares the icons it wants.
 *
 * @param face The face.
 * @return The face's resources/icons.json.
 */
export function iconsManifestPath(face: string): string {
  return path.join(faceDir(face), 'resources', 'icons.json');
}

/**
 * The media array out of a face's config. It sits under pebble.resources in a generated
 * package.json and under top-level resources in the pebble.appinfo.json the manifests come from,
 * so either is read.
 *
 * @param raw The config file's text.
 * @return The media array, or whatever sits there when it is not one.
 */
export function mediaOf(raw: string): unknown {
  const parsed = JSON.parse(raw);
  const resources = (parsed.pebble && parsed.pebble.resources) || parsed.resources;

  return resources && resources.media;
}

/**
 * Turns an icon's basename into its Pebble resource id, for example "wi-clear" into
 * "ICON_WI_CLEAR".
 *
 * @param basename The icon's file basename.
 * @return Its Pebble resource id.
 */
export function resourceName(basename: string): string {
  return 'ICON_' + basename.toUpperCase().replace(/-/g, '_');
}

// a media entry is a face icon when it is a bitmap under an icons/ folder. media file paths
// are relative to the face's resources/ folder, so this matches a face's own "icons/foo.png"
// and an icons/ folder anywhere further up the path
function isIconEntry(entry: MediaEntry): boolean {
  return entry.type === 'bitmap' && typeof entry.file === 'string' && /(^|\/)icons\//.test(entry.file);
}

/**
 * Merges a manifest's icons into an existing media array. Non-icon entries (fonts,
 * background images) keep their place and order. The icon block is replaced in
 * full and lands where the first old icon sat (or just before the fonts on a face
 * that had none). An icon the old block already had keeps its own extra fields, such
 * as a `memoryFormat` or `targetPlatforms`, while its path points at the face's own
 * render. Pure so it can be tested without touching disk.
 *
 * @param media The face's current media array.
 * @param manifest The face's icons.json manifest.
 * @return The media array with its icon block replaced from the manifest.
 */
export function buildMedia(media: MediaEntry[], manifest: IconManifest): MediaEntry[] {
  const previous = new Map(media.filter(isIconEntry).map((entry) => [entry.name, entry]));
  const icons: MediaEntry[] = Object.keys(manifest).map((name) => ({
    ...previous.get(resourceName(name)),
    type: 'bitmap',
    name: resourceName(name),
    file: `icons/${name}.png`,
  }));

  let insertAt = media.findIndex(isIconEntry);

  if (insertAt === -1) {
    const firstFont = media.findIndex((entry) => entry.type === 'font');

    insertAt = firstFont === -1 ? media.length : firstFont;
  }

  const keptBefore = media.slice(0, insertAt).filter((entry) => !isIconEntry(entry));
  const keptAfter = media.slice(insertAt).filter((entry) => !isIconEntry(entry));

  return [...keptBefore, ...icons, ...keptAfter];
}

// serialize one media entry. bitmaps ride on a single line for a scannable list
// fonts keep their multi-line block so their extra fields (like characterRegex) stay put.
// every field a bitmap has goes on its line, so a background's memoryFormat or
// targetPlatforms survives. type, name, and file lead so a plain entry reads the same as always
function formatEntry(entry: MediaEntry, indent: string): string {
  if (entry.type === 'bitmap') {
    const lead = ['type', 'name', 'file'].filter((key) => key in entry);
    const keys = [...lead, ...Object.keys(entry).filter((key) => lead.indexOf(key) === -1)];
    const fields = keys.map((key) => `${JSON.stringify(key)}: ${JSON.stringify((entry as Record<string, unknown>)[key])}`);

    return `${indent}{ ${fields.join(', ')} }`;
  }

  return JSON.stringify(entry, null, 2)
    .split('\n')
    .map((line) => indent + line)
    .join('\n');
}

/**
 * Splices the rebuilt media array back into the raw appinfo text and leaves every
 * other byte of the file untouched. Bracket matching steps over array-valued fields
 * inside an entry (like a font's targetPlatforms) and quoted brackets in strings.
 *
 * @param raw The face's pebble.appinfo.json text, unparsed.
 * @param newMedia The media array to splice in, in place of the existing one.
 * @return The same text with its media array replaced.
 */
export function replaceMediaArray(raw: string, newMedia: MediaEntry[]): string {
  // the key followed by its array, since "media" can also sit earlier in the file as a string value
  const key = /"media"\s*:\s*\[/.exec(raw);

  if (!key) {
    throw new Error('no "media" array in pebble.appinfo.json');
  }

  const keyAt = key.index;
  const open = keyAt + key[0].length - 1;
  let depth = 0, close = -1, inString = false, escaped = false;

  for (let i = open; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '[') {
      depth++;
    } else if (char === ']') {
      depth--;

      if (depth === 0) {
        close = i;
        break;
      }
    }
  }

  if (close === -1) {
    throw new Error('unterminated "media" array in pebble.appinfo.json');
  }

  const lineStart = raw.lastIndexOf('\n', keyAt) + 1;
  // the pattern matches an empty run too so the fallback only keeps the types honest
  const mediaIndent = (raw.slice(lineStart, keyAt).match(/^\s*/) || [''])[0];
  const entryIndent = mediaIndent + '  ';

  const body = newMedia.map((entry) => formatEntry(entry, entryIndent)).join(',\n');

  return raw.slice(0, open + 1) + '\n' + body + '\n' + mediaIndent + raw.slice(close);
}

/**
 * Where an icon's PNG sits in its face, the path the generator writes and the check reads. The
 * media block names the same file from inside resources/, as icons/<name>.png.
 *
 * @param name The icon's name in icons.json.
 * @return The PNG's path from the face's folder, with forward slashes.
 */
export function iconPngPath(name: string): string {
  return `resources/icons/${name}.png`;
}

/**
 * The first 24 bytes of a file, which hold a PNG's signature, width, and height.
 *
 * A file that is there but cannot be read, such as a folder in the PNG's place, stops with one line
 * naming it rather than a stack that reads as a bug in the check.
 *
 * @param file The file to read.
 * @return Up to the first 24 bytes, or null when there is no such file.
 */
export function readPngHeader(file: string): Buffer | null {
  let fd: number | null = null;

  try {
    fd = fs.openSync(file, 'r');

    const header = Buffer.alloc(24);
    const read = fs.readSync(fd, header, 0, header.length, 0);

    return header.subarray(0, read);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === 'ENOENT') {
      return null;
    }

    throw new ToolError(`${file} could not be read (${code ?? (error as Error).message})`);
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

/** The eight bytes every PNG file starts with. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The width and height a PNG's header records, read straight from its bytes so the icon check needs
 * no image library.
 *
 * A PNG opens with its eight byte signature and then the IHDR chunk, whose first two fields are the
 * width and height as big-endian 32-bit numbers, at bytes 16 and 20.
 *
 * @param bytes The file's contents, or at least its first 24 bytes.
 * @return The width and height, or null when the bytes are not a PNG.
 */
export function pngSize(bytes: Buffer): [number, number] | null {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    return null;
  }

  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

/**
 * Every icon whose committed PNG is missing, is not a PNG, or is not the size icons.json asks for.
 *
 * The generator draws each icon at exactly its size, so a PNG of another size was drawn before
 * icons.json changed. Left alone it ships the old icon, drawn at the old size inside a box laid out
 * for the new one. A changed svg or trim keeps the size, so this cannot see those.
 *
 * @param manifest The face's icons.json.
 * @param readPng Reads an icon's committed PNG by name, or gives null when there is none.
 * @return One line per icon that is out of step, empty when every PNG matches.
 */
export function iconSizeProblems(manifest: IconManifest, readPng: (name: string) => Buffer | null): string[] {
  const problems: string[] = [];

  for (const [name, spec] of Object.entries(manifest)) {
    const file = iconPngPath(name);
    const bytes = readPng(name);

    if (bytes === null) {
      problems.push(`${file} is missing`);
      continue;
    }

    const size = pngSize(bytes);

    if (size === null) {
      problems.push(`${file} is not a PNG`);
    } else if (size[0] !== spec.size[0] || size[1] !== spec.size[1]) {
      problems.push(`${file} is ${size[0]}x${size[1]} where icons.json asks for ${spec.size[0]}x${spec.size[1]}`);
    }
  }

  return problems;
}
