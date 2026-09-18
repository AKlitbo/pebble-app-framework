#!/usr/bin/env node
/**
 * Builds the docs site's own pages into docs/site/dist and puts the shared bar on every page.
 *
 * Doxygen, TypeDoc, and both coverage runs have already written their parts into dist by the time this
 * runs. This adds the home page, the changelog, the notices, and the licence pages around them, plus the
 * stylesheets, theme script, and logo they share. Then it goes back through every page those tools wrote
 * and adds the shared bar, so each one has a way home and the same theme toggle. It never clears dist.
 *
 * A coverage summary or a tool's folder that is missing is skipped, so the site still builds on a machine
 * that skipped part of the build.
 *
 * Run via `npm run docs:site`, or as the last part of the build-docs-site action.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_URL,
  addSiteBar,
  escapeHtml,
  fillTemplate,
  pixelStrip,
  readGcovrSummary,
  readVitestSummary,
  renderInline,
  renderLicenceText,
  renderMarkdown,
  renderSiteBar,
  rootFor,
  sectionList,
  splitTitle,
  takeIntro,
  undotLinks,
  type GeneratedPage,
  type SiteSection,
} from './render.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SITE = path.join(ROOT, 'docs', 'site');
const TEMPLATES = path.join(SITE, 'templates');
const DIST = path.join(SITE, 'dist');

// the two full licence texts, each with the folder its page sits in and the title it shows
const LICENCES = [
  { file: 'LICENSES/AGPL-3.0-or-later.txt', folder: 'agpl-3.0-or-later', title: 'GNU Affero General Public License v3.0 or later' },
  { file: 'LICENSES/PolyForm-Noncommercial-1.0.0.txt', folder: 'polyform-noncommercial-1.0.0', title: 'PolyForm Noncommercial License 1.0.0' },
];

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
// the Doxygen header already loads theme.js, versions.js, and the Plex fonts, and TypeDoc's stylesheet brings the fonts
// the coverage reports bring none of it, and they get the site's look from coverage.css
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
    head: (root) => `<script src="${root}theme.js"></script>\n<script src="${root}versions.js"></script>\n<link rel="stylesheet" href="${root}site-bar.css">\n`,
  },
  {
    folder: 'coverage/c',
    kind: 'report',
    section: 'coverage-c',
    head: (root) => coverageHead(root),
  },
  {
    folder: 'coverage/ts',
    kind: 'report',
    section: 'coverage-ts',
    head: (root) => coverageHead(root),
  },
];

// Doxygen writes a bare list of links for web crawlers, with no header and nobody reading it, so it gets no bar
const SKIPPED = new Set(['c/doxygen_crawl.html']);

function coverageHead(root: string): string {
  return `<script src="${root}theme.js"></script>\n<script src="${root}versions.js"></script>\n${FONTS}\n<link rel="stylesheet" href="${root}site-bar.css">\n<link rel="stylesheet" href="${root}coverage.css">\n`;
}

/** Reads a repo file with Windows line endings folded, so a checkout on either system renders the same. */
function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
}

function template(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES, name), 'utf8').replace(/\r\n/g, '\n');
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

/**
 * Takes the dot off each folder at the top of a report, since GitHub Pages leaves out a .github folder
 * when it packs the site. A folder left by an earlier build under the new name is replaced, because the
 * report was just written again.
 */
function undotFolders(folder: string): string[] {
  const start = path.join(DIST, folder);
  if (!fs.existsSync(start)) {
    return [];
  }
  const dotted = fs.readdirSync(start, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('.'));
  for (const entry of dotted) {
    const target = path.join(start, entry.name.slice(1));
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(path.join(start, entry.name), target);
  }
  return dotted.map((entry) => entry.name);
}

const version = (JSON.parse(read('package.json')) as { version: string }).version;
const commit = process.env.GITHUB_SHA || git('rev-parse', 'HEAD');
// a PR build's ref name is its merge ref, so the branch it came from is tried first
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD');
const built = new Date().toISOString().slice(0, 10);
// a release build leaves the coverage reports out and links to main's, such as ../main/ from the site root
const coverageSite = process.env.DOCS_COVERAGE_SITE || '';

const themeToggle = template('theme-toggle.html');
const siteBarTemplate = template('site-bar.html');

// in CI the branch is main or the tag being built, which is also the folder the site is published into
function siteBar(root: string, section: SiteSection): string {
  return renderSiteBar(siteBarTemplate, { root, section, themeToggle, version: branch, coverageSite });
}

function footer(root: string): string {
  return fillTemplate(template('footer.html'), { root, repoUrl: REPO_URL, branch: escapeHtml(branch) });
}

function page(relative: string, title: string, body: string): void {
  const root = rootFor(relative);
  write(relative, fillTemplate(template('page.html'), { root, title: escapeHtml(title), body, siteBar: siteBar(root, null), footer: footer(root) }));
}

// the home page, with the README's title and tagline in the header and the rest below the cards
const home = { root: '', commit };
const readme = splitTitle(read('README.md'));
const intro = takeIntro(readme.body);
const rendered = renderMarkdown(intro.rest, home);

write('index.html', fillTemplate(template('landing.html'), {
  siteBar: siteBar('', null),
  tagline: renderInline(intro.intro, home),
  version: escapeHtml(version),
  branch: escapeHtml(branch),
  commitShort: commit.slice(0, 7),
  built,
  coverageC: pixelStrip(readGcovrSummary(readSummary('coverage/c/summary.json'))),
  coverageTs: pixelStrip(readVitestSummary(readSummary('coverage/ts/coverage-summary.json'))),
  coverageRoot: coverageSite,
  toc: sectionList(rendered.sections),
  readme: rendered.html,
  footer: footer(''),
}));

for (const [file, folder, fallback] of [['CHANGELOG.md', 'changelog', 'Changelog'], ['NOTICES.md', 'notices', 'Third-Party Notices']]) {
  const markdown = splitTitle(read(file));
  page(`${folder}/index.html`, markdown.title || fallback, renderMarkdown(markdown.body, { root: '../', commit }).html);
}

const licenceLinks = LICENCES.map((licence) => `<li><a href="${licence.folder}/">${escapeHtml(licence.title)}</a></li>`).join('\n');
page('licences/index.html', 'Licence', `${renderLicenceText(read('LICENSE'))}\n<h2 id="full-texts">Full Texts</h2>\n<ul>\n${licenceLinks}\n</ul>`);

for (const licence of LICENCES) {
  page(`licences/${licence.folder}/index.html`, licence.title, renderLicenceText(read(licence.file)));
}

for (const file of SHARED_FILES) {
  fs.copyFileSync(path.join(ROOT, file), path.join(DIST, path.basename(file)));
}

// the Vitest report lays out the action scripts under .github/, which would never reach GitHub Pages
const undotted = undotFolders('coverage/ts');

// the shared bar on every page the other tools wrote
let barred = 0;
for (const generated of GENERATED) {
  for (const relative of pagesUnder(generated.folder)) {
    const file = path.join(DIST, relative);
    const html = fs.readFileSync(file, 'utf8');
    const root = rootFor(relative);
    const linked = generated.folder === 'coverage/ts' ? undotLinks(html, undotted) : html;
    const result = addSiteBar(linked, generated.kind, generated.head(root), siteBar(root, generated.section));
    if (result !== html) {
      fs.writeFileSync(file, result);
      barred++;
    }
  }
}

console.log(`built the docs site pages into ${path.relative(ROOT, DIST)} from ${branch} @ ${commit.slice(0, 7)}, and put the bar on ${barred} generated page(s)`);
