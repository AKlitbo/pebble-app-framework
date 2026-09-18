/**
 * Specs for the docs site renderer.
 *
 * Nobody reads the html this writes before it goes up, so a mistake here shows as a broken page on GitHub
 * Pages. The parts worth pinning are the ones that still produce a page that loads: the README losing a
 * section or showing its tagline twice, a link that 404s, a coverage strip drawn from a bad summary, and a
 * placeholder left in the page.
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
  rewriteLink,
  rootFor,
  splitTitle,
  takeIntro,
  undotLinks,
} from './render.ts';

const HOME = { root: '', commit: 'abc1234' };

describe('splitTitle', () => {
  /** A title left in the body would print the project name a second time under the site header. */
  test('takes the level one heading off the top', () => {
    const markdown = '# Pebble Watchface Engine\n\nThe shared engine.\n\n## Layout\n\nThe tree.\n';

    const result = splitTitle(markdown);

    expect(result.title).toBe('Pebble Watchface Engine');
    expect(result.body.trim()).toBe('The shared engine.\n\n## Layout\n\nThe tree.');
  });

  /** A file that opens on a section keeps it, so a changelog missing its title still shows in full. */
  test('leaves a file with no title whole', () => {
    const markdown = '## Layout\n\nThe tree.\n';

    const result = splitTitle(markdown);

    expect(result).toEqual({ title: '', body: markdown });
  });
});

describe('takeIntro', () => {
  /** The intro is the header tagline, so leaving it in the body would print it twice on the home page. */
  test('takes the first paragraph as the intro', () => {
    const markdown = '\nThe shared engine.\n\n## Layout\n\nThe tree.\n';

    const result = takeIntro(markdown);

    expect(result.intro).toBe('The shared engine.');
    expect(result.rest.trim()).toBe('## Layout\n\nThe tree.');
  });

  /** A README that goes straight into a section would otherwise lose that section to the tagline. */
  test('keeps the body whole when it opens on a heading', () => {
    const markdown = '## Layout\n\nThe tree.\n';

    const result = takeIntro(markdown);

    expect(result).toEqual({ intro: '', rest: markdown });
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

    expect(result).toBe('https://github.com/AKlitbo/pebble-watchface-engine/blob/abc1234/docs/doxygen/awesome/LICENSE');
  });

  /** Rewriting a full URL or an anchor would break a link that already works. */
  test.each([
    'https://aklitbo.github.io/pebble-watchface-engine/',
    '#using-it',
    'mailto:someone@example.com',
  ])('leaves %s alone', (href) => {
    const result = rewriteLink(href, HOME);

    expect(result).toBe(href);
  });
});

