# Third-Party Notices

What ships with the framework, and so can reach a `.pbw` built on it, is listed in [src/NOTICES.md](src/NOTICES.md#icaljs). The third-party work below only reaches the generated docs, and keeps its own licence.

## doxygen-awesome-css

The theme the framework's Doxygen HTML is built with. It only reaches the generated docs, never a `.pbw`.

- **Source:** <https://github.com/jothepro/doxygen-awesome-css>, release `v2.5.0`
- **Licence:** MIT. The full text sits beside the files at [docs/doxygen/awesome/LICENSE](docs/doxygen/awesome/LICENSE)
- **What Ships:** `doxygen-awesome.css`, copied in unchanged. The framework's own look sits on top of it in `docs/doxygen/pebble.css`, so moving to a newer release means copying that one file over again

## Mermaid

The library that draws the diagrams on the docs site's pages. It only reaches the generated docs, never a `.pbw`.

- **Source:** <https://github.com/mermaid-js/mermaid>, release `v12.1.0`
- **Licence:** MIT
- **What Ships:** nothing is copied in. `docs/site/diagrams.js` loads it in the reader's browser from jsDelivr, pinned to that release

## Shiki

The highlighter that colours the code blocks on the docs site's markdown pages. It only reaches the generated docs, never a `.pbw`.

- **Source:** <https://github.com/shikijs/shiki>, release `v4.5.0`, with the grammars it bundles for each language the site loads
- **Licence:** MIT
- **What Ships:** nothing is copied in. The site build runs it, and the coloured html it writes is plain spans with no script

## Octicons

The GitHub mark on the docs site's shared bar, beside the link to this repository. It only reaches the generated docs, never a `.pbw`.

- **Source:** <https://github.com/primer/octicons>, the `mark-github-16` icon from release `v19.36.0`
- **Licence:** MIT. The full text sits at [docs/site/octicons/LICENSE](docs/site/octicons/LICENSE)
- **What Ships:** the icon's single SVG path, copied in unchanged to `docs/site/templates/site-bar.html`

The mark itself is a GitHub trademark. The site uses it only to link to this repository on GitHub.
