/**
 * Specs for the docs site renderer.
 *
 * Nobody reads the html this writes before it goes up, so a mistake here shows as a broken page on GitHub
 * Pages. The parts worth pinning are the ones that still produce a page that loads: a title printed twice,
 * a link or an image that 404s, an anchor that misses its heading, a coverage strip drawn from a bad
 * summary, a placeholder left in the page, and a rebuild that changes a page it should leave alone.
 */
import { describe, expect, test } from 'vitest';
import {
  addSiteBar,
  fillTemplate,
  pixelStrip,
  readGcovrSummary,
  readVitestSummary,
  renderMarkdown,
  renderSiteBar,
  rewriteImage,
  rewriteLink,
  rootFor,
  slug,
  splitTitle,
} from './render.ts';

const HOME = { root: '', commit: 'abc1234' };

describe('splitTitle', () => {
  /** A title left in the body would print the project name a second time under the site header. */
  test('takes the level one heading off the top', () => {
    const markdown = '# Pebble App Framework\n\nThe shared framework.\n\n## Layout\n\nThe tree.\n';

    const result = splitTitle(markdown);

    expect(result.title).toBe('Pebble App Framework');
    expect(result.body.trim()).toBe('The shared framework.\n\n## Layout\n\nThe tree.');
  });

  /** The title is escaped into the page title and heading, so its raw markdown showed backticks in the browser tab. */
  test('gives the title as plain text', () => {
    const markdown = '# The `lib` [Notices](x.md)\n\nBody.\n';

    const result = splitTitle(markdown);

    expect(result.title).toBe('The lib Notices');
  });

  /** A file that opens on a section keeps it, so a changelog missing its title still shows in full. */
  test('leaves a file with no title whole', () => {
    const markdown = '## Layout\n\nThe tree.\n';

    const result = splitTitle(markdown);

    expect(result).toEqual({ title: '', body: markdown });
  });
});

describe('slug', () => {
  /** GitHub keeps one hyphen per space, so a link written for GitHub to a dated changelog heading missed here. */
  test.each([
    ['[2.2.0] - 2026-09-23', '220---2026-09-23'],
    ['A & B', 'a--b'],
    ['Using It', 'using-it'],
    ['snake_case name', 'snake_case-name'],
  ])('makes %s the id GitHub gives it', (heading, expected) => {
    const result = slug(heading);

    expect(result).toBe(expected);
  });
});

describe('rewriteImage', () => {
  /** The site has no copy of the repo's files, so an image by its repo path was a 404. */
  test('loads a repo image from GitHub at the commit', () => {
    const result = rewriteImage('./docs/diagram.png', HOME);

    expect(result).toBe('https://github.com/AKlitbo/pebble-app-framework/raw/abc1234/docs/diagram.png');
  });

  /** GitHub reads a leading slash from the repo root, and on Pages it pointed outside the site. */
  test('reads a leading slash as the repo root', () => {
    const result = rewriteImage('/docs/diagram.png', HOME);

    expect(result).toBe('https://github.com/AKlitbo/pebble-app-framework/raw/abc1234/docs/diagram.png');
  });

  /** An image that already has a full address loads as it is. */
  test('leaves a full URL alone', () => {
    const result = rewriteImage('https://example.com/a.png', HOME);

    expect(result).toBe('https://example.com/a.png');
  });
});

describe('rewriteLink', () => {
  /** The README links the licence texts by repo path, which is a 404 on Pages. */
  test('sends a licence text to its site page', () => {
    const result = rewriteLink('LICENSES/AGPL-3.0-or-later.txt', HOME);

    expect(result).toBe('licences/agpl-3.0-or-later/');
  });

  /** Without the climb back up, a link on a licence page would land inside the licence folder. */
  test('climbs back to the root from a page further down', () => {
    const result = rewriteLink('NOTICES.md', { root: '../../', commit: 'abc1234' });

    expect(result).toBe('../../notices/');
  });

  /** A repo file with no page of its own still has to open something real. */
  test('sends any other repo path to GitHub at the commit', () => {
    const result = rewriteLink('./docs/doxygen/awesome/LICENSE', HOME);

    expect(result).toBe('https://github.com/AKlitbo/pebble-app-framework/blob/abc1234/docs/doxygen/awesome/LICENSE');
  });

  /** GitHub reads a link that starts with a slash from the repo root, and on Pages it pointed outside the site. */
  test('reads a leading slash as the repo root', () => {
    const result = rewriteLink('/c/core/clock/timeband.h', HOME);

    expect(result).toBe('https://github.com/AKlitbo/pebble-app-framework/blob/abc1234/c/core/clock/timeband.h');
  });

  /** Rewriting a full URL or an anchor would break a link that already works. */
  test.each([
    'https://aklitbo.github.io/pebble-app-framework/',
    '#using-it',
    'mailto:someone@example.com',
  ])('leaves %s alone', (href) => {
    const result = rewriteLink(href, HOME);

    expect(result).toBe(href);
  });
});

