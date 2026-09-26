# Third-Party Notices

The framework is dual-licensed under the AGPL-3.0-or-later or the PolyForm Noncommercial License 1.0.0, see [LICENSE](LICENSE). It bundles the third-party work below, which keeps its own licence.

## ical.js

The phone-side calendar reader in the shared PebbleKit JS bundle, so it ships in every `.pbw` built on this framework.

- **Source:** <https://github.com/kewisch/ical.js>
- **Licence:** Mozilla Public License 2.0, published at <https://www.mozilla.org/en-US/MPL/2.0/>. The full text also ships in the package at `node_modules/ical.js/LICENSE`
- **What Ships:** the package's own prebuilt `dist/ical.es5.min.cjs`, copied in unchanged by the pkjs build. It is not modified, patched or re-bundled, so the source that produced it is the upstream repository above, and its licence header travels inside the bundle

The MPL covers ical.js and nothing else here. Section 1.10 of that licence says a file carrying none of its code is not a modification of it, so the rest of the framework stays under its own terms. Keeping ical.js in a file of its own is deliberate, and is what section 1.7 asks of a larger work. The MPL 2.0 is also compatible with the AGPL through its secondary licence provision.

Refer to the source above for the full terms.

## doxygen-awesome-css

The theme the framework's Doxygen HTML is built with. It only reaches the generated docs, never a `.pbw`.

- **Source:** <https://github.com/jothepro/doxygen-awesome-css>, release `v2.5.0`
- **Licence:** MIT. The full text sits beside the files at [docs/doxygen/awesome/LICENSE](docs/doxygen/awesome/LICENSE)
- **What Ships:** `doxygen-awesome.css`, copied in unchanged. The framework's own look sits on top of it in `docs/doxygen/pebble.css`, so moving to a newer release means copying that one file over again

## Octicons

The GitHub mark on the docs site's shared bar, beside the link to this repository. It only reaches the generated docs, never a `.pbw`.

- **Source:** <https://github.com/primer/octicons>, the `mark-github-16` icon from release `v19.36.0`
- **Licence:** MIT. The full text sits at [docs/site/octicons/LICENSE](docs/site/octicons/LICENSE)
- **What Ships:** the icon's single SVG path, copied in unchanged to `docs/site/templates/site-bar.html`

The mark itself is a GitHub trademark. The site uses it only to link to this repository on GitHub.
