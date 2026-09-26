#!/usr/bin/env node
/**
 * Builds the docs site's own pages into docs/site/dist and puts the shared bar on every page.
 *
 * Doxygen, TypeDoc, and both coverage runs have already written their parts into dist by the time this
 * runs. This adds the home page, the changelog, the notices, and the licence pages around them, plus the
 * stylesheets, theme script, and logo they share. The README is not rendered. The home page links it on
 * GitHub instead. Then it goes back through every page those tools wrote
 * and adds the shared bar, so each one has a way home and the same theme toggle. It never clears dist.
 *
 * A coverage summary or a tool's folder that is missing is skipped, so the site still builds on a machine
 * that skipped part of the build.
 *
 * Run via `npm --prefix docs run site`, or as the last part of the build-docs-site action.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  PAGES,
  REPO_URL,
  addSiteBar,
  escapeHtml,
  fillTemplate,
  pixelStrip,
  readGcovrSummary,
  readVitestSummary,
  renderLicenceText,
  renderMarkdown,
  renderSiteBar,
  rootFor,
  splitTitle,
  type GeneratedPage,
  type SiteSection,
} from './render.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SITE = path.join(ROOT, 'docs', 'site');
const DIST = path.join(SITE, 'dist');

// the two full licence texts, which the licence page lists
const LICENCES = [PAGES.agpl, PAGES.polyform];

// files the pages share, copied into dist as they are, by their path from the repo root
const SHARED_FILES = [
  'docs/site/site.css',
  'docs/site/site-bar.css',
  'docs/site/coverage.css',
  'docs/site/theme.js',
  'docs/site/versions.js',
  'docs/doxygen/logo.svg',
  'docs/doxygen/favicon.svg',
];

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&amp;family=IBM+Plex+Sans:wght@400;500;600&amp;display=swap">';

// the folders other tools write, with the section each belongs to and the tags each page needs in its head
// the Doxygen header already loads the tab icon, theme.js, versions.js, and the Plex fonts, and TypeDoc's
// stylesheet brings the fonts. the coverage reports bring none of it, and they get the site's look from coverage.css
const GENERATED: { folder: string; kind: GeneratedPage; section: SiteSection; head: (root: string) => string }[] = [
  {
    folder: 'c',
    kind: 'doxygen',
    section: 'c',
    head: (root) => `<link rel="stylesheet" href="${root}site-bar.css">\n`,
  },
  {
    folder: 'ts',
    kind: 'typedoc',
    section: 'ts',
    head: sharedHead,
  },
  {
    folder: 'coverage/c',
    kind: 'report',
    section: 'coverage-c',
    head: coverageHead,
  },
  {
    folder: 'coverage/ts',
    kind: 'report',
    section: 'coverage-ts',
    head: coverageHead,
  },
];

// Doxygen writes a bare list of links for web crawlers, with no header and nobody reading it, so it gets no bar
const SKIPPED = new Set(['c/doxygen_crawl.html']);

/** The tab icon, the two scripts, and the bar's stylesheet, which every page Doxygen did not write takes. */
function sharedHead(root: string): string {
  return `<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">\n<script src="${root}theme.js"></script>\n<script src="${root}versions.js"></script>\n<link rel="stylesheet" href="${root}site-bar.css">\n`;
}

/** The shared tags plus the fonts and the coverage stylesheet, which the coverage reports bring none of. */
function coverageHead(root: string): string {
  return `${sharedHead(root)}${FONTS}\n<link rel="stylesheet" href="${root}coverage.css">\n`;
}

/**
 * Reads a repo file with Windows line endings folded, so a checkout on either system renders the same. A
 * byte order mark a Windows editor left at the start is dropped too, since marked would read it as part of
 * the first line and miss the title heading.
 */
function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function template(name: string): string {
  return read(path.join('docs', 'site', 'templates', name));
}

