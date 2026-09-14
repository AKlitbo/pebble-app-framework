// turns a licence file into a Doxygen page
// Doxygen runs this as an input filter, passes it the file path, and reads the page from what it prints
// every licence gets a level one heading, which Doxygen uses as the page title
// licence text goes inside @verbatim, so it reads exactly as written and keeps its own spacing
// the License page lists the full texts as subpages, which nests them under it in the sidebar
// a file this does not know about passes through untouched
const fs = require('node:fs');
const path = require('node:path');

const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// the page Doxygen names each licence text after, based on its path with / as _2 and . as _8
const AGPL_PAGE = 'md_LICENSES_2AGPL-3_80-or-later';
const POLYFORM_PAGE = 'md_LICENSES_2PolyForm-Noncommercial-1_80_80';

// the title each licence shows as, whether its text is shown as written, and its subpages
const PAGES = {
  'LICENSE': { title: 'License', verbatim: false, subpages: [AGPL_PAGE, POLYFORM_PAGE] },
  'AGPL-3.0-or-later.txt': { title: 'GNU Affero General Public License v3.0 or later', verbatim: true, subpages: [] },
  'PolyForm-Noncommercial-1.0.0.txt': { title: 'PolyForm Noncommercial License 1.0.0', verbatim: true, subpages: [] },
};

const page = PAGES[path.basename(file)];
if (!page) {
  process.stdout.write(text);
  process.exit(0);
}

let body = page.verbatim
  ? `@verbatim\n${text.replace(/\n+$/, '')}\n@endverbatim\n`
  : text;

if (page.subpages.length) {
  const list = page.subpages
    .map((name) => `- @subpage ${name}`)
    .join('\n');

  body = `${body.replace(/\n+$/, '')}\n\n## Full Texts\n\n${list}\n`;
}

process.stdout.write(`# ${page.title}\n\n${body}`);