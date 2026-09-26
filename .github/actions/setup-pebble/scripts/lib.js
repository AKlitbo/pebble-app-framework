/**
 * Reads what pebble-tool prints about itself and its SDKs.
 *
 * `pebble --version` prints one line naming the tool and the active SDK. `pebble sdk list` prints an
 * Installed SDKs block, with the active one marked, then an Available SDKs block. Either command can also
 * print a coloured notice on stderr when a newer SDK or pebble-tool is out.
 */
const { stripColour } = require('../../../shared/lib');

// Pebble Tool v5.0.39 (active SDK: v4.17)
// with no SDK installed the part in brackets is left off
const VERSION = /Pebble Tool v(\S+)(?: \(active SDK: v?([^)]*)\))?/;
// A new SDK is available: v4.33.1 (current: v4.17)
const NOTICE = /A new (SDK|pebble-tool) is available: v?(\S+) \(current: v?([^)]+)\)/;

/**
 * Reads the tool version and the active SDK out of `pebble --version`.
 *
 * @param output What `pebble --version` printed.
 * @return The pebble-tool version and the active SDK, or null when the line is not there. The active SDK
 *   is an empty string when no SDK is active.
 */
function readVersion(output) {
  const match = VERSION.exec(stripColour(output));
  if (!match) {
    return null;
  }
  return { tool: match[1], activeSdk: match[2] ? match[2].trim() : '' };
}

/**
 * Reads the installed SDKs out of `pebble sdk list`.
 *
 * @param output What `pebble sdk list` printed.
 * @return The installed SDK versions in the order listed, and the one marked active or an empty string.
 */
function readSdkList(output) {
  const installed = [];
  let active = '';
  let inInstalled = false;
  for (const raw of stripColour(output).split(/\r?\n/)) {
    const line = raw.trim();
    if (/^Installed SDKs:/.test(line)) {
      inInstalled = true;
    } else if (/SDKs:$/.test(line) || line === '') {
      inInstalled = false;
    } else if (inInstalled) {
      const [version] = line.split(/\s+/);
      installed.push(version);
      if (/\(active\)/.test(line)) {
        active = version;
      }
    }
  }
  return { installed, active };
}

/**
 * Reads the notices pebble-tool prints when something newer is out.
 *
 * @param output What either command printed on stderr.
 * @return One entry per notice, naming what is out of date, the newest version, and the current one.
 */
function readNotices(output) {
  return stripColour(output)
    .split(/\r?\n/)
    .map((line) => NOTICE.exec(line))
    .filter(Boolean)
    .map((match) => ({ what: match[1], latest: match[2], current: match[3] }));
}

module.exports = { readVersion, readSdkList, readNotices };
