/**
 * Renders the pages of the docs site that come from files in the repo.
 *
 * The changelog, the notices, the licences, and the paf pages each get a page of their own. The README
 * is left to GitHub, so a link to it goes there. Everything here takes what it needs as arguments and
 * hands back a string, so build-site.ts is the only part that reads the disk, git, or the clock.
 */
import path from 'node:path';
import { Marked, type Token } from 'marked';

/** Where the framework lives on GitHub. A link to a repo file with no page on the site opens it here. */
export const REPO_URL = 'https://github.com/AKlitbo/pebble-app-framework';

/** A repo file with a page of its own on the site. */
export interface SitePage {
  /** The file, by its path from the repo root. */
  file: string;
  /** The folder its page sits in, from the site root, with a trailing slash. */
  folder: string;
  /** The title its page shows, and the name the footer links it by. */
  title: string;
}

/**
 * Every repo file with a page of its own, by the name build-site.ts and the footer use for it.
 *
 * The page build, the footer, and the link rewriting all read their folders from here, so a page that
 * moves takes every link to it along.
 */
export const PAGES = {
  changelog: { file: 'src/CHANGELOG.md', folder: 'changelog/', title: 'Changelog' },
  notices: { file: 'src/NOTICES.md', folder: 'notices/', title: 'Third-Party Notices' },
  licence: { file: 'LICENSE', folder: 'licences/', title: 'Licence' },
  agpl: { file: 'src/LICENSES/AGPL-3.0-or-later.txt', folder: 'licences/agpl-3.0-or-later/', title: 'GNU Affero General Public License v3.0 or later' },
  polyform: { file: 'src/LICENSES/PolyForm-Noncommercial-1.0.0.txt', folder: 'licences/polyform-noncommercial-1.0.0/', title: 'PolyForm Noncommercial License 1.0.0' },
} satisfies Record<string, SitePage>;

/**
 * The pages on paf, the command a face repo builds with, in the order the strip at the top of each one
 * lists them. The markdown sits in docs/paf/, where the pages link each other by file name.
 */
export const PAF_PAGES: readonly SitePage[] = [
  { file: 'docs/paf/index.md', folder: 'paf/', title: 'paf' },
  { file: 'docs/paf/units.md', folder: 'paf/units/', title: 'Units' },
  { file: 'docs/paf/commands.md', folder: 'paf/commands/', title: 'Commands' },
  { file: 'docs/paf/workflows.md', folder: 'paf/workflows/', title: 'Workflows' },
  { file: 'docs/paf/troubleshooting.md', folder: 'paf/troubleshooting/', title: 'Troubleshooting' },
];

/** A heading in a section's sidebar and on its index page, with the pages listed under it. */
export interface PageGroup {
  /** The heading, in Title Case. */
  name: string;
  /** The pages under it, in the order they are listed. */
  pages: readonly SitePage[];
}

/**
 * The index page of the pages on how the framework's code works inside. Its markdown holds the title
 * and the opening, and the build adds the grouped list of pages under them.
 */
export const HOW_INDEX: SitePage = { file: 'docs/how/index.md', folder: 'how/', title: 'How It Works' };

