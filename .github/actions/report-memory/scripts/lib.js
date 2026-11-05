/**
 * Reads the memory figures out of a face's build log, and the static size out of an app binary.
 *
 * The SDK prints a block like this for each platform while it links, and only then, so the log of a clean
 * build is the only place the heap figures exist.
 *
 *   EMERY APP MEMORY USAGE
 *   Total size of resources:        52974 bytes / 256.0KB
 *   Total footprint in RAM:         27635 bytes / 128.0KB
 *   Free RAM available (heap):      103437 bytes
 *
 * The target a block belongs to only shows on the "Waf: Leaving directory `.../targets/<target>/build'" line
 * that closes its sandbox. A target built for two platforms prints two blocks before that one line, so the
 * blocks are held until it arrives.
 */

const { stripColour } = require('../../../shared/lib');

const HEADER = /(\S+) APP MEMORY USAGE/;
const LEAVING = /Leaving directory .*\/targets\/([^/]+)\/build/;
const FIELDS = [
  ['resources', /Total size of resources:\s+(\d+) bytes/],
  ['footprint', /Total footprint in RAM:\s+(\d+) bytes/],
  ['free', /Free RAM available \(heap\):\s+(\d+) bytes/],
];

/** Where PebbleProcessInfo's struct version sits in an app binary, a major byte then a minor one. */
const STRUCT_VERSION_OFFSET = 0x08;

/** Where the low 16 bits of PebbleProcessInfo.virtual_size sit in an app binary. */
const VIRTUAL_SIZE_OFFSET = 0x80;

/** Where the high 8 bits of virtual_size sit, in a header from struct version 0x10.0x01 on. */
const VIRTUAL_SIZE_HI_OFFSET = 0x83;

/**
 * Reads every platform's memory block out of a build log, matched to the target it was built for.
 *
 * @param log The build log.
 * @return The rows, one per target and platform with its resources, footprint and free heap in bytes, and
 *   the incomplete blocks, each named by its target and platform. A block missing any of the three figures
 *   is incomplete rather than a row. One never closed by its sandbox's line is left out.
 */
function readBuildLog(log) {
  const rows = [];
  const incomplete = [];
  let held = [];
  let block = null;

  for (const line of stripColour(log).split(/\r?\n/)) {
    const header = HEADER.exec(line);

    if (header) {
      block = { platform: header[1].toLowerCase() };
      held.push(block);
      continue;
    }

    const leaving = LEAVING.exec(line);

    if (leaving) {
      for (const done of held) {
        if (FIELDS.every(([field]) => done[field] !== undefined)) {
          rows.push({ target: leaving[1], ...done });
        } else {
          incomplete.push({ target: leaving[1], platform: done.platform });
        }
      }

      held = [];
      block = null;
      continue;
    }

    if (block) {
      for (const [field, pattern] of FIELDS) {
        const match = pattern.exec(line);

        if (match) {
          block[field] = Number(match[1]);
        }
      }
    }
  }

  return { rows, incomplete };
}

/**
 * Reads the static size, .text plus .data plus .bss, out of an app binary's header.
 *
 * From struct version 0x10.0x01 the header carries the size in 24 bits, the low 16 at 0x80 and the high 8
 * at 0x83. An older header has padding at 0x83, so only the low 16 bits are read from one, the same as the
 * firmware does.
 *
 * @param binary The whole pebble-app.bin.
 * @return The virtual_size field, or 0 for a file too short to hold one.
 */
function readVirtualSize(binary) {
  if (binary.length < VIRTUAL_SIZE_HI_OFFSET + 1) {
    return 0;
  }

  const major = binary[STRUCT_VERSION_OFFSET];
  const minor = binary[STRUCT_VERSION_OFFSET + 1];
  const wide = major > 0x10 || (major === 0x10 && minor >= 0x01);
  const low = binary.readUInt16LE(VIRTUAL_SIZE_OFFSET);

  return wide ? low + binary[VIRTUAL_SIZE_HI_OFFSET] * 0x10000 : low;
}

module.exports = { readBuildLog, readVirtualSize };