describe('renderMarkdown', () => {
  /** The changelog repeats Fixed under every version, and GitHub numbers the repeats from 1, so a link written there lands here. */
  test('gives repeated headings their own ids', () => {
    const markdown = '## 1.1.0\n\n### Fixed\n\n## 1.0.0\n\n### Fixed\n';

    const result = renderMarkdown(markdown, HOME);

    expect(result).toContain('<h3 id="fixed">Fixed</h3>');
    expect(result).toContain('<h3 id="fixed-1">Fixed</h3>');
  });

  /** A heading titled Fixed 1 takes fixed-1 as its own, so a later repeat of Fixed has to skip past it. */
  test('skips an id a heading already took as its own', () => {
    const markdown = '### Fixed\n\n### Fixed 1\n\n### Fixed\n';

    const result = renderMarkdown(markdown, HOME);

    expect(result).toContain('<h3 id="fixed-1">Fixed 1</h3>');
    expect(result).toContain('<h3 id="fixed-2">Fixed</h3>');
  });

  /** A rendered link must never point at a repo path the site does not have. */
  test('rewrites the links it renders', () => {
    const markdown = 'See [LICENSE](LICENSE).';

    const result = renderMarkdown(markdown, HOME);

    expect(result).toContain('<a href="licences/">LICENSE</a>');
  });

  /** The README has no page on the site, so a link to it goes to GitHub where it is read. */
  test('sends a link to the README to GitHub', () => {
    const markdown = 'See the [README](README.md#using-it).';

    const result = renderMarkdown(markdown, HOME);

    expect(result).toContain('<a href="https://github.com/AKlitbo/pebble-app-framework/blob/abc1234/README.md#using-it">README</a>');
  });

  /** An image by its repo path was a 404 on the published page. */
  test('points an image at the file on GitHub', () => {
    const markdown = '![a diagram](docs/x.png)';

    const result = renderMarkdown(markdown, HOME);

    expect(result).toContain('<img src="https://github.com/AKlitbo/pebble-app-framework/raw/abc1234/docs/x.png" alt="a diagram">');
  });

  /** A fence with more than its language in the info string lost its language class and its comment dimming. */
  test('reads only the first word of a fence info string as its language', () => {
    const markdown = '```sh title\nnpm test\n```\n';

    const result = renderMarkdown(markdown, HOME);

    expect(result).toContain('<code class="language-sh">npm test</code>');
  });

  /** A heading with inline code got an id from its raw markdown, so a link to it missed. */
  test('makes a heading id from its plain text', () => {
    const markdown = '## Using `clay-preview.ts`\n';

    const result = renderMarkdown(markdown, HOME);

    expect(result).toContain('<h2 id="using-clay-previewts">');
  });
});

describe('readVitestSummary', () => {
  /** The strip has to show the whole suite, not whichever file happens to come first in the summary. */
  test('reads the total line percentage', () => {
    const json = { 'total': { lines: { pct: 77.14 } }, 'ts/pkjs/app.ts': { lines: { pct: 12.5 } } };

    const result = readVitestSummary(json);

    expect(result).toBe(77.14);
  });

  /** Vitest writes "Unknown" when it measured nothing, which would otherwise draw a strip from NaN. */
  test.each([
    null,
    {},
    { total: { lines: { pct: 'Unknown' } } },
    { total: { lines: { pct: 140 } } },
  ])('returns null for %j', (json) => {
    const result = readVitestSummary(json);

    expect(result).toBeNull();
  });
});