/** The pages on how the framework's code works inside, under the headings the sidebar and the index list them by. */
export const HOW_GROUPS: readonly PageGroup[] = [
  {
    name: 'Settings and Messages',
    pages: [
      { file: 'docs/how/life-of-a-setting.md', folder: 'how/life-of-a-setting/', title: 'The Life of a Setting' },
      { file: 'docs/how/phone-side.md', folder: 'how/phone-side/', title: 'The Phone Side' },
      { file: 'docs/how/settings-page.md', folder: 'how/settings-page/', title: 'The Settings Page' },
      { file: 'docs/how/settings-on-the-watch.md', folder: 'how/settings-on-the-watch/', title: 'Settings on the Watch' },
      { file: 'docs/how/talking-to-the-phone.md', folder: 'how/talking-to-the-phone/', title: 'Talking to the Phone' },
      { file: 'docs/how/message-formats.md', folder: 'how/message-formats/', title: 'The Message Formats' },
    ],
  },
  {
    name: 'Stores',
    pages: [
      { file: 'docs/how/stores.md', folder: 'how/stores/', title: 'How the Stores Work' },
      { file: 'docs/how/time-store.md', folder: 'how/time-store/', title: 'The Time Store' },
      { file: 'docs/how/system-store.md', folder: 'how/system-store/', title: 'The System Store' },
      { file: 'docs/how/location-store.md', folder: 'how/location-store/', title: 'The Location Store' },
      { file: 'docs/how/weather-store.md', folder: 'how/weather-store/', title: 'The Weather Store' },
      { file: 'docs/how/weather-readings.md', folder: 'how/weather-readings/', title: 'Weather Readings' },
      { file: 'docs/how/fetching-the-weather.md', folder: 'how/fetching-the-weather/', title: 'Fetching the Weather' },
      { file: 'docs/how/stock-store.md', folder: 'how/stock-store/', title: 'The Stock Store' },
      { file: 'docs/how/calendar-store.md', folder: 'how/calendar-store/', title: 'The Calendar Store' },
      { file: 'docs/how/health-store.md', folder: 'how/health-store/', title: 'The Health Store' },
    ],
  },
  {
    name: 'Clock and Sky',
    pages: [
      { file: 'docs/how/moon.md', folder: 'how/moon/', title: 'The Moon' },
      { file: 'docs/how/beats.md', folder: 'how/beats/', title: '.beats' },
      { file: 'docs/how/julian-date.md', folder: 'how/julian-date/', title: 'The Julian Date' },
      { file: 'docs/how/sunrise-and-sunset.md', folder: 'how/sunrise-and-sunset/', title: 'Sunrise and Sunset' },
      { file: 'docs/how/tides.md', folder: 'how/tides/', title: 'Tides' },
      { file: 'docs/how/time-zones.md', folder: 'how/time-zones/', title: 'Time Zones' },
      { file: 'docs/how/time-bands.md', folder: 'how/time-bands/', title: 'Time Bands and Night Hours' },
      { file: 'docs/how/dates-and-durations.md', folder: 'how/dates-and-durations/', title: 'Dates and Durations' },
    ],
  },
  {
    name: 'Drawing',
    pages: [
      { file: 'docs/how/engine.md', folder: 'how/engine/', title: 'The Engine' },
      { file: 'docs/how/readouts.md', folder: 'how/readouts/', title: 'Readouts' },
      { file: 'docs/how/fonts.md', folder: 'how/fonts/', title: 'Fonts' },
      { file: 'docs/how/icons.md', folder: 'how/icons/', title: 'Icons' },
      { file: 'docs/how/layout-strings.md', folder: 'how/layout-strings/', title: 'Layout Strings' },
    ],
  },
  {
    name: 'Text, Numbers, and Feedback',
    pages: [
      { file: 'docs/how/fitting-text.md', folder: 'how/fitting-text/', title: 'Fitting Text' },
      { file: 'docs/how/numbers-and-units.md', folder: 'how/numbers-and-units/', title: 'Numbers and Units' },
      { file: 'docs/how/vibrations.md', folder: 'how/vibrations/', title: 'Vibrations' },
    ],
  },
  {
    name: 'Plugins',
    pages: [
      { file: 'docs/how/icons-plugin.md', folder: 'how/icons-plugin/', title: 'The Icons Plugin' },
      { file: 'docs/how/frame-plugin.md', folder: 'how/frame-plugin/', title: 'The Frame Plugin' },
      { file: 'docs/how/thumbnails-plugin.md', folder: 'how/thumbnails-plugin/', title: 'The Thumbnails Plugin' },
      { file: 'docs/how/dev-plugin.md', folder: 'how/dev-plugin/', title: 'The Dev Plugin' },
    ],
  },
  {
    name: 'CI',
    pages: [
      { file: 'docs/how/ci-builds.md', folder: 'how/ci-builds/', title: 'Building in CI' },
      { file: 'docs/how/ci-memory.md', folder: 'how/ci-memory/', title: 'Memory Reports' },
      { file: 'docs/how/ci-releases.md', folder: 'how/ci-releases/', title: 'Releases' },
    ],
  },
];

/** Every page under HOW_GROUPS, in the order the sidebar lists them. */
export const HOW_PAGES: readonly SitePage[] = HOW_GROUPS.flatMap((group) => group.pages);

/**
 * The notices for what only the docs site uses. The notices page shows them after the ones that ship
 * with the framework, which src/NOTICES.md holds.
 */
export const SITE_NOTICES = 'NOTICES.md';

