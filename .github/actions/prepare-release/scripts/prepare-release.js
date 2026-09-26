/**
 * Checks a pushed face release tag against the tree it points at, and writes the release notes.
 *
 * Everything that can stop a release is checked here, before the SDK install and the build, so a typo in a
 * tag costs seconds rather than a build. The framework has to sit exactly on a framework tag, the face the tag
 * names has to exist with that version in its appinfo, its changelog entry has to be dated and written, and
 * the tag cannot already be released.
 *
 * The face is found with tools/faces.ts from the face's own lib/, the same way its build finds it, even
 * when the action comes from a newer tag. That file is TypeScript, and the Node that github-script runs
 * on loads it directly.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fail, step, firstLine, markdownTable, isVersionTag, readJson, faceProject } = require('../../../shared/lib');
const { splitTag, readChangelogEntry, isDated } = require('./lib');

module.exports = step(async ({ core, exec }) => {
  const tag = process.env.RELEASE_TAG || '';
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const repo = process.env.GITHUB_REPOSITORY ? ['--repo', process.env.GITHUB_REPOSITORY] : [];

  const parts = splitTag(tag);
  if (!parts) {
    fail(`Tag '${tag}' is not shaped <face>-v<version>, such as lcars-stardate-v1.11.0.`);
  }

  const { project, framework: lib, rel } = faceProject(workspace, parts.face);
  const libRel = rel(lib);

  // an action loaded at its own tag has a framework beside it that is not the face's. only the
  // framework the face builds with says which release it is on
  const libPackageRel = `${libRel}/package.json`;
  if (!fs.existsSync(path.join(lib, 'package.json'))) {
    fail(`${libRel}/ holds no framework, so there is no telling which release the face builds on. Run paf sync before this step.`);
  }

  // a release ships on a named framework version. lib/ holds a tag's files, and its package.json version
  // says which release it came from
  // that version carries no pre-release label, so a lib/ filled from a candidate tag or a local clone reads
  // as the release. the sync that fills lib/ in the same workflow refuses a local clone, and candidate tags
  // are never released from, so the version is enough to hold a release to
  const libPackage = readJson(path.join(lib, 'package.json'), libPackageRel);
  const engineTag = libPackage.version && isVersionTag(`v${libPackage.version}`) ? `v${libPackage.version}` : null;
  if (!engineTag) {
    fail(`${libPackageRel} names no framework version, so there is no telling which release it holds.`);
  }

  const { findFaces } = await import(pathToFileURL(path.join(lib, 'tools', 'faces.ts')).href);
  const { APPINFO_REL } = await import(pathToFileURL(path.join(lib, 'tools', 'paths.ts')).href);
  const { faceVersion } = await import(pathToFileURL(path.join(lib, 'tools', 'manifest', 'build-manifests.ts')).href);
  let faces;
  try {
    faces = findFaces(project);
  } catch (error) {
    // a face's appinfo that does not parse or has no name stops the lookup
    fail(`The faces in this repo could not be listed. ${error.message}`);
  }
  const face = faces.find((entry) => entry.name === parts.face);
  if (!face) {
    const known = faces.map((entry) => entry.name).join(', ') || 'none';
    fail(`Tag ${tag} names the face '${parts.face}', which this repo does not have. The faces here are: ${known}.`);
  }

  // a tag that disagrees with the manifest is a typo, and a published release cannot be taken back cleanly.
  // the version comes from the same place the build takes it, so a face with none in its appinfo is held
  // to the repo's own version
  const faceRel = rel(face.rel);
  const appinfoRel = path.posix.join(faceRel, APPINFO_REL.split(path.sep).join('/'));
  const appinfo = readJson(path.join(workspace, appinfoRel), appinfoRel);
  const projectPackageRel = rel('package.json');
  const projectPackage = path.join(project, 'package.json');
  const repoPackage = fs.existsSync(projectPackage) ? readJson(projectPackage, projectPackageRel) : {};
  const version = faceVersion(appinfo, repoPackage);
  const versionFrom = appinfo.version ? appinfoRel : projectPackageRel;
  if (!version) {
    fail(`Tag ${tag} says version ${parts.version}, but neither ${appinfoRel} nor ${projectPackageRel} sets a version.`);
  }
  if (version !== parts.version) {
    fail(`Tag ${tag} says version ${parts.version}, but ${versionFrom} says ${version}.`);
  }
  // publish-release marks a version with a label as a pre-release, and reads the label the shared way.
  // a version it cannot read, such as one with build metadata, would go out as Latest
  if (!isVersionTag(`v${version}`)) {
    fail(`Version ${version} is not shaped X.Y.Z or X.Y.Z-label, such as 1.11.0 or 1.11.0-rc.1.`);
  }
  // the release names each pbw by the platforms it installs on, and finding none out after the SDK
  // install and the whole build wastes both
  if (!Array.isArray(appinfo.targetPlatforms) || appinfo.targetPlatforms.length === 0) {
    fail(`${appinfoRel} lists no targetPlatforms. Add them so the release can name what each pbw installs on.`);
  }

  const changelogRel = path.posix.join(faceRel, 'CHANGELOG.md');
  const changelogPath = path.join(workspace, changelogRel);
  if (!fs.existsSync(changelogPath)) {
    fail(`${changelogRel} is missing, so there are no release notes to publish.`);
  }
  const entry = readChangelogEntry(fs.readFileSync(changelogPath, 'utf8'), parts.version);
  if (!entry) {
    fail(`${changelogRel} has no [${parts.version}] entry. Write it before releasing.`);
  }
  if (!isDated(entry.date)) {
    fail(`${changelogRel} has [${parts.version}] dated '${entry.date || 'nothing'}'. Date the heading, such as ${parts.version} - 2026-09-07, before releasing.`);
  }
  if (!entry.body) {
    fail(`The [${parts.version}] entry in ${changelogRel} is empty. Write it before releasing.`);
  }

  // republishing over a shipped release is not something to do quietly, so an existing one stops here
  // any other failure is gh unable to look at all, which would only resurface once the build is done
  const viewed = await exec.getExecOutput('gh', ['release', 'view', tag, ...repo], { ignoreReturnCode: true, silent: true });
  if (viewed.exitCode === 0) {
    fail(`${tag} is already released. Delete that release first to publish it again.`);
  }
  if (!/release not found/i.test(viewed.stderr)) {
    fail(`gh could not check whether ${tag} is already released. ${firstLine(viewed.stderr)}`);
  }

  const notesFile = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'release-notes.md');
  fs.writeFileSync(notesFile, `Released ${entry.date}.\n\n${entry.body}\n`);

  const title = `${appinfo.displayName || face.name} ${parts.version}`;
  core.setOutput('face', face.name);
  core.setOutput('version', parts.version);
  core.setOutput('title', title);
  core.setOutput('notes-file', notesFile);
  core.setOutput('engine-tag', engineTag);

  const summary = [
    `## Releasing ${title}`,
    '',
    markdownTable(['Face', 'Version', 'Framework', 'Changelog'], [[face.name, parts.version, engineTag, `${changelogRel} (${entry.date})`]]),
  ];
  await core.summary.addRaw(summary.join('\n'), true).write();
  core.info(`${tag} is ready to release on framework ${engineTag}.`);
});