describe('renderMarkdown', () => {
  /** The changelog repeats Fixed under every version, so without a count each link jumps to the first one. */
  test('gives repeated headings their own ids', () => {
    const markdown = '## 1.1.0\n\n### Fixed\n\n## 1.0.0\n\n### Fixed\n';

    const result = renderMarkdown(markdown, HOME);

    expect(result.html).toContain('<h3 id="fixed">Fixed</h3>');
    expect(result.html).toContain('<h3 id="fixed-2">Fixed</h3>');
  });

  /** The section list beside the README follows its sections, not every heading inside them. */
  test('lists only level two headings as sections', () => {
    const markdown = '## Layout\n\n### Engine Code\n\n## Using It\n';

    const result = renderMarkdown(markdown, HOME);

    expect(result.sections).toEqual([
      { id: 'layout', title: 'Layout' },
      { id: 'using-it', title: 'Using It' },
    ]);
  });

  /** A link in the rendered README must never point at a repo path the site does not have. */
  test('rewrites the links it renders', () => {
    const markdown = 'See [LICENSE](LICENSE).';

    const result = renderMarkdown(markdown, HOME);

    expect(result.html).toContain('<a href="licences/">LICENSE</a>');
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
  const TEMPLATE = '<nav class="site-bar"><a class="site-bar-home" href="{{root}}index.html">Pebble Watchface Engine</a><select class="site-bar-version" data-root="{{root}}"><option value="{{version}}">{{version}}</option></select><a data-section="c" href="{{root}}c/index.html">Device API</a><a data-section="coverage-c" href="{{root}}coverage/c/index.html">C Coverage</a><a href="{{repoUrl}}">GitHub</a>{{themeToggle}}</nav>';
  const BUILD = { themeToggle: '<button></button>', version: 'main' };

  /** The bar is the only thing that tells a reader which part of the site they are in. */
  test('marks the section the page is in', () => {
    const result = renderSiteBar(TEMPLATE, { ...BUILD, root: '../../', section: 'coverage-c' });

    expect(result).toContain('<a data-section="coverage-c" aria-current="page" href="../../coverage/c/index.html">');
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

    expect(result).toContain('<a class="site-bar-home" href="../../index.html">Pebble Watchface Engine</a>');
    expect(result).toContain('<a href="https://github.com/AKlitbo/pebble-watchface-engine">GitHub</a>');
  });
});

describe('addSiteBar', () => {
  const BAR = '<nav class="site-bar"></nav>';
  const HEAD = '<link rel="stylesheet" href="../site-bar.css">';

  /** Outside #top, Doxygen sizes its sidebar without the bar and the sidebar runs past the bottom of the window. */
  test('puts the bar inside the top of a Doxygen page', () => {
    const html = '<html><head><title>x</title></head><body>\n<div id="top"><!-- do not remove this div -->\n<div id="titlearea">';

    const result = addSiteBar(html, 'doxygen', HEAD, BAR);

    expect(result).toBe(`<html><head><title>x</title>${HEAD}</head><body>\n<div id="top"><!-- do not remove this div -->\n${BAR}<div id="titlearea">`);
  });

  /** Below TypeDoc's toolbar, the bar would be hidden under it as soon as the page scrolls. */
  test('puts the bar just above the TypeDoc toolbar', () => {
    const html = '<html><head></head><body><script>theme()</script><header class="tsd-page-toolbar">';

    const result = addSiteBar(html, 'typedoc', HEAD, BAR);

    expect(result).toBe(`<html><head>${HEAD}</head><body><script>theme()</script>${BAR}<header class="tsd-page-toolbar">`);
  });

  /** Building the site pages again would otherwise stack a second bar and a second set of head tags on every page. */
  test('swaps the bar on a page that already has one and adds nothing else', () => {
    const html = `<html><head>${HEAD}</head><body>\n<nav class="site-bar"><a>Old</a></nav>\n<div class="wrapper">`;

    const result = addSiteBar(html, 'report', HEAD, BAR);

    expect(result).toBe(`<html><head>${HEAD}</head><body>\n${BAR}\n<div class="wrapper">`);
  });

  /** A tool update that moves its markup has to stop the build, not publish pages with no way home. */
  test('refuses a page without the spot its kind expects', () => {
    const html = '<html><head></head><body><div class="tsd-page">';

    const result = () => addSiteBar(html, 'typedoc', HEAD, BAR);

    expect(result).toThrow('tsd-page-toolbar');
  });
});

describe('undotLinks', () => {
  /** GitHub Pages drops the .github folder, so a link still naming it opens a 404 for every action script. */
  test('points a link into a renamed folder at the name without the dot', () => {
    const html = '<a href=".github/actions/build-docs-site/scripts/index.html">.github/actions</a>';

    const result = undotLinks(html, ['.github']);

    expect(result).toBe('<a href="github/actions/build-docs-site/scripts/index.html">.github/actions</a>');
  });

  /** A page deeper in the report reaches the folder through ../, and that link has to follow the rename too. */
  test('follows the rename through links that climb first', () => {
    const html = '<a href="../../.github/actions/index.html">x</a>';

    const result = undotLinks(html, ['.github']);

    expect(result).toBe('<a href="../../github/actions/index.html">x</a>');
  });

  /** Only the renamed folder moves, so a file whose name merely contains it keeps its link. */
  test('leaves links to anything else alone', () => {
    const html = '<a href="ts/pkjs/.github.ts.html">x</a><a href="base.css">y</a>';

    const result = undotLinks(html, ['.github']);

    expect(result).toBe(html);
  });
});
