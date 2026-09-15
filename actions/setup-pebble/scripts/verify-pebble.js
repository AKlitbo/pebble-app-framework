/**
 * Checks the Pebble toolchain answers, and records which pebble-tool and SDK the build is about to use.
 *
 * With the SDK left at latest, a face can start failing to build because a new SDK came out overnight,
 * and nothing in the log says the SDK changed. So the versions always go on the job summary. A pinned SDK
 * that is not the active one fails here, rather than as a confusing build error further on.
 */
const { fail, step, markdownTable, outputTail } = require('../../../shared/lib');
const { readVersion, readSdkList, readNotices } = require('./lib');

module.exports = step(async ({ core, exec }) => {
  const wanted = process.env.SDK_VERSION || 'latest';

  let version;
  try {
    version = await exec.getExecOutput('pebble', ['--version'], { ignoreReturnCode: true, silent: true });
  } catch (error) {
    // a missing command and a dangling symlink both land here, so the real reason goes in the message
    fail(`pebble could not run, so pebble-tool did not install cleanly. ${error.message}`);
  }

  const found = readVersion(version.stdout);
  if (version.exitCode !== 0 || !found) {
    await core.summary.addRaw(`## Pebble Could Not Run\n\n${outputTail([version.stdout, version.stderr].join('\n'))}`, true).write();
    fail(`pebble --version exited ${version.exitCode} without naming its version.`);
  }

  const list = await exec.getExecOutput('pebble', ['sdk', 'list'], { ignoreReturnCode: true, silent: true });
  const sdks = readSdkList(list.stdout);
  const notices = readNotices([version.stderr, list.stderr].join('\n'));

  const summary = [
    '## Pebble Toolchain',
    '',
    markdownTable(
      ['pebble-tool', 'Active SDK', 'Installed SDKs', 'SDK Asked For'],
      [[found.tool, found.activeSdk || 'None', sdks.installed.join(', ') || 'None', wanted]]
    ),
  ];
  if (notices.length > 0) {
    const rows = notices.map((notice) => [notice.what, notice.current, notice.latest]);
    summary.push('', '### Newer Versions Out', '', markdownTable(['What', 'In Use', 'Newest'], rows));
  }
  await core.summary.addRaw(summary.join('\n'), true).write();

  // a pinned build is meant to stay put, so a newer release is worth a note but never a failure
  for (const notice of notices) {
    core.notice(`${notice.what} ${notice.latest} is out. This build uses ${notice.current}.`, { title: `Newer ${notice.what}` });
  }

  if (!found.activeSdk) {
    fail('pebble-tool installed, but no SDK is active, so pebble build has nothing to build with.');
  }
  if (wanted !== 'latest' && found.activeSdk !== wanted) {
    fail(`SDK ${wanted} was asked for, but SDK ${found.activeSdk} is active.`);
  }
  core.info(`pebble-tool ${found.tool} is ready with SDK ${found.activeSdk}.`);
});
