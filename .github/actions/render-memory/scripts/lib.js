/**
 * Ranks the memory rows every face build left behind, and lays them out as one table.
 *
 * Each row is measured against its own platform's limits, the ones the SDK's pebble_sdk_platform.py sets.
 * The app image is load_size plus the relocation table, held to MAX_APP_BINARY_SIZE. The static size is
 * virtual_size, which is .text plus .data plus .bss, and it shares MAX_APP_MEMORY_SIZE with the heap. Emery
 * and gabbro give an app 128 KB of each, and the older platforms 64 KB, apart from aplite's 24 KB of memory.
 *
 * The free heap is what is left of the app's memory, and nothing is close to it, so it is shown but never
 * ranked on.
 */
const { markdownTable } = require('../../../shared/lib');

/** Each platform's app image and static size limits in bytes, from the SDK's pebble_sdk_platform.py. */
const LIMITS = {
  aplite: { image: 0x10000, static: 0x6000 },
  basalt: { image: 0x10000, static: 0x10000 },
  chalk: { image: 0x10000, static: 0x10000 },
  diorite: { image: 0x10000, static: 0x10000 },
  flint: { image: 0x10000, static: 0x10000 },
  emery: { image: 0x20000, static: 0x20000 },
  gabbro: { image: 0x20000, static: 0x20000 },
};

/** The limits for a platform the table does not know, the 64 KB that most platforms give. */
const FALLBACK_LIMITS = { image: 0x10000, static: 0x10000 };

/**
 * The app image and static size limits for a platform.
 *
 * @param platform The platform the row was built for, such as emery.
 * @return Its limits in bytes, or the 64 KB ones for a platform the table does not know.
 */
function limitsFor(platform) {
  return Object.prototype.hasOwnProperty.call(LIMITS, platform) ? LIMITS[platform] : FALLBACK_LIMITS;
}

/** How close to a limit a row gets, as a percentage, before it is flagged. */
const WARN_AT = 80;

/** How close to a limit a row gets, as a percentage, before it is flagged loudly. */
const ALARM_AT = 90;

/**
 * Works out how close each row is to its limits, closest first.
 *
 * A row whose binary was missing reads as 0 bytes, which no real app image is, and one too short to hold its
 * header reads a static size of 0. Either is marked unmeasured and goes first, since reading as 0% would rank
 * a face that may be near a limit as the safest.
 *
 * @param rows The rows every face build reported.
 * @return The same rows with imagePct, staticPct, the worst of the two, which limit that worst one is, and
 *   whether it was measured at all, the unmeasured first and then from the closest to a limit down.
 */
function rankRows(rows) {
  return rows
    .map((row) => {
      const limits = limitsFor(row.platform);
      const imagePct = (row.image * 100) / limits.image;
      const staticPct = (row.virtualSize * 100) / limits.static;
      const tighter = staticPct > imagePct ? 'static size' : 'app image';

      return { ...row, imagePct, staticPct, worst: Math.max(imagePct, staticPct), tighter, measured: row.image > 0 && row.virtualSize > 0 };
    })
    .sort((first, second) => {
      if (first.measured !== second.measured) {
        return first.measured ? 1 : -1;
      }

      return second.worst - first.worst;
    });
}

/** A byte count in KB, to as many decimals as the column wants. */
function kb(bytes, decimals) {
  return `${(bytes / 1024).toFixed(decimals)} KB`;
}

/**
 * Lays the ranked rows out as the summary report, with a note on what caps each column.
 *
 * @param ranked The rows as rankRows returns them.
 * @return The report as markdown.
 */
function renderReport(ranked) {
  const rows = ranked.map((row) => {
    let mark = '';

    if (row.worst >= ALARM_AT) {
      mark = ' :rotating_light:';
    } else if (row.worst >= WARN_AT) {
      mark = ' :warning:';
    }

    // the mark goes on whichever limit the row is closest to
    const imageMark = row.tighter === 'app image' ? mark : '';
    const staticMark = row.tighter === 'static size' ? mark : '';
    const unmeasured = 'not measured :grey_question:';

    return [
      `**${row.face}**`,
      `\`${row.target}\``,
      `\`${row.platform}\``,
      row.measured ? `${kb(row.image, 1)} (${Math.floor(row.imagePct)}%)${imageMark}` : unmeasured,
      row.measured ? `${kb(row.virtualSize, 1)} (${Math.floor(row.staticPct)}%)${staticMark}` : unmeasured,
      kb(row.free, 0),
      kb(row.resources, 0),
    ];
  });

  return [
    '## Watchface Memory',
    '',
    markdownTable(['Face', 'Target', 'Platform', 'App Image', 'Static', 'Free Heap', 'Resources'], rows),
    '',
    '**App Image** is `load_size` plus the relocation table. It is measured against the limit for its platform, which is 128 KB on emery and gabbro and 64 KB on the older platforms.',
    '',
    '**Static** is `virtual_size`, which is .text plus .data plus .bss. It is measured against the app memory the platform gives, 128 KB on emery and gabbro, 64 KB on the older platforms, and 24 KB on aplite. For a face it is normally the tighter of the two.',
    '',
    '**Free Heap** is what is left of the app memory after the app, system allocations and resources. The mark follows whichever limit the row is closest to.',
  ].join('\n');
}

module.exports = { WARN_AT, ALARM_AT, rankRows, renderReport };