/** A summary a coverage run did not write, or wrote badly, reads as null. */
function readSummary(relative: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIST, relative), 'utf8'));
  } catch {
    return null;
  }
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** Runs git with its stderr kept out of the build's output, for a call that is expected to fail sometimes. */
function gitQuiet(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * Names a local build the way CI names it. A checkout on a branch is the branch. A detached one, such as an
 * old release checked out to look at its docs, reads HEAD from git, so it is named by the tag it sits on or
 * else its short commit.
 */
function localRef(): string {
  const name = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (name !== 'HEAD') {
    return name;
  }
  try {
    // a commit with no tag on it fails here, and git's own complaint about that is not worth printing
    return gitQuiet('describe', '--tags', '--exact-match', 'HEAD');
  } catch {
    return git('rev-parse', '--short', 'HEAD');
  }
}

function write(relative: string, html: string): void {
  const file = path.join(DIST, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

/** Every html page under a folder of dist, by its path from dist with forward slashes. */
function pagesUnder(folder: string): string[] {
  const start = path.join(DIST, folder);
  if (!fs.existsSync(start)) {
    return [];
  }
  return fs.readdirSync(start, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.html'))
    .map((file) => `${folder}/${file.split(path.sep).join('/')}`)
    .filter((relative) => !SKIPPED.has(relative));
}

const version = (JSON.parse(read('package.json')) as { version: string }).version;
// a PR build checks out the merge commit GitHub makes, which is on no branch, so the PR's own head goes first
const commit = process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || git('rev-parse', 'HEAD');
// a PR build's ref name is its merge ref, so the branch it came from is tried first
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || localRef();
const built = new Date().toISOString().slice(0, 10);

const themeToggle = template('theme-toggle.html');
const siteBarTemplate = template('site-bar.html');

// in CI the branch is main or the tag being built, which is also the folder the site is published into
function siteBar(root: string, section: SiteSection): string {
  return renderSiteBar(siteBarTemplate, { root, section, themeToggle, version: branch });
}

function footer(root: string): string {
  return fillTemplate(template('footer.html'), {
    changelog: root + PAGES.changelog.folder,
    notices: root + PAGES.notices.folder,
    agpl: root + PAGES.agpl.folder,
    polyform: root + PAGES.polyform.folder,
    repoUrl: REPO_URL,
    branch: escapeHtml(branch),
  });
}

function page(relative: string, title: string, body: string): void {
  const root = rootFor(relative);
  write(relative, fillTemplate(template('page.html'), { root, title: escapeHtml(title), body, siteBar: siteBar(root, null), footer: footer(root) }));
}

// the home page, the cards into each part of the site with the README a link away on GitHub
// the README link is pinned to the build's commit like every other repo link, so an older version's site
// shows the setup steps that match its docs
write('index.html', fillTemplate(template('landing.html'), {
  siteBar: siteBar('', null),
  readmeUrl: `${REPO_URL}/blob/${commit}/README.md`,
  version: escapeHtml(version),
  branch: escapeHtml(branch),
  commitShort: commit.slice(0, 7),
  built,
  coverageC: pixelStrip(readGcovrSummary(readSummary('coverage/c/summary.json'))),
  coverageTs: pixelStrip(readVitestSummary(readSummary('coverage/ts/coverage-summary.json'))),
  footer: footer(''),
}));

for (const markdownPage of [PAGES.changelog, PAGES.notices]) {
  const markdown = splitTitle(read(markdownPage.file));
  const relative = `${markdownPage.folder}index.html`;
  page(relative, markdown.title || markdownPage.title, renderMarkdown(markdown.body, { root: rootFor(relative), commit }));
}

// each full text's link is its folder worked out from the licence page's own folder, so either can move
const licenceLinks = LICENCES.map((licence) => `<li><a href="${path.posix.relative(PAGES.licence.folder, licence.folder)}/">${escapeHtml(licence.title)}</a></li>`).join('\n');
page(`${PAGES.licence.folder}index.html`, PAGES.licence.title, `${renderLicenceText(read(PAGES.licence.file))}\n<h2 id="full-texts">Full Texts</h2>\n<ul>\n${licenceLinks}\n</ul>`);

for (const licence of LICENCES) {
  page(`${licence.folder}index.html`, licence.title, renderLicenceText(read(licence.file)));
}

for (const file of SHARED_FILES) {
  fs.copyFileSync(path.join(ROOT, file), path.join(DIST, path.basename(file)));
}

// the shared bar on every page the other tools wrote
let barred = 0;
for (const generated of GENERATED) {
  for (const relative of pagesUnder(generated.folder)) {
    const file = path.join(DIST, relative);
    const html = fs.readFileSync(file, 'utf8');
    const root = rootFor(relative);
    const result = addSiteBar(html, generated.kind, generated.head(root), siteBar(root, generated.section));
    if (result !== html) {
      fs.writeFileSync(file, result);
      barred++;
    }
  }
}

console.log(`built the docs site pages into ${path.relative(ROOT, DIST)} from ${branch} @ ${commit.slice(0, 7)}, and put the bar on ${barred} generated page(s)`);