describe('readGcovrSummary', () => {
  /** gcovr keeps the total at the top level, so reading a file entry would show one file as the suite. */
  test('reads the top level line percentage', () => {
    const json = { line_percent: 88.5, files: [{ filename: 'c/core/clock/astro.c', line_percent: 100 }] };

    const result = readGcovrSummary(json);

    expect(result).toBe(88.5);
  });

  /** A summary missing its figure shows no strip rather than breaking the build. */
  test.each([null, {}, { line_percent: '88.5' }])('returns null for %j', (json) => {
    const result = readGcovrSummary(json);

    expect(result).toBeNull();
  });
});

describe('pixelStrip', () => {
  /** Rounding up would draw a full strip for a suite that still misses lines. */
  test.each([
    [64.5, 6],
    [99.9, 9],
    [100, 10],
    [0, 0],
  ])('lights %d percent as %d of ten pixels', (percent, lit) => {
    const result = pixelStrip(percent);

    expect(result.match(/<i><\/i>/g) ?? []).toHaveLength(lit);
    expect(result.match(/<i class="off"><\/i>/g) ?? []).toHaveLength(10 - lit);
  });

  /** The figure rounded to the nearest tenth read 100.0% beside a strip with one pixel dark. */
  test('rounds the figure down the way the pixels are', () => {
    const result = pixelStrip(99.96);

    expect(result).toContain('title="99.9% of lines"');
  });

  /** With no summary the card shows no strip, rather than one that reads as nothing covered. */
  test('draws nothing without a figure', () => {
    const result = pixelStrip(null);

    expect(result).toBe('');
  });
});

describe('fillTemplate', () => {
  /** A placeholder with no value would ship a raw {{commit}} onto the published page. */
  test('refuses a placeholder with no value', () => {
    const template = '<p>{{version}} @ {{commit}}</p>';

    const result = () => fillTemplate(template, { version: '1.1.0' });

    expect(result).toThrow('{{commit}}');
  });

  /** A value nothing uses means the template and the build script disagree about a name. */
  test('refuses a value no placeholder uses', () => {
    const template = '<p>{{version}}</p>';

    const result = () => fillTemplate(template, { version: '1.1.0', comit: 'abc1234' });

    expect(result).toThrow('{{comit}}');
  });

  /** A README code sample that shows {{ must stay as written, not be read as another placeholder. */
  test('never reads a value for placeholders', () => {
    const template = '<main>{{body}}</main>';

    const result = fillTemplate(template, { body: '<code>{{name}}</code>' });

    expect(result).toBe('<main><code>{{name}}</code></main>');
  });
});

describe('rootFor', () => {
  /** A bar link one folder short of the root would send a deep TypeDoc page to a folder that does not exist. */
  test.each([
    ['index.html', ''],
    ['c/appmessage_8h.html', '../'],
    ['coverage/ts/ts/pkjs/app.ts.html', '../../../../'],
  ])('climbs from %s with %j', (page, root) => {
    const result = rootFor(page);

    expect(result).toBe(root);
  });
});

describe('renderSiteBar', () => {
  const TEMPLATE = '<nav class="site-bar"><a class="site-bar-home" href="{{root}}index.html">Pebble App Framework</a><select class="site-bar-version" data-root="{{root}}"><option value="{{version}}">{{version}}</option></select><a data-section="c" href="{{root}}c/index.html">Device API</a><a data-section="coverage-c" href="{{root}}coverage/c/index.html">C Coverage</a><a href="{{repoUrl}}">GitHub</a>{{themeToggle}}</nav>';
  const BUILD = { themeToggle: '<button></button>', version: 'main' };

  /** The bar is the only thing that tells a reader which part of the site they are in. */
  test('marks the section the page is in', () => {
    const result = renderSiteBar(TEMPLATE, { ...BUILD, root: '../../', section: 'coverage-c' });

    expect(result).toContain('<a data-section="coverage-c" aria-current="location" href="../../coverage/c/index.html">');
    expect(result.match(/aria-current/g)).toHaveLength(1);
  });

  /** A changelog or licence page belongs to no section, so nothing in the bar may look selected there. */
  test('marks nothing for a page outside the sections', () => {
    const result = renderSiteBar(TEMPLATE, { ...BUILD, root: '../', section: null });

    expect(result).not.toContain('aria-current');
  });

  /** A PR's uploaded copy of the site has to keep its readers inside that copy, so only GitHub leaves it. */
  test('keeps every link but GitHub relative to the page', () => {
    const result = renderSiteBar(TEMPLATE, { ...BUILD, root: '../../', section: 'c' });

    expect(result).toContain('<a class="site-bar-home" href="../../index.html">Pebble App Framework</a>');
    expect(result).toContain('<a href="https://github.com/AKlitbo/pebble-app-framework">GitHub</a>');
  });
});

