# Pebble App Framework

The shared framework behind my Pebble watchfaces and watchapps. It holds the device C, the PebbleKit JS runtime and Clay config pieces, the waf build helpers, and the generators and build tooling every face uses.

> [!NOTE]
> Built and tested with Pebble SDK 4.33.1 and pebble-tool 5.0.40, for emery and gabbro. The framework uses what that SDK offers, so something a newer PebbleOS adds, such as its extra vibe patterns, waits until an SDK ships it. A face built with another SDK may behave differently.

## Layout

**What Ships**

Everything a face gets lives under `src/`, and paf copies that folder into each face project's `paf/`, leaving out the specs, their fixtures, and any plugin the project does not list.

* **`src/c/`**: the device code. `core/` is pure and host-testable. `pebble/` needs the SDK.
* **`src/ts/`**: the PebbleKit JS runtime (weather, stocks, calendar, Clay), and `generated.d.ts`, which types every `*.g` module a generator writes. Its `testing/` folder holds helpers the framework's specs share, which a face's own specs can use too.
* **`src/tools/`**: the tools a face builds with: the Clay component generator, the pkjs build, the manifest build, and the check that a face's Clay components are current. `shared/` holds the helpers they and the plugins share, such as the face lookup and the framework's paths, which a face's own tools and configs can import too.
* **`src/waf/`**: the waf helpers that stage and build a face, and the wscript template each build target gets.
* **`src/plugins/`**: what a face opts into, each with its own `package.json` and dependencies. A plugin is mostly tools, but it can carry watch C too, which the build stages beside the framework's own.
* **`src/tools/build.ts`**: builds a face's `.pbw` from WSL with the Pebble SDK installed, which is what `paf build` runs.
* **`src/toolchain.json`**: the SDK, pebble-tool, and Node the framework is built with. paf and `setup-pebble` read it from a face project's `paf/`.
* **`src/tsconfig.json`**, **`src/tsconfig.pkjs.json`**, **`src/tsconfig.spec.json`**, and **`src/tsconfig.tools.json`**: the compiler options a face's TypeScript builds with, and the ones its own spec and tools tsconfigs extend.

**Plugins**

A face project lists the plugins it wants in its `paf.config.json`, and paf copies only those.

* **`frame`**: bakes a face's HTML frame into background PNGs, and carries `css/pebble-colors.css`, the Pebble-64 palette the frames link to. It needs Playwright and `sharp`.
* **`icons`**: turns the face's vendored SVG glyphs into its icon PNGs, and checks the appinfo media block is current. It needs `sharp`.
* **`thumbnails`**: inlines the panel PNGs as base64 so the Clay layout builder shows real panels, and checks the asset is current.
* **`code-style`**: the house ESLint style a unit is linted with by `paf lint`, and Prettier for its CSS, JSON, and YAML through `paf format`, which is off until the unit turns it on. It brings ESLint and Prettier with it.
* **`dev`**: the screenshot harness in `c/dev/`, the Clay settings preview in `clay-preview.ts`, and `tap-walk.ts`, which screenshots every state of a face's dev tap walk.

**Developing the Framework**

* **`tools/`**: `typecheck.ts`, `build-conditions.ts`, and `fresh-unit.ts` with the `paf-key.ts` it shares with a spec, which only ever run in this repo. `npm run check:fresh-unit` makes units with no lock, one with no plugin and one for each plugin, fills each from this checkout with `paf use local`, and checks that every package named is installed, every script a `paf` key names loads, and `paf check`, `paf typecheck`, `paf lint`, and `paf format` run. A package a new unit's install leaves out is caught here, where a unit that already has a lock would hide it. Every unit runs to the end, so one broken plugin does not hide the next. It needs this repo's own git checkout, paf installed, and the network.
* **`tests/c/spec/`**: the host C test harness. The specs themselves sit beside the code they cover.
* **`eslint.config.ts`**, **`vitest.config.ts`**, and the **`tsconfig.*.json`** files at the root: the framework's own lint, test, and typecheck setup. Its lint takes the house style from the `code-style` plugin. A face keeps its own test and typecheck setup. The root **`tsconfig.json`** holds no files and points an editor at those projects.
* **`.githooks/`**: the pre-commit hook that runs lint and typecheck.

**CI and Docs**

* **`.github/actions/`**: the GitHub Actions, each with its script and specs under `scripts/`. The framework's workflows run the verify actions, `build-doxygen`, `build-docs-site`, and `publish-docs-site`. The face repos' workflows run `setup-pebble`, `report-memory` and `render-memory` in CI, and `prepare-release`, `setup-pebble` and `publish-release` to release a face. A workflow loads them from this repo at a tag, such as `AKlitbo/pebble-app-framework/.github/actions/setup-pebble@v4.0.0`, and passes the face each one works on. Actions at a 4.x tag read a face project filled by paf 2.0.0, from its `paf/`.
* **`.github/shared/`**: the helpers and spec fakes the scripts in `.github/actions/` share.
* **`docs/`**: the docs site, with the Doxygen and TypeDoc settings, their themes, the page templates, and the tools that build it. The [`docs/` README](docs/README.md) covers it.

## Using It

The framework does not build on its own. paf 2.0.0 copies it into each face project at `paf/`, and the project lists `paf` and `paf/plugins/*` as npm workspaces so the framework's dependencies, and each listed plugin's, install once. That listing is also how the tools tell a mounted framework from one checked out on its own, so without it every generator and check stops and says to list them. A face project is a face on its own, with its `pebble.appinfo.json`, `src/`, and `resources/` at its root, or a family, with its `core/` and one folder per face. A face is any of those folders holding a `pebble.appinfo.json`, and a project's `config/` holds only the project's own tool configs, such as its tsconfigs and `vitest.config.ts`. A repo is one face project, or keeps several side by side under `watchfaces/`, with apps under `watchapps/` if it likes. The two folders only sort faces from apps, and a project in either is laid out the same.

