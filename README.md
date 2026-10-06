# Pebble App Framework

The shared framework for Pebble watchfaces and watchapps. It holds the watch C, the PebbleKit JS runtime and Clay pieces, the waf build helpers, the build tools, and opt-in plugins. Watchfaces and watchapps get it through [paf](https://github.com/AKlitbo/pebble-app-framework-cli), which the [paf pages](https://aklitbo.github.io/pebble-app-framework/main/paf/) on the docs site cover.

> [!NOTE]
> Built and tested with Pebble SDK 4.33.1 and pebble-tool 5.0.40, for emery and gabbro. A PebbleOS feature the SDK lacks, such as the newer vibe patterns, is not available to a face. A face built with another SDK may behave differently.

## Using It

paf copies the framework into each unit at `paf/`. A unit is one face, with its `pebble.appinfo.json`, `src/`, and `resources/` at its root, or a family, with its `core/` and one folder per face. A face is any folder holding a `pebble.appinfo.json`. A repo is one unit, or keeps several under `watchfaces/`, with apps under `watchapps/`. The two folders only sort faces from apps, and a unit in either is laid out the same.

A unit lists `paf` and `paf/plugins/*` as npm workspaces, so the framework's dependencies and each listed plugin's install once. Without that listing the generators and checks stop and say to add it. The unit's `config/` holds its own tool configs, such as its tsconfigs and `vitest.config.ts`.

A unit's `paf.config.json` names its framework tag, the plugins it wants, and each plugin's settings. `paf pin` writes the tag and its commit.

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

`gen` lists the unit's own generators. Each names its script, relative to the unit, and the generator it runs after. `paf gen <face> all` runs them in that place among the framework's and the plugins' generators.

Each generator runs for a face only when the face holds the file or folder it reads. A face in a family also counts its core's matching folder under `core/pkjs/`.

```sh
paf sync                     # fill paf/ and install
paf gen <face> all           # every generator the face has inputs for
paf gen <face> <kind>        # one generator, such as clay or one of the unit's own
paf check                    # that each face's generated output is current
paf build <face>             # the .pbw, from WSL, Linux, or macOS
paf tool <face> clay-preview # a plugin's tool, here the dev plugin's Clay preview
paf test
paf lint [--fix]             # the house style, from the code-style plugin
paf format [--check]         # Prettier over CSS, JSON, and YAML, once the unit turns it on
paf typecheck
```

Faces import the framework by relative path from `paf/`. The build stages the framework's C and each listed plugin's C into `targets/<target>/`, and all build output lands in `targets/`, so add it to `.gitignore`.

A face repo's CI runs the `setup-pebble`, `report-memory`, and `render-memory` actions, and its release runs `prepare-release`, `setup-pebble`, and `publish-release`. A workflow loads each from this repo at a tag, such as `AKlitbo/pebble-app-framework/.github/actions/setup-pebble@v4.0.0`, and passes the face it works on.

## What Ships

Everything a face gets lives under `src/`, which is the folder paf copies, without the specs and their fixtures.

* **`src/c/`**: the watch code. `core/` is plain C with host specs. `pebble/` needs the SDK.
* **`src/ts/`**: the PebbleKit JS runtime (weather, stocks, calendar, Clay), and `generated.d.ts`, which types every `*.g` module a generator writes. Its `testing/` folder holds helpers the framework's specs share, which a face's own specs can use too.
* **`src/tools/`**: the tools a face builds with. `build.ts` builds the `.pbw` for `paf build`, on WSL, Linux, or macOS with the Pebble SDK installed. The others are the Clay component generator and its check, the pkjs build, and the manifest build. `shared/` holds the helpers the tools and plugins share, such as the face lookup and the framework's paths, and a face's own tools can import them too.
* **`src/waf/`**: the waf helpers that stage and build a face, and the wscript template each build target gets.
* **`src/plugins/`**: what a face opts into, each with its own `package.json` and dependencies. A plugin is mostly tools, but it can carry watch C too, which the build stages beside the framework's own.
* **`src/toolchain.json`**: the SDK, pebble-tool, and Node the framework is built with. paf and `setup-pebble` read it from a unit's `paf/`.
* **`src/tsconfig.json`**, **`src/tsconfig.pkjs.json`**, **`src/tsconfig.spec.json`**, and **`src/tsconfig.tools.json`**: the compiler options a face's TypeScript builds with, and the ones its own spec and tools tsconfigs extend.

### Plugins

A unit lists the plugins it wants in its `paf.config.json`, and paf copies only those.

* **`frame`**: bakes a face's HTML frame into background PNGs, and carries `css/pebble-colors.css`, the Pebble-64 palette the frames link to. It needs Playwright and `sharp`.
* **`icons`**: turns the face's vendored SVG glyphs into its icon PNGs, and checks the appinfo media block is current. It reads the SVGs from `plugins.icons.sources` in `paf.config.json`, relative to the unit, or from the `ICON_SOURCES` environment variable when that names none. It needs `sharp`.
* **`thumbnails`**: inlines the panel PNGs as base64 so the Clay layout builder shows real panels, and checks the asset is current.
* **`code-style`**: the house ESLint style `paf lint` uses, and Prettier for a unit's CSS, JSON, and YAML through `paf format`, which stays off until the unit turns it on. It brings ESLint and Prettier with it.
* **`dev`**: the screenshot harness in `c/dev/`, the Clay settings preview in `clay-preview.ts`, and `tap-walk.ts`, which screenshots every state of a face's dev tap walk.

## Versions

Framework releases are git tags such as `v4.0.0`. Framework 4 needs `paf 2.0.0`. A unit moves with `paf pin <unit> <tag>`, which prints the breaking entries in the changelog between the two tags. A face release reads the framework's version from `paf/package.json` and stops when it names none.

## Working on the Framework

The framework's own checks need no faces.

* **`tools/`**: the framework's own scripts, `typecheck.ts`, `build-conditions.ts`, `format.ts`, `fresh-unit.ts`, and the `paf-key.ts` helper it shares with a spec. They only run in this repo.
* **`tests/c/spec/`**: the host C test harness. The specs themselves sit beside the code they cover.
* **`eslint.config.ts`**, **`vitest.config.ts`**, and the **`tsconfig.*.json`** files at the root: the framework's own lint, test, and typecheck setup. Its lint takes the house style from the `code-style` plugin. The root **`tsconfig.json`** holds no files and points an editor at those projects.
* **`.githooks/`**: the pre-commit hook that runs lint and typecheck.
* **`.github/actions/`**: the GitHub Actions, each with its script and specs under `scripts/`. The framework's own workflows run the verify actions, `build-doxygen`, `build-docs-site`, and `publish-docs-site`.
* **`.github/shared/`**: the helpers and spec fakes the scripts in `.github/actions/` share.
* **`docs/`**: the docs site, with the Doxygen and TypeDoc settings, their themes, the page templates, and the tools that build it.

### Tests

```sh
make -C tests/c/spec  # the host C suite
npm ci
npm test              # providers, Clay pieces, build tools against fixtures/, and the action scripts
npm run lint
npm run typecheck
```

`npm run format` runs Prettier over the framework's own CSS, JSON, and YAML with the `code-style` plugin's settings. `npm run format:check` lists the files it would change.

`npm run check:fresh-unit` fills a new unit with no lock for each plugin, plus one with no plugins, from this checkout with `paf use local`. In each it checks that every package named is installed and every script a `paf` key names loads, then runs `paf check` and `paf typecheck`, plus `paf lint` and `paf format --check` where a listed plugin offers them. It catches a package a fresh install leaves out, which a unit with a lock would hide. It needs paf, this repo's own git checkout, and the network, and CI runs it in a job of its own.

The docs site tools have their own package in `docs/`, so a face repo never installs them:

```sh
npm ci --prefix docs
npm --prefix docs run test
npm --prefix docs run lint            # the site's browser script, which the framework's own lint leaves out
npm --prefix docs run typecheck
npm --prefix docs run format:check    # or format to fix the templates, stylesheets, and theme script
```

A face's generated output is checked in its own unit, by `paf check`.

### Docs

Doxygen 1.18.0 or later builds the C docs from the doc comments in `src/c/` and the plugins. TypeDoc builds the TypeScript docs from the exported code in `src/ts/`, and both test suites write a coverage report. A small script then builds the home page, which links this README on GitHub, a page each for the changelog, the notices, and the licences, and the pages on `paf` from `docs/paf/`.

To build it locally, run these from the repo root in this order. Doxygen, `make`, and gcovr need WSL or Linux.

```sh
npm ci --prefix docs           # the docs site tools
doxygen docs/Doxyfile          # the C docs
npm --prefix docs run ts       # the TypeScript docs
npx vitest run --coverage --coverage.reportsDirectory=docs/site/dist/coverage/ts
make -C tests/c/spec coverage  # the C coverage report, which needs gcovr
npm --prefix docs run site     # the home page and the pages around it, last since it reads both coverage reports
```

The [`docs/` README](docs/README.md) covers that folder's layout, its own scripts, and how the shared bar reaches every page. The site lands in `docs/site/dist/`, which git ignores. CI fails a build with any Doxygen or TypeDoc warning. Main and each pushed release tag publish the site to [GitHub Pages](https://aklitbo.github.io/pebble-app-framework/), each into a folder of its own, and the site opens on the latest release.

### CI

* **`framework-ci.yml`**: runs the host C suite, Vitest, lint, the format check, and typecheck on every PR and every push to main that changes more than Markdown. It runs the same checks on the docs site tools, and `check:fresh-unit` in a job of its own. Each failure shows on its line in the PR, and the totals go on the job summary.
* **`docs-site-publish.yml`**: builds the docs site on every PR, and publishes a version of it from main and from each pushed `v*` tag.

## Licence

**Source Code:** © 2026 Andrew Klitbo (Null Syntax), dual-licensed. You may choose either:

* the [GNU Affero General Public License v3.0 or later](src/LICENSES/AGPL-3.0-or-later.txt), or
* the [PolyForm Noncommercial License 1.0.0](src/LICENSES/PolyForm-Noncommercial-1.0.0.txt).

See [LICENSE](LICENSE), [src/NOTICES.md](src/NOTICES.md) for the third-party work that ships with the framework, and [NOTICES.md](NOTICES.md) for what only the docs site uses. The early history of this code was published in [pebble-watchfaces](https://github.com/AKlitbo/pebble-watchfaces) under the PolyForm Noncommercial License, and copies taken from that history keep those terms.

## AI Training

Please do not use this repository for training, fine-tuning, or evaluating artificial intelligence or machine learning models. This is a request and not a term of either licence.
