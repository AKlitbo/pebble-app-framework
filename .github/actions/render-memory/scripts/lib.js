/**
 * Ranks the memory rows every face build left behind, and lays them out as one table.
 *
 * The SDK stops a face building when its loaded part or its static size passes 65,535 bytes. The image
 * column stands in for the first, since only the relocation table can take an image past 64 KB, and the
 * SDK's own image cap is 128 KB on emery and gabbro. The heap is shown beside them but never stops a build.
 *
 * The app image is load_size plus the relocation table. The SDK's inject_metadata.py holds load_size to 65,535,
 * since that header field is a uint16_t, and the whole image to the platform's MAX_APP_BINARY_SIZE.
 *
 * The static size is virtual_size, which is .text plus .data plus .bss, capped at 65,535 because that header
 * field is a uint16_t. A face carries little relocation table, so this is normally the tighter of the two.
 *
 * The free heap is what is left of 128 KB, and nothing is close to it, so it is shown but never ranked on.
 */
const { markdownTable } = require('../../../shared/lib');

/** What the table measures the app image against, 64 KB, rounded up from the SDK's 65,535 byte cap on load_size. */
const IMAGE_LIMIT = 0x10000;

/** The static size limit, since PebbleProcessInfo.virtual_size is a uint16_t. */
const STATIC_LIMIT = 0xffff;

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
      const imagePct = (row.image * 100) / IMAGE_LIMIT;
      const staticPct = (row.virtualSize * 100) / STATIC_LIMIT;
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
    '**App Image** is `load_size` plus the relocation table. The SDK stops it at 128 KB on emery and gabbro and at 64 KB on the older platforms. It is measured against 64 KB here, since `load_size` alone is held to 65535 bytes and only the relocation table can take the image past that.',
    '',
    '**Static** is `virtual_size`, which is .text plus .data plus .bss. It is capped at 65535 because that header field is a uint16_t, and for a face it is normally the tighter of the two.',
    '',
    '**Free Heap** is what is left of the 128 KB after the app, system allocations and resources. The mark follows whichever limit the row is closest to.',
  ].join('\n');
}

module.exports = { IMAGE_LIMIT, STATIC_LIMIT, WARN_AT, ALARM_AT, rankRows, renderReport };