// the same pages by file, for the link rewriting
// src/LICENSE is the copy that ships with the framework, and the root one covers the whole repo, so
// its page stands in for both. the root NOTICES.md is the second half of the notices page
const SITE_PAGES = new Map<string, string>([
  ...[...Object.values(PAGES), ...PAF_PAGES, HOW_INDEX, ...HOW_PAGES].map((page): [string, string] => [page.file, page.folder]),
  ['src/LICENSE', PAGES.licence.folder],
  [SITE_NOTICES, PAGES.notices.folder],
]);

/**
 * A link or image path as a path from the repo root, the way GitHub reads it. A leading slash already
 * starts at the root, and anything else starts in the markdown file's own folder. A path that climbs
 * out of the repo has no file to point at, so it comes back as null.
 */
function repoTarget(href: string, folder: string): string | null {
  const target = href.startsWith('/') ? path.posix.normalize(href.slice(1)) : path.posix.normalize(path.posix.join(folder, href));

  return target === '..' || target.startsWith('../') ? null : target;
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// the number of pixels in a coverage strip
const STRIP_PIXELS = 10;

/** What a link needs to know about the page it sits on. */
export interface LinkOptions {
  /** The way back up to the site root from the page being rendered, such as '' or '../../'. */
  root: string;
  /** The commit the site is built from, so a link to a repo file opens the file as it was then. */
  commit: string;
  /**
   * The repo folder the markdown file sits in, with forward slashes, such as `src`. GitHub reads a
   * relative link from there, so the site does too. Left out, it is the repo root.
   */
  folder?: string;
  /**
   * The page the reference docs wrote for each repo file that has one, by the file's path from the repo
   * root, such as `c/moon_8h.html` for `src/c/core/clock/moon.h`. Left out, every file goes to GitHub.
   */
  apiPages?: ReadonlyMap<string, string>;
  /**
   * Colours a code block, given its text and the first word of its fence. It hands back the whole
   * block's html, or null for a language it does not know, which leaves the block plain. Left out,
   * every block is plain.
   */
  highlight?: (code: string, language: string) => string | null;
}

/**
 * Escapes text so it shows as written inside html, attribute values included.
 *
 * @param text The text to escape.
 * @return The text with &, <, >, and both quote marks swapped for their entities.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

/**
 * Turns a heading into the id its anchor uses, the way GitHub does. `Using It` becomes `using-it`.
 *
 * Every space becomes its own hyphen and a run of them is kept, so `[2.2.0] - 2026-09-23` becomes
 * `220---2026-09-23`. A link written to work on GitHub then lands on the same heading here.
 *
 * @param text The heading's plain text.
 * @return Lowercase letters, digits, underscores, and hyphens, or `section` when nothing is left.
 */
export function slug(text: string): string {
  const result = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

  return result || 'section';
}

/**
 * Points a link from one of the repo's markdown files at the right place on the site.
 *
 * The markdown links files by their path in the repo, which is a 404 once it is a page on GitHub Pages. A
 * file with a page of its own goes to that page, and a C file goes to the page Doxygen wrote for it. Any
 * other repo file goes to GitHub at the commit the site was built from, including one written from the
 * repo root with a leading slash. Full URLs and anchors already work, so they are left alone.
 *
 * @param href The link as written in the markdown.
 * @param options Where the page sits and which commit it was built from.
 * @return The link to put in the html.
 */
export function rewriteLink(href: string, options: LinkOptions): string {
  if (href.startsWith('#') || href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return href;
  }

  const hashAt = href.indexOf('#');
  const target = repoTarget(hashAt === -1 ? href : href.slice(0, hashAt), options.folder ?? '');

  if (target === null) {
    return href;
  }

  const fragment = hashAt === -1 ? '' : href.slice(hashAt);

  const page = SITE_PAGES.get(target);

  if (page !== undefined) {
    return `${options.root}${page}${fragment}`;
  }

  const apiPage = options.apiPages?.get(target);

  if (apiPage !== undefined) {
    return `${options.root}${apiPage}${fragment}`;
  }

  return `${REPO_URL}/blob/${options.commit}/${target}${fragment}`;
}

/**
 * Reads the page Doxygen wrote for each file from the tag file it writes beside the C docs.
 *
 * Doxygen names a file's page from the file name alone, such as `moon_8h.html`, and gives one a
 * different name when two files share a name. The tag file records each file's real path with the
 * page it got, so a link never has to guess. A file Doxygen leaves out, such as a spec, has no entry.
 *
 * @param tag The tag file's xml.
 * @param folder The folder the pages sit in from the site root, with a trailing slash, such as `c/`.
 * @return Each file's page from the site root, by the file's path from the repo root.
 */
export function readDoxygenFiles(tag: string, folder: string): Map<string, string> {
  const pages = new Map<string, string>();

  for (const [, body] of tag.matchAll(/<compound kind="file">([\s\S]*?)<\/compound>/g)) {
    const name = /<name>([^<]+)<\/name>/.exec(body)?.[1];
    const where = /<path>([^<]*)<\/path>/.exec(body)?.[1] ?? '';
    const filename = /<filename>([^<]+)<\/filename>/.exec(body)?.[1];

    if (name === undefined || filename === undefined) {
      continue;
    }

    // a tag file written on Windows separates the folders with backslashes
    const file = path.posix.join(where.replace(/\\/g, '/'), name);
    const page = filename.endsWith('.html') ? filename : `${filename}.html`;

    pages.set(file, `${folder}${page}`);
  }

  return pages;
}

/**
 * Points an image in one of the repo's markdown files at a copy that loads on the site.
 *
 * The site has no copy of the repo's files, so a repo path is a 404 there, whether written relative or
 * from the repo root. It loads the file itself from GitHub at the commit the site was built from. A full
 * URL is left alone.
 *
 * @param src The image path as written in the markdown.
 * @param options Which commit the site was built from.
 * @return The source to put in the html.
 */
export function rewriteImage(src: string, options: LinkOptions): string {
  if (src.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
    return src;
  }

  const target = repoTarget(src, options.folder ?? '');

  return target === null ? src : `${REPO_URL}/raw/${options.commit}/${target}`;
}

/** Every token after `from` joined back into markdown, which is exactly the source they were read from. */
function joinRaw(tokens: Token[], from: number): string {
  return tokens.slice(from).map((token) => token.raw).join('');
}

/** The index of the first token at or after `from` that is not just blank lines. */
function firstContent(tokens: Token[], from: number): number {
  let index = from;

  while (index < tokens.length && tokens[index].type === 'space') {
    index++;
  }

  return index;
}

/**
 * Takes the level one heading off the top of a markdown file.
 *
 * The site shows that title in its own header, so leaving it in the body would print it twice. It goes in
 * the page's title and heading as plain text, so its inline markup such as backticks is taken off.
 *
 * @param markdown The whole file.
 * @return The title, and the markdown after it. With no level one heading first, the title is empty and
 * the body is the whole file.
 */
export function splitTitle(markdown: string): { title: string; body: string } {
  const tokens = new Marked().lexer(markdown);
  const index = firstContent(tokens, 0);
  const first = tokens[index];

  if (first === undefined || first.type !== 'heading' || first.depth !== 1) {
    return { title: '', body: markdown };
  }

  return { title: plainText(first.tokens ?? []), body: joinRaw(tokens, index + 1) };
}

/** The text a heading reads as, with its inline markup such as backticks and links taken off. */
function plainText(tokens: Token[]): string {
  return tokens
    .map((token) => ('tokens' in token && Array.isArray(token.tokens) ? plainText(token.tokens) : 'text' in token ? String(token.text) : ''))
    .join('');
}

/**
 * Builds a markdown reader that rewrites links and images and gives each heading an id. Each page gets a
 * fresh one, so ids from one page never bump the count on another.
 */
function createMarked(options: LinkOptions): Marked {
  // every id handed out on the page, and for each base the number its next repeat takes
  const used = new Map<string, number>();

  return new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        // GitHub numbers a repeat from 1, so the second Fixed is fixed-1, and skips a number a heading
        // already took as its own id, such as one titled Fixed 1
        const base = slug(plainText(tokens));
        let id = base;

        while (used.has(id)) {
          const next = (used.get(base) ?? 0) + 1;

          used.set(base, next);
          id = `${base}-${next}`;
        }

        used.set(id, 0);

        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';

        return `<a href="${escapeHtml(rewriteLink(href, options))}"${titleAttribute}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, title, text }) {
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';

        return `<img src="${escapeHtml(rewriteImage(href, options))}" alt="${escapeHtml(text)}"${titleAttribute}>`;
      },
      code({ text, lang }) {
        // a fence's info string can carry more than the language, such as `sh title`, and only the first
        // word names the language
        const language = (lang || '').split(/\s+/)[0];

        // a diagram goes in as its source, which site/diagrams.js draws once the page loads
        if (language === 'mermaid') {
          return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
        }

        const coloured = language && options.highlight ? options.highlight(text, language) : null;

        if (coloured !== null) {
          return `${coloured}\n`;
        }

        const className = language ? ` class="language-${escapeHtml(language)}"` : '';

        return `<pre><code${className}>${escapeHtml(text)}</code></pre>\n`;
      },
    },
  });
}

/**
 * Renders a markdown body to html for the site.
 *
 * @param markdown The markdown to render.
 * @param options Where the page sits and which commit it was built from, for the links.
 * @return The html.
 */
export function renderMarkdown(markdown: string, options: LinkOptions): string {
  return createMarked(options).parse(markdown, { async: false });
}

/**
 * Wraps a plain text licence so it reads exactly as written, spacing and all.
 *
 * @param text The licence file.
 * @return The escaped text inside a pre block.
 */
export function renderLicenceText(text: string): string {
  return `<pre class="licence">${escapeHtml(text.replace(/\n+$/, ''))}</pre>`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A coverage figure is only worth drawing when it is a real percentage. */
function percentOrNull(value: unknown): number | null {
  return typeof value === 'number' && value >= 0 && value <= 100 ? value : null;
}

/**
 * Reads the share of lines covered from the summary Vitest's json-summary reporter writes.
 *
 * @param json The parsed coverage-summary.json, or null when there was none.
 * @return The total line percentage, or null when the summary is missing or does not hold a real one.
 * Vitest writes the string "Unknown" when it measured nothing.
 */
export function readVitestSummary(json: unknown): number | null {
  const total = isRecord(json) ? json.total : undefined;
  const lines = isRecord(total) ? total.lines : undefined;

  return isRecord(lines) ? percentOrNull(lines.pct) : null;
}

/**
 * Reads the share of lines covered from the summary gcovr's --json-summary writes.
 *
 * @param json The parsed summary.json, or null when there was none.
 * @return The line percentage, or null when the summary is missing or does not hold a real one.
 */
export function readGcovrSummary(json: unknown): number | null {
  return isRecord(json) ? percentOrNull(json.line_percent) : null;
}

/**
 * Draws the strip of pixels a coverage card shows in place of a number.
 *
 * One pixel lights for each full ten percent of lines. It rounds down, so a full strip always means every
 * line ran. The exact figure sits in the tooltip and in hidden text for screen readers.
 *
 * @param percent The share of lines covered, or null when there is no summary.
 * @return The strip's html, or an empty string with no figure so the card shows no strip at all.
 */
export function pixelStrip(percent: number | null): string {
  if (percent === null) {
    return '';
  }

  const lit = Math.floor(percent / 10);
  // rounded down like the pixels, so 99.96 never reads 100.0% beside a strip with one pixel dark
  const figure = `${(Math.floor(percent * 10) / 10).toFixed(1)}% of lines`;
  const pixels = Array.from({ length: STRIP_PIXELS }, (_, index) => (index < lit ? '<i></i>' : '<i class="off"></i>')).join('');

  return `<div class="pixels" title="${figure}">${pixels}<span class="visually-hidden">${figure}</span></div>`;
}

/**
 * Fills each `{{name}}` in a template.
 *
 * Both kinds of mismatch stop the build. A name with no value would ship a raw `{{commit}}` onto the
 * published page, and a value nothing uses means the template and the build script disagree about a name.
 * Values go in once and are never read for placeholders themselves.
 *
 * @param template The html with its placeholders.
 * @param values The html to put in for each name.
 * @return The filled html.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  const used = new Set<string>();

  const result = template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`The template names {{${name}}} but nothing was given for it.`);
    }

    used.add(name);
    return values[name];
  });

  const unused = Object.keys(values).filter((name) => !used.has(name));

  if (unused.length > 0) {
    throw new Error(`Nothing in the template uses ${unused.map((name) => `{{${name}}}`).join(', ')}.`);
  }

  return result;
}

/** A part of the site the shared bar links to, or null for a page that is none of them. */
export type SiteSection = 'c' | 'ts' | 'paf' | 'how' | 'coverage-c' | 'coverage-ts' | null;

/**
 * The strip of links across the top of a page in a section of several pages, such as the paf pages, with
 * the page being shown marked so it stands out and reads as the current one.
 *
 * @param pages The section's pages, in the order the strip lists them.
 * @param current The page the strip sits on.
 * @param root The way back up to the site root from that page.
 * @return The strip's html.
 */
export function renderSectionNav(pages: readonly SitePage[], current: SitePage, root: string): string {
  const links = pages.map((page) => {
    const mark = page.folder === current.folder ? ' aria-current="page"' : '';

    return `<li><a href="${root}${page.folder}"${mark}>${escapeHtml(page.title)}</a></li>`;
  });

  return `<nav class="section-nav" aria-label="Pages in this section">\n<ul>\n${links.join('\n')}\n</ul>\n</nav>`;
}

/** Each group's heading and its list of pages, with the page being shown marked when there is one. */
function groupLists(groups: readonly PageGroup[], current: SitePage | null, root: string, heading: 'h2' | 'h3'): string {
  return groups.map((group) => {
    const links = group.pages.map((page) => {
      const here = current !== null && page.folder === current.folder;

      return `<li${here ? ' class="current"' : ''}><a href="${root}${page.folder}"${here ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</a></li>`;
    });

    return `<${heading}>${escapeHtml(group.name)}</${heading}>\n<ul>\n${links.join('\n')}\n</ul>`;
  }).join('\n');
}

/**
 * The sidebar beside a page in a grouped section, listing every page in the section under its group's
 * heading with the page being shown marked. It sits open beside the text on a wide screen, and
 * site/side-nav.js folds it into a Pages button above the text on a phone.
 *
 * @param index The section's index page, linked from the top of the sidebar.
 * @param groups The section's groups, in the order the sidebar lists them.
 * @param current The page the sidebar sits beside.
 * @param root The way back up to the site root from that page.
 * @return The sidebar's html.
 */
export function renderSideNav(index: SitePage, groups: readonly PageGroup[], current: SitePage, root: string): string {
  return [
    '<details class="side-nav" open>',
    '<summary>Pages</summary>',
    `<nav aria-label="${escapeHtml(index.title)} pages">`,
    `<a class="side-nav-index" href="${root}${index.folder}">${escapeHtml(index.title)}</a>`,
    groupLists(groups, current, root, 'h3'),
    '</nav>',
    '</details>',
  ].join('\n');
}

/**
 * A link for each group in a section, to the first page in it, for the section's card on the home page.
 *
 * @param groups The section's groups, in the order the card lists them.
 * @param root The way back up to the site root from the page the card sits on.
 * @return The list's html, or an empty string when there are no groups.
 */
export function renderGroupLinks(groups: readonly PageGroup[], root: string): string {
  const links = groups
    .filter((group) => group.pages.length > 0)
    .map((group) => `<li><a href="${root}${group.pages[0].folder}">${escapeHtml(group.name)}</a></li>`);

  return links.length === 0 ? '' : `<ul class="card-groups">\n${links.join('\n')}\n</ul>`;
}

/**
 * The links to the page before and the page after, which sit under a page's text so a reader can go on
 * without the sidebar.
 *
 * @param pages Every page in the section, in the order the sidebar lists them.
 * @param current The page the links sit on.
 * @param root The way back up to the site root from that page.
 * @return The links' html, or an empty string for a page outside the list.
 */
export function renderPageSteps(pages: readonly SitePage[], current: SitePage, root: string): string {
  const at = pages.findIndex((page) => page.folder === current.folder);

  if (at === -1) {
    return '';
  }

  const step = (page: SitePage | undefined, rel: 'prev' | 'next', label: string) => (page
    ? `<a class="page-step page-step-${rel}" rel="${rel}" href="${root}${page.folder}"><span>${label}</span>${escapeHtml(page.title)}</a>`
    : '<span class="page-step"></span>');

  return `<nav class="page-steps" aria-label="Previous and next pages">\n${step(pages[at - 1], 'prev', 'Previous')}\n${step(pages[at + 1], 'next', 'Next')}\n</nav>`;
}

/**
 * The grouped list of a section's pages that sits under the opening on its index page.
 *
 * @param groups The section's groups, in the order the list shows them.
 * @param root The way back up to the site root from the index page.
 * @return The list's html.
 */
export function renderSectionIndex(groups: readonly PageGroup[], root: string): string {
  return `<div class="section-index">\n${groupLists(groups, null, root, 'h2')}\n</div>`;
}

/**
 * Works out the way back up to the site root from a page.
 *
 * @param page The page's path from the site root, with forward slashes, such as `ts/interfaces/app.html`.
 * @return One `../` for each folder the page sits in, or an empty string for a page at the root.
 */
export function rootFor(page: string): string {
  return '../'.repeat(page.split('/').length - 1);
}

/** What the shared bar needs to know about the page it sits on and the build it came from. */
export interface SiteBarOptions {
  /** The way back up to the site root from the page. */
  root: string;
  /** The section the page is in, which the bar shows as selected. */
  section: SiteSection;
  /** The theme toggle's html. */
  themeToggle: string;
  /** The version this build is published as, such as main or v2.0.0, which the version picker opens on. */
  version: string;
}

/**
 * Fills the shared bar for one page and marks the section that page belongs to.
 *
 * @param template The bar's template, with `{{root}}`, `{{version}}`, `{{repoUrl}}`, and `{{themeToggle}}`.
 * @param options The page and the build the bar is for.
 * @return The bar's html.
 */
export function renderSiteBar(template: string, options: SiteBarOptions): string {
  const { root, section, themeToggle } = options;
  const bar = fillTemplate(template, {
    root,
    version: escapeHtml(options.version),
    repoUrl: REPO_URL,
    themeToggle,
  });

  return section === null ? bar : bar.replace(`data-section="${section}"`, `data-section="${section}" aria-current="location"`);
}

/** The kinds of page other tools write, which each need the bar in a different spot. */
export type GeneratedPage = 'doxygen' | 'typedoc' | 'report';

// where the bar goes in each kind of page
// Doxygen sizes its sidebar from the height of #top, so the bar goes inside it or the sidebar runs off the page
// TypeDoc's toolbar sticks to the top of the window, so the bar sits just above it and scrolls away
// the coverage reports have nothing to fit around, so the bar opens the body
const BAR_SPOTS: Record<GeneratedPage, { pattern: RegExp; before: boolean }> = {
  doxygen: { pattern: /<div id="top">[^\n]*\n/, before: false },
  typedoc: { pattern: /<header class="tsd-page-toolbar"/, before: true },
  report: { pattern: /<body[^>]*>\n?/, before: false },
};

// a bar already on the page, from the nav tag through to its close and the line breaks after it
const EXISTING_BAR = /<nav class="site-bar"[\s\S]*?<\/nav>\n*/;

// the tags the bar needs in the head, between the markers they are put in with
const HEAD_START = '<!-- site-bar head -->\n';
const HEAD_END = '<!-- /site-bar head -->\n';
const EXISTING_HEAD = /<!-- site-bar head -->\n[\s\S]*?<!-- \/site-bar head -->\n/;

/**
 * Puts the shared bar and the tags it needs into a page another tool wrote.
 *
 * A page that already has a bar gets that bar and its head tags swapped for the new ones, so building the
 * site pages again over the same output never gives a page two bars or two sets of head tags, a change to
 * either still reaches it, and a page that comes out the same is left as it is. The head tags sit between
 * two markers so they can be found again. A page missing the spot its kind expects is refused, so a tool
 * update that changes its markup stops the build rather than publishing pages with no way home.
 *
 * @param html The page as the tool wrote it, or as an earlier build left it.
 * @param kind Which tool wrote it.
 * @param head The tags to add at the end of the head, such as the bar's stylesheet.
 * @param bar The filled bar.
 * @return The page with the bar in.
 */
export function addSiteBar(html: string, kind: GeneratedPage, head: string, bar: string): string {
  const headTags = HEAD_START + head + (head.endsWith('\n') ? '' : '\n') + HEAD_END;
  // the bar always ends on one line break, the same whether it went in fresh or replaced one
  const barLine = bar.replace(/\n*$/, '\n');

  if (EXISTING_BAR.test(html)) {
    return html.replace(EXISTING_HEAD, () => headTags).replace(EXISTING_BAR, () => barLine);
  }

  const headEnd = html.indexOf('</head>');
  const spot = BAR_SPOTS[kind].pattern.exec(html);

  if (headEnd === -1 || spot === null) {
    throw new Error(`A ${kind} page has no ${headEnd === -1 ? '</head>' : String(BAR_SPOTS[kind].pattern)} to put the site bar at.`);
  }

  const barAt = BAR_SPOTS[kind].before ? spot.index : spot.index + spot[0].length;

  return html.slice(0, headEnd) + headTags + html.slice(headEnd, barAt) + barLine + html.slice(barAt);
}
