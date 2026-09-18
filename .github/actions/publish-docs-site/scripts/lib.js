/**
 * Works out which docs versions the site holds and where its front page sends a visitor.
 */

// main, or a release tag such as v2.0.0 or v1.2.0-rc.1
const FOLDER = /^(main|v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?)$/;

/**
 * Whether a name is one a version of the docs is published under.
 *
 * The folder is emptied before the new build goes in, so a name that is not a version is refused rather
 * than let a stray ref clear some other part of the branch.
 *
 * @param name The folder name, such as main or v2.0.0.
 * @return True for main or a release tag.
 */
function isVersionFolder(name) {
  return FOLDER.test(String(name));
}

/** A version's parts, with the pre-release label split on its dots, or null for main. */
function parse(name) {
  const match = FOLDER.exec(name);
  if (!match || match[1] === 'main') {
    return null;
  }
  return { release: [Number(match[2]), Number(match[3]), Number(match[4])], pre: match[5] ? match[5].split('.') : [] };
}

/** Orders two pre-release labels the way semver does. A number sorts below a word, and a longer label wins a tie. */
function comparePre(first, second) {
  for (let index = 0; index < Math.min(first.length, second.length); index++) {
    const a = first[index];
    const b = second[index];
    const aNumber = /^\d+$/.test(a);
    const bNumber = /^\d+$/.test(b);
    if (aNumber && bNumber && Number(a) !== Number(b)) {
      return Number(a) - Number(b);
    }
    if (aNumber !== bNumber) {
      return aNumber ? -1 : 1;
    }
    if (!aNumber && a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return first.length - second.length;
}

/** Orders two release folders oldest first. A release candidate sorts below the release it leads up to. */
function compareVersions(first, second) {
  const a = parse(first);
  const b = parse(second);
  for (let index = 0; index < 3; index++) {
    if (a.release[index] !== b.release[index]) {
      return a.release[index] - b.release[index];
    }
  }
  if (a.pre.length === 0 || b.pre.length === 0) {
    return b.pre.length - a.pre.length;
  }
  return comparePre(a.pre, b.pre);
}

/**
 * Lists the versions the site holds, for the version picker.
 *
 * main comes first, then the releases newest first. The latest is the newest release that is not a
 * pre-release, so a release candidate is listed but never becomes the site's front page.
 *
 * @param folders Every folder at the top of the branch, versions or not.
 * @return The versions in picker order, and the latest release or null when there is none yet.
 */
function listVersions(folders) {
  const releases = folders.filter((name) => isVersionFolder(name) && name !== 'main').sort(compareVersions).reverse();
  const versions = folders.includes('main') ? ['main', ...releases] : releases;
  const latest = releases.find((name) => parse(name).pre.length === 0) || null;
  return { latest, versions };
}

/**
 * The branch's front page, which sends a visitor straight on to one version.
 *
 * @param folder The version to send them to.
 * @return The page's html.
 */
function redirectPage(folder) {
  return [
    '<!doctype html>',
    '<html lang="en-CA">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Pebble Watchface Engine</title>',
    `<meta http-equiv="refresh" content="0; url=${folder}/">`,
    '</head>',
    '<body>',
    `<p><a href="${folder}/">Pebble Watchface Engine docs, ${folder}</a></p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * Whether git refused a push because the branch moved on since it was fetched.
 *
 * @param stderr What git push printed.
 * @return True when another push landed first, so a fresh fetch and another try can still succeed.
 */
function pushWasBeaten(stderr) {
  return /\[rejected\]|non-fast-forward|fetch first|cannot lock ref/.test(String(stderr));
}

/**
 * Runs a publish, and runs it again from a fresh fetch whenever another publish pushed first.
 *
 * Main and a tag can publish at the same moment, and each push only knows the branch as it was when it
 * fetched. The loser redoes its own folder on top of the winner's commit, so neither version is lost.
 *
 * @param attempt Makes one try, and returns 'pushed', 'unchanged', or 'beaten' when another push landed first.
 * @param tries How many tries to make before giving up.
 * @return What the last try returned, and how many tries it took.
 */
async function publishWithRetries(attempt, tries) {
  for (let count = 1; count <= tries; count++) {
    const outcome = await attempt(count);
    if (outcome !== 'beaten') {
      return { outcome, tries: count };
    }
  }
  return { outcome: 'beaten', tries };
}

module.exports = { isVersionFolder, listVersions, redirectPage, pushWasBeaten, publishWithRetries };