describe('addSiteBar', () => {
  const BAR = '<nav class="site-bar"></nav>';
  const HEAD = '<link rel="stylesheet" href="../site-bar.css">';
  // what the head tags and the bar go in as
  const HEAD_TAGS = `<!-- site-bar head -->\n${HEAD}\n<!-- /site-bar head -->\n`;
  const BAR_LINE = `${BAR}\n`;

  /** Outside #top, Doxygen sizes its sidebar without the bar and the sidebar runs past the bottom of the window. */
  test('puts the bar inside the top of a Doxygen page', () => {
    const html = '<html><head><title>x</title></head><body>\n<div id="top"><!-- do not remove this div -->\n<div id="titlearea">';

    const result = addSiteBar(html, 'doxygen', HEAD, BAR);

    expect(result).toBe(`<html><head><title>x</title>${HEAD_TAGS}</head><body>\n<div id="top"><!-- do not remove this div -->\n${BAR_LINE}<div id="titlearea">`);
  });

  /** Below TypeDoc's toolbar, the bar would be hidden under it as soon as the page scrolls. */
  test('puts the bar just above the TypeDoc toolbar', () => {
    const html = '<html><head></head><body><script>theme()</script><header class="tsd-page-toolbar">';

    const result = addSiteBar(html, 'typedoc', HEAD, BAR);

    expect(result).toBe(`<html><head>${HEAD_TAGS}</head><body><script>theme()</script>${BAR_LINE}<header class="tsd-page-toolbar">`);
  });

  /** Building the site pages again would otherwise stack a second bar and a second set of head tags on every page. */
  test('swaps the bar on a page that already has one and adds nothing else', () => {
    const html = `<html><head>${HEAD_TAGS}</head><body>\n<nav class="site-bar"><a>Old</a></nav>\n<div class="wrapper">`;

    const result = addSiteBar(html, 'report', HEAD, BAR);

    expect(result).toBe(`<html><head>${HEAD_TAGS}</head><body>\n${BAR_LINE}<div class="wrapper">`);
  });

  /**
   * The bar ends on a line break, and each rebuild put one more under it. Every page then changed on every
   * run, so all of them were written again and the count of pages given a bar was wrong.
   */
  test('leaves a page as it is when it is built again with the same bar', () => {
    const once = addSiteBar('<html><head></head><body>\n<div class="wrapper">', 'report', HEAD, `${BAR}\n`);

    const result = addSiteBar(once, 'report', HEAD, `${BAR}\n`);

    expect(result).toBe(once);
  });

  /** A change to the head tags never reached a page built over again, so it came out without the new stylesheet. */
  test('swaps the head tags on a page that already has a bar', () => {
    const once = addSiteBar('<html><head></head><body>\n<div class="wrapper">', 'report', HEAD, BAR);
    const newHead = '<link rel="stylesheet" href="../coverage.css">';

    const result = addSiteBar(once, 'report', newHead, BAR);

    expect(result).toContain(`<!-- site-bar head -->\n${newHead}\n<!-- /site-bar head -->\n</head>`);
    expect(result).not.toContain('site-bar.css');
  });

  /** A tool update that moves its markup has to stop the build, not publish pages with no way home. */
  test('refuses a page without the spot its kind expects', () => {
    const html = '<html><head></head><body><div class="tsd-page">';

    const result = () => addSiteBar(html, 'typedoc', HEAD, BAR);

    expect(result).toThrow('tsd-page-toolbar');
  });
});