[paf](https://github.com/AKlitbo/pebble-app-framework-cli) keeps each project on its own framework tag. A project's `paf.config.json` names the tag, the plugins it wants, and each plugin's settings. `paf pin` writes `framework` and `commit`, so a project starts with `paf pin` rather than a commit typed by hand:

```json
{
  "framework": "v4.0.0",
  "commit": "…",
  "plugins": {
    "icons": { "sources": "../../vendor" },
    "frame": {},
    "thumbnails": {}
  },
  "gen": {
    "palette": { "script": "core/tools/palette.ts", "after": "clay" }
  }
}
```

`gen` lists the project's own generators, each with its script, relative to the project, and the generator it runs after, so `paf gen <face> all` runs them in their place among the framework's and the plugins'.

paf finds the framework's tools through a `paf` key in the framework's `package.json` and in each plugin's, so a face project needs no scripts pointing into `paf/`. Each generator there names what a face has to hold for `paf gen <face> all` to run it, a file or a folder. For a path under `src/pkjs/`, a face in a family also counts its family core's matching folder under `core/pkjs/`, since the Clay generator reads both.

```sh
paf sync                     # fill paf/ and install
paf gen <face> all           # every generator the face has inputs for
paf gen <face> <kind>        # one of clay, icons, frame, or thumbnails
paf check                    # that each face's generated output is current
paf build <face>             # the .pbw, from WSL
paf tool <face> clay-preview # a plugin's tool, here the dev plugin's Clay preview
paf test
paf lint [--fix]             # the house style, from the code-style plugin
paf format [--check]         # Prettier over CSS, JSON, and YAML, once the project turns it on
paf typecheck
```

The `icons` plugin reads its SVG sources from `plugins.icons.sources` in `paf.config.json`, relative to the project, or from the `ICON_SOURCES` environment variable when it names none. Faces import the framework by relative path from `paf/`, and the build stages the framework's C and any listed plugin's C into `targets/<target>/`. Build output all lands in `targets/`, which the repo should ignore.

## Versions

Framework releases are git tags such as `v4.0.0`, and framework 4 needs paf 2.0.0. A face project moves with `paf pin <project> <tag>`, which shows the changelog between the two tags first. A face release reads the framework's version from `paf/package.json` and stops when it names none.

## Tests

Everything here runs on its own, with no faces needed:

```sh
make -C tests/c/spec  # the host C suite
npm ci
npm test              # providers, Clay pieces, build tools against fixtures/, and the action scripts
npm run lint
npm run typecheck
```

The docs site tools have a package of their own in `docs/`, with their own scripts, so a repo of faces never installs TypeDoc or marked, and gets Prettier only with the `code-style` plugin:

```sh
npm ci --prefix docs
npm --prefix docs run test
npm --prefix docs run lint            # the site's browser script, which the framework's own lint leaves out
npm --prefix docs run typecheck
npm --prefix docs run format:check    # or format to fix the templates, stylesheets, and theme script
```

The checks that each real face's generated Clay components, icon media, and thumbnails are up to date run in a face project, as `paf check`.

## Docs

Doxygen 1.18.0 builds the C docs from the doc comments in `src/c/` and the plugins, TypeDoc builds the TypeScript docs from the exported code in `src/ts/`, and both test suites write a coverage report. A small script then builds the home page, which links this README on GitHub, and a page each for the changelog, the notices, and the licences. An older Doxygen ignores settings the Doxyfile uses.

To build it locally, run these from the repo root in this order. Doxygen, `make`, and gcovr need WSL or Linux.

```sh
npm ci --prefix docs           # TypeDoc and marked, kept out of the framework's own install
doxygen docs/Doxyfile          # the C docs
npm --prefix docs run ts       # the TypeScript docs
npx vitest run --coverage --coverage.reportsDirectory=docs/site/dist/coverage/ts
make -C tests/c/spec coverage  # the C coverage report, which needs gcovr
npm --prefix docs run site     # the home page and the pages around it, last since it reads both coverage reports
```

The [`docs/` README](docs/README.md) covers that folder's layout, its own scripts, and how the shared bar reaches every page. The site lands in `docs/site/dist/`, which git ignores. CI fails a build with any Doxygen or TypeDoc warning. Main and each pushed release tag publish the site to [GitHub Pages](https://aklitbo.github.io/pebble-app-framework/), each into a folder of its own, and the site opens on the latest release.

## CI

* **`framework-ci.yml`**: runs the host C suite, Vitest, lint and typecheck on every PR and push to main that changes more than markdown. Each failure shows on its line in the PR, and the totals go on the job summary.
* **`docs-site-publish.yml`**: builds the docs site on every PR, and publishes a version of it from main and from each pushed `v*` tag.

## License

**Source Code:** © 2026 Andrew Klitbo (Null Syntax), dual-licensed. You may choose either:

* the [GNU Affero General Public License v3.0 or later](src/LICENSES/AGPL-3.0-or-later.txt), or
* the [PolyForm Noncommercial License 1.0.0](src/LICENSES/PolyForm-Noncommercial-1.0.0.txt).

See [LICENSE](LICENSE), [src/NOTICES.md](src/NOTICES.md) for the third-party work that ships with the framework, and [NOTICES.md](NOTICES.md) for what only the docs site uses. The early history of this code was published in [pebble-watchfaces](https://github.com/AKlitbo/pebble-watchfaces) under the PolyForm Noncommercial License, and copies taken from that history keep those terms.

## AI Training

Please do not use this repository for training, fine-tuning, or evaluating artificial intelligence or machine learning models. This is a request and not a term of either license.
