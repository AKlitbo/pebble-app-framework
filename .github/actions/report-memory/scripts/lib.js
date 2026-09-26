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

/** Where PebbleProcessInfo.virtual_size sits in an app binary. It is a uint16_t. */
const VIRTUAL_SIZE_OFFSET = 0x80;

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
 * @param binary The whole pebble-app.bin.
 * @return The virtual_size field, or 0 for a file too short to hold one.
 */
function readVirtualSize(binary) {
  if (binary.length < VIRTUAL_SIZE_OFFSET + 2) {
    return 0;
  }
  return binary.readUInt16LE(VIRTUAL_SIZE_OFFSET);
}

module.exports = { readBuildLog, readVirtualSize };
