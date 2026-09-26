/**
 * Publishes a face release with every .pbw its build made, each named for what it installs on.
 *
 * A face can build more than one target, such as a watchface and a watchapp from one source, so the targets
 * come from the framework's build-manifests.ts the same way build.sh gets them. Each pbw is copied out under
 * its release name and gh creates the release with all of them in one call. A target with no pbw stops
 * before gh runs, so a release never goes out missing one.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fail, step, firstLine, markdownTable, isPrereleaseTag, readJson } = require('../../../shared/lib');
const { assetName } = require('./lib');

// this script sits in .github/actions/publish-release/scripts/ inside the framework
const ENGINE = path.resolve(__dirname, '..', '..', '..', '..');

module.exports = step(async ({ core, exec }) => {
  const tag = process.env.RELEASE_TAG;
  const face = process.env.FACE;
  const version = process.env.VERSION;
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const repo = process.env.GITHUB_REPOSITORY ? ['--repo', process.env.GITHUB_REPOSITORY] : [];

  const manifests = path.join(ENGINE, 'tools', 'manifest', 'build-manifests.ts');
  const listed = await exec.getExecOutput('node', ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', manifests, '--targets', face], { ignoreReturnCode: true, silent: true });
  const targets = listed.stdout.split(/\s+/).filter(Boolean);
  if (listed.exitCode !== 0 || targets.length === 0) {
    fail(`build-manifests.ts --targets ${face} exited ${listed.exitCode} without naming a target. ${firstLine(listed.stderr)}`);
  }

  const dest = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'release-assets');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  const assets = targets.map((target) => {
    const pbw = path.join(workspace, 'targets', target, 'build', `${target}.pbw`);
    if (!fs.existsSync(pbw)) {
      fail(`targets/${target}/build/${target}.pbw is missing, so the build did not finish that target.`);
    }
    const manifest = readJson(path.join(workspace, 'targets', target, 'package.json'), `targets/${target}/package.json`);
    const platforms = manifest.pebble?.targetPlatforms;
    // the SDK builds every platform when the appinfo lists none, and the asset is named by what it installs on
    if (!Array.isArray(platforms) || platforms.length === 0) {
      fail(`targets/${target}/package.json lists no targetPlatforms. Add targetPlatforms to the face's appinfo so the release can name what it installs on.`);
    }
    const name = assetName(target, platforms, version);
    fs.copyFileSync(pbw, path.join(dest, name));
    return { name, target, platforms };
  });

  // a version with a label, such as 3.0.0-rc.1, is a candidate. marked a pre-release, GitHub never shows it
  // as Latest, so a wearer following the repo's latest release keeps the last real one
  const prerelease = isPrereleaseTag(`v${version}`) ? ['--prerelease'] : [];
  // --verify-tag stops a tag that was never pushed, which gh would otherwise make at the default branch
  // and attach pbws built from another commit to
  const args = ['release', 'create', tag, ...assets.map((asset) => path.join(dest, asset.name)), '--title', process.env.TITLE, '--notes-file', process.env.NOTES_FILE, '--verify-tag', ...prerelease, ...repo];
  const created = await core.group(`gh release create ${tag}`, () => exec.getExecOutput('gh', args, { ignoreReturnCode: true }));
  if (created.exitCode !== 0) {
    fail(`gh release create exited ${created.exitCode}. ${firstLine(created.stderr)}`);
  }

  const url = created.stdout.trim();
  core.setOutput('url', url);

  const summary = [
    `## Released ${process.env.TITLE}`,
    '',
    url,
    '',
    markdownTable(['Asset', 'Target', 'Platforms'], assets.map((asset) => [asset.name, asset.target, asset.platforms.join(', ')])),
  ];
  await core.summary.addRaw(summary.join('\n'), true).write();
  core.info(`Published ${tag} with ${assets.length} asset(s).`);
});
