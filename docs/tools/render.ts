/**
 * Renders the pages of the docs site that come from files in the repo.
 *
 * The home page carries the README, and the changelog, the notices, and the licences each get a page of
 * their own. Everything here takes what it needs as arguments and hands back a string, so build-site.ts is
 * the only part that reads the disk, git, or the clock.
 */
import { Marked, type Token } from 'marked';

/** Where the engine lives on GitHub. A link to a repo file with no page on the site opens it here. */
export const REPO_URL = 'https://github.com/AKlitbo/pebble-watchface-engine';

// the repo files that have a page of their own on the site, by their path from the repo root
const SITE_PAGES = new Map<string, string>([
  ['LICENSE', 'licences/'],
  ['LICENSES/AGPL-3.0-or-later.txt', 'licences/agpl-3.0-or-later/'],
  ['LICENSES/PolyForm-Noncommercial-1.0.0.txt', 'licences/polyform-noncommercial-1.0.0/'],
  ['NOTICES.md', 'notices/'],
  ['CHANGELOG.md', 'changelog/'],
]);

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// the number of pixels in a coverage strip
const STRIP_PIXELS = 10;

/** One level two heading, the way the section list beside the README shows it. */
export interface Section {
  id: string;
  title: string;
}

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
 * Turns a heading into the id its anchor uses. `Using It` becomes `using-it`.
 *
 * @param text The heading as written.
 * @return Lowercase letters, digits, and single hyphens, or `section` when nothing is left.
 */
export function slug(text: string): string {
  const result = text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');

  return result || 'section';
}

/**
 * Points a link from one of the repo's markdown files at the right place on the site.
 *
 * The markdown links files by their path in the repo, which is a 404 once it is a page on GitHub Pages. A
 * file with a page of its own goes to that page. Any other repo file goes to GitHub at the commit the site
 * was built from. Full URLs and anchors already work, so they are left alone.
 *
 * @param href The link as written in the markdown.
 * @param options Where the page sits and which commit it was built from.
 * @return The link to put in the html.
 */
