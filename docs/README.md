# Pebble Watchface Engine - Docs

Everything that builds the engine's docs site, with a package of its own so a repo of faces never installs those tools.

The site is the C docs from Doxygen, the TypeScript docs from TypeDoc, a coverage report for each test suite, and a home page built from the README, the changelog, the notices, and the licences. Main publishes it to [GitHub Pages](https://aklitbo.github.io/pebble-watchface-engine/).

## Layout

* **`doxygen/`**: the Doxygen theme in `pebble.css`, the header template, the main page, the logo and favicon, and the copied-in doxygen-awesome files under `awesome/`.
* **`typedoc/`**: the look laid over TypeDoc's default theme.
* **`site/`**: the site's own parts. `templates/` holds the home page, the shell every other page uses, the footer, the shared bar, and the theme toggle. `site.css`, `site-bar.css` and `coverage.css` are the stylesheets, and `theme.js` is the light and dark switch every page loads.
* **`tools/`**: `render.ts` turns the repo's markdown into html and `build-site.ts` writes the pages, then puts the shared bar on every page the other tools wrote.
* **`site/dist/`**: the built site, which git ignores.

The package here holds TypeDoc, marked and Prettier, alongside `tsconfig.json`, `vitest.config.ts`, `eslint.config.ts` and the two Prettier files. The engine's own `package.json` carries none of them, so a repo of faces mounting the engine installs nothing from this folder.

## Building It

Run these from the repo root in this order, since the home page reads both coverage reports. Doxygen, `make` and gcovr need WSL or Linux.

```sh
npm ci --prefix docs
doxygen
npm --prefix docs run ts
npx vitest run --config config/vitest.config.ts --coverage --coverage.reportsDirectory=docs/site/dist/coverage/ts
make -C c/spec coverage
npm --prefix docs run site
```

Open the result through a local server rather than as a `file://` path, so the relative links and TypeDoc's search both work.

CI does the same through the `build-docs-site` action, which runs after `build-doxygen` and installs this package itself.

## Checks

```sh
npm --prefix docs run test          # the renderer specs
npm --prefix docs run lint          # site/theme.js, which the engine's own lint leaves out
npm --prefix docs run typecheck
npm --prefix docs run format:check  # or format to fix the templates, stylesheets and theme script
```

The engine's own Vitest run and typecheck skip this folder, since what is here needs the packages installed above.

## The Shared Bar

Every page on the site carries the same bar across the top, with the logo linking home, a link to each part of the site, a GitHub link and the one theme toggle. The home page and the pages built from `templates/` carry it from the template. `build-site.ts` puts it into each page Doxygen, TypeDoc and the two coverage reports write, and swaps the one already there on a rebuild, so a page never ends up with two.
