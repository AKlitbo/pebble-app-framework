/**
 * Renders the pages of the docs site that come from files in the repo.
 *
 * The changelog, the notices, and the licences each get a page of their own. The README is left to
 * GitHub, so a link to it goes there. Everything here takes what it needs as arguments and hands back a
 * string, so build-site.ts is the only part that reads the disk, git, or the clock.
 */
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
  changelog: { file: 'CHANGELOG.md', folder: 'changelog/', title: 'Changelog' },
  notices: { file: 'NOTICES.md', folder: 'notices/', title: 'Third-Party Notices' },
  licence: { file: 'LICENSE', folder: 'licences/', title: 'Licence' },
  agpl: { file: 'LICENSES/AGPL-3.0-or-later.txt', folder: 'licences/agpl-3.0-or-later/', title: 'GNU Affero General Public License v3.0 or later' },
  polyform: { file: 'LICENSES/PolyForm-Noncommercial-1.0.0.txt', folder: 'licences/polyform-noncommercial-1.0.0/', title: 'PolyForm Noncommercial License 1.0.0' },
} satisfies Record<string, SitePage>;

// the same pages by file, for the link rewriting
const SITE_PAGES = new Map<string, string>(Object.values(PAGES).map((page) => [page.file, page.folder]));

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// the number of pixels in a coverage strip
const STRIP_PIXELS = 10;

/** What a link needs to know about the page it sits on. */
export interface LinkOptions {
  /** The way back up to the site root from the page being rendered, such as '' or '../../'. */
  root: string;
  /** The commit the site is built from, so a link to a repo file opens the file as it was then. */
  commit: string;
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
 * file with a page of its own goes to that page. Any other repo file goes to GitHub at the commit the site
 * was built from, including one written from the repo root with a leading slash. Full URLs and anchors
 * already work, so they are left alone.
 *
 * @param href The link as written in the markdown.
 * @param options Where the page sits and which commit it was built from.
 * @return The link to put in the html.
 */
export function rewriteLink(href: string, options: LinkOptions): string {
  if (href.startsWith('#') || href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return href;
  }

  // GitHub reads a link that starts with / from the repo root, so it is a repo path like any other
  const hashAt = href.indexOf('#');
  const target = (hashAt === -1 ? href : href.slice(0, hashAt)).replace(/^\.?\//, '');
  const fragment = hashAt === -1 ? '' : href.slice(hashAt);

  const page = SITE_PAGES.get(target);
  if (page !== undefined) {
    return `${options.root}${page}${fragment}`;
  }
  return `${REPO_URL}/blob/${options.commit}/${target}${fragment}`;
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
  return `${REPO_URL}/raw/${options.commit}/${src.replace(/^\.?\//, '')}`;
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
export type SiteSection = 'c' | 'ts' | 'coverage-c' | 'coverage-ts' | null;

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