export function rewriteLink(href: string, options: LinkOptions): string {
  if (href.startsWith('#') || href.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return href;
  }

  const hashAt = href.indexOf('#');
  const target = (hashAt === -1 ? href : href.slice(0, hashAt)).replace(/^\.\//, '');
  const fragment = hashAt === -1 ? '' : href.slice(hashAt);

  const page = SITE_PAGES.get(target);
  if (page !== undefined) {
    return `${options.root}${page}${fragment}`;
  }
  return `${REPO_URL}/blob/${options.commit}/${target}${fragment}`;
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
 * The site shows that title in its own header, so leaving it in the body would print it twice.
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
  return { title: first.text, body: joinRaw(tokens, index + 1) };
}

/**
 * Takes the opening paragraph off a markdown body.
 *
 * The README's first paragraph is the home page's tagline, so it comes out of the body shown below.
 *
 * @param markdown The body, usually what splitTitle left.
 * @return The paragraph as markdown, and the rest. When the body does not open on a paragraph, the intro is
 * empty and nothing is taken.
 */
export function takeIntro(markdown: string): { intro: string; rest: string } {
  const tokens = new Marked().lexer(markdown);
  const index = firstContent(tokens, 0);
  const first = tokens[index];

  if (first === undefined || first.type !== 'paragraph') {
    return { intro: '', rest: markdown };
  }
  return { intro: first.text, rest: joinRaw(tokens, index + 1) };
}

/** Dims a trailing `# comment` on one already escaped line of a shell block. */
function markShellComment(line: string): string {
  return line.replace(/(^|\s)(#.*)$/, '$1<span class="cmt">$2</span>');
}

/**
 * Builds a markdown reader that rewrites links, gives each heading an id, and records the level two
 * headings as it goes. Each page gets a fresh one, so ids from one page never bump the count on another.
 */
function createMarked(options: LinkOptions, sections: Section[]): Marked {
  const seen = new Map<string, number>();

  return new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        const base = slug(text);
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        const id = count === 1 ? base : `${base}-${count}`;

        if (depth === 2) {
          sections.push({ id, title: text });
        }
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a href="${escapeHtml(rewriteLink(href, options))}"${titleAttribute}>${this.parser.parseInline(tokens)}</a>`;
      },
      code({ text, lang }) {
        const lines = escapeHtml(text).split('\n');
        const body = lang === 'sh' ? lines.map(markShellComment).join('\n') : lines.join('\n');
        const language = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        return `<pre><code${language}>${body}</code></pre>\n`;
      },
    },
  });
}

/**
 * Renders a markdown body to html for the site.
 *
 * @param markdown The markdown to render.
 * @param options Where the page sits and which commit it was built from, for the links.
 * @return The html, and the level two headings in order for the section list.
 */
export function renderMarkdown(markdown: string, options: LinkOptions): { html: string; sections: Section[] } {
  const sections: Section[] = [];

  const html = createMarked(options, sections).parse(markdown, { async: false });

  return { html, sections };
}

/**
 * Renders a single line of markdown with no paragraph around it, such as the tagline.
 *
 * @param markdown The line to render.
 * @param options Where the page sits and which commit it was built from, for the links.
 * @return The html.
 */
export function renderInline(markdown: string, options: LinkOptions): string {
  return createMarked(options, []).parseInline(markdown, { async: false });
}

/**
 * Builds the section list that sits beside the README.
 *
 * @param sections The level two headings, from renderMarkdown.
 * @return One link per section, each on its own line.
 */
export function sectionList(sections: Section[]): string {
  return sections.map((section) => `<a href="#${section.id}">${escapeHtml(section.title)}</a>`).join('\n');
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
  const figure = `${percent.toFixed(1)}% of lines`;
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

  return section === null ? bar : bar.replace(`data-section="${section}"`, `data-section="${section}" aria-current="page"`);
}

/**
 * Points the links in a coverage page at folders that have had the dot taken off their names.
 *
 * Vitest lays its report out like the source tree, so the engine's action scripts land under
 * coverage/ts/.github/. GitHub Pages leaves out every .github folder when it packs the site, and each of
 * those pages 404s. build-site.ts renames the folder without its dot, and this moves the links to match.
 *
 * @param html A page of the coverage report.
 * @param folders The names the dot came off, such as `.github`.
 * @return The page with every link into one of those folders pointed at the name without the dot.
 */
export function undotLinks(html: string, folders: string[]): string {
  return folders.reduce((page, folder) => {
    const escaped = folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return page.replace(new RegExp(`href="((?:\\.\\./)*)${escaped}/`, 'g'), `href="$1${folder.slice(1)}/`);
  }, html);
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

// a bar already on the page, from the nav tag through to its close
const EXISTING_BAR = /<nav class="site-bar"[\s\S]*?<\/nav>\n?/;

/**
 * Puts the shared bar and the tags it needs into a page another tool wrote.
 *
 * A page that already has a bar gets that bar swapped for the new one and nothing else, so building the
 * site pages again over the same output never gives a page two bars or two sets of head tags, and a
 * change to the bar still reaches it. A page missing the spot its kind expects is refused, so a tool
 * update that changes its markup stops the build rather than publishing pages with no way home.
 *
 * @param html The page as the tool wrote it, or as an earlier build left it.
 * @param kind Which tool wrote it.
 * @param head The tags to add at the end of the head, such as the bar's stylesheet.
 * @param bar The filled bar.
 * @return The page with the bar in.
 */
export function addSiteBar(html: string, kind: GeneratedPage, head: string, bar: string): string {
  if (EXISTING_BAR.test(html)) {
    return html.replace(EXISTING_BAR, () => `${bar}\n`);
  }

  const headEnd = html.indexOf('</head>');
  const spot = BAR_SPOTS[kind].pattern.exec(html);
  if (headEnd === -1 || spot === null) {
    throw new Error(`A ${kind} page has no ${headEnd === -1 ? '</head>' : String(BAR_SPOTS[kind].pattern)} to put the site bar at.`);
  }

  const barAt = BAR_SPOTS[kind].before ? spot.index : spot.index + spot[0].length;
  return html.slice(0, headEnd) + head + html.slice(headEnd, barAt) + bar + html.slice(barAt);
}
