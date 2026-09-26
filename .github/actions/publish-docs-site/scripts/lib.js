/**
 * Works out which docs versions the site holds and where its front page sends a visitor.
 */

const { isVersionTag, compareVersionTags, isPrereleaseTag } = require('../../../shared/lib');

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
  return name === 'main' || isVersionTag(name);
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
  const releases = folders.filter((name) => isVersionFolder(name) && name !== 'main').sort(compareVersionTags).reverse();
  const versions = folders.includes('main') ? ['main', ...releases] : releases;
  const latest = releases.find((name) => !isPrereleaseTag(name)) || null;
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
    '<title>Pebble App Framework</title>',
    `<meta http-equiv="refresh" content="0; url=${folder}/">`,
    '</head>',
    '<body>',
    `<p><a href="${folder}/">Pebble App Framework docs, ${folder}</a></p>`,
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
