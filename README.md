# Pebble App Framework

The shared framework for Pebble watchfaces, watchapps, and Pebble app plugins: the watch code, the phone side, the settings page, and the build.

A face builds in only the parts it uses. The phone fetches the weather, stock quotes, and calendars and sends them to the watch in small packed messages, and the watch keeps each reading through a restart. [paf](https://github.com/AKlitbo/pebble-app-framework-cli) gives each face or family its own copy at a pinned version. The [docs site](https://aklitbo.github.io/pebble-app-framework/) holds the guides, the C and TypeScript reference, and the changelog.

> [!NOTE]
> Built and tested with Pebble SDK 4.44 and pebble-tool 5.1.2, for emery and gabbro. SDK 4.44 is the oldest it supports. SDK 4.42.0 is where a pbw starts carrying the `usesPermissions` list the Pebble app checks, and 4.44 is the first of those `pebble sdk install` offers. A PebbleOS feature the SDK lacks, such as the newer vibe patterns, is not available to a face. A face built with another SDK may behave differently.

## Features

- Weather from OpenWeatherMap, WeatherAPI, or Open-Meteo, with forecasts.
- Stock quotes from Yahoo, Finnhub, Twelve Data, or Alpha Vantage, held inside each provider's free plan unless the wearer has a paid one.
- Calendars from iCal links, kept as one agenda for the week.
- Readings from Pebble app plugins: the weather, stocks, the phone's calendars, now playing, and the phone's battery. The [Supported Plugins](docs/how/plugin-sources.md#supported-plugins) table lists the plugins a face can read from.
- Plugin apps, Pebble app plugins with no watch code that serve data to any face, including the weather from Open-Meteo, OpenWeatherMap, or WeatherAPI.com with each provider's calls counted against its plan.
- Steps, heart rate, and heart rate variability from the watch's health service.
- Sunrise and sunset, the moon, tides, time zones, and time bands, worked out on the watch with no phone.
- A Clay settings page with a key for each provider, rows that show and hide with other settings, and a face's own components.
- Generators and checks for a face's settings page, icons, and frames.
- GitHub Actions for a face repo's CI, memory report, and releases.

## Getting Started

1. **Install paf.** The [paf README](https://github.com/AKlitbo/pebble-app-framework-cli#install) covers it. Building needs WSL, Linux, or macOS with the Pebble SDK.
2. **Make a Unit.** A unit is one face, with its `pebble.appinfo.json`, `src/`, and `resources/` at its root, or a family, with its `core/` and one folder per face. Give it a `paf.config.json` naming its framework tag and the plugins it wants.
3. **List the Workspaces.** The unit's `package.json` lists `paf` and `paf/plugins/*` as npm workspaces, so the framework's dependencies and each listed plugin's install once. Without that the generators and checks stop and say to add it.
4. **Sync and Build.** `paf sync` fills the unit's `paf/` and installs, and `paf build <face>` makes the `.pbw`.

```json
{
  "framework": "v6.1.0",
  "commit": "…",
  "plugins": {
    "icons": { "sources": "icons" },
    "thumbnails": {}
  },
  "gen": {
    "palette": { "script": "core/tools/palette.ts", "after": "clay" }
  }
}
```

`gen` lists the unit's own generators. Each names its script, relative to the unit, and the generator it runs after. `paf pin` writes the tag and its commit.

```sh
paf sync                     # fill paf/ and install
paf gen <face> all           # every generator the face has inputs for
paf check                    # that each face's generated output is current
paf build <face>             # the .pbw, from WSL, Linux, or macOS
paf tool <face> clay-preview # a plugin's tool, here the dev plugin's settings preview
paf test
paf lint [--fix]
paf format [--check]
paf typecheck
```

A face imports the framework by relative path from `paf/`. The build stages the framework's C and each listed plugin's C into `targets/<target>/`, and all build output lands in `targets/`, so add it to `.gitignore`.

A generator runs for a face only when the face holds the file or folder it reads. A face in a family also counts its core's matching folder under `core/pkjs/`.

## What Ships

Everything a face gets lives under `src/`, which is the folder paf copies, without the specs and their fixtures.

| Folder | What It Holds |
| :-- | :-- |
| `src/c/` | The watch code. `core/` is plain C with host specs, and `pebble/` needs the SDK. |
| `src/ts/` | The PebbleKit JS side: weather, stocks, the calendar, plugin sources, plugin apps, and the Clay pieces. `generated.d.ts` types every `*.g` module a generator writes, and `testing/` holds helpers a face's own specs can use too. |
| `src/tools/` | The tools a face builds with. `build.ts` builds the `.pbw` for `paf build`, and the others build the settings page, the pkjs bundle, and the manifest. `shared/` holds helpers a face's own tools can import. |
| `src/waf/` | The waf helpers that stage and build a face, and the wscript template each build target gets. |
| `src/plugins/` | What a face opts into, each with its own `package.json` and dependencies. |
| `src/toolchain.json` | The SDK, pebble-tool, and Node the framework is built with. paf and `setup-pebble` read it from a unit's `paf/`. |
| `src/known-plugins.json` | The Pebble app plugins the settings page's supported plugins panel knows, and the docs' Supported Plugins table is written from. |
| `src/tsconfig*.json` | The compiler options a face's TypeScript builds with, and the ones its own spec and tools tsconfigs extend. |

## Plugins

A unit lists the plugins it wants in its `paf.config.json`, and paf copies only those.

| Plugin | What It Does |
| :-- | :-- |
| `frame` | Bakes a face's HTML frame into background PNGs, and carries `css/pebble-colors.css`, the Pebble-64 palette the frames link to. It needs Playwright and `sharp`. |
| `icons` | Turns a face's SVG glyphs into its icon PNGs, and checks the appinfo media block and each PNG's size are current. It reads the SVGs from `plugins.icons.sources`, relative to the unit, or from `ICON_SOURCES` when that names none. It needs `sharp`. |
| `thumbnails` | Inlines a face's panel PNGs and theme previews as base64 for its settings page, and checks both are current. |
| `code-style` | The ESLint style `paf lint` uses, and Prettier for a unit's CSS, JSON, and YAML through `paf format`, once the unit turns it on. |
| `dev` | The screenshot harness in `c/dev/`, the settings preview in `clay-preview.ts`, `tap-walk.ts`, which screenshots every state of a face's dev tap walk, and `thumbnails.ts`, which crops a face's panel pictures out of a walk. |

## CI and Releases

A face repo's CI runs the `setup-pebble`, `report-memory`, and `render-memory` actions, and its release runs `prepare-release`, `setup-pebble`, and `publish-release`. A workflow loads each from this repo at a tag, such as `AKlitbo/pebble-app-framework/.github/actions/setup-pebble@v6.1.0`, and passes the face it works on. [CI Builds](https://aklitbo.github.io/pebble-app-framework/main/how/ci-builds/) and [CI Releases](https://aklitbo.github.io/pebble-app-framework/main/how/ci-releases/) cover both.

## Versions

Framework releases are git tags such as `v6.1.0`. A unit moves with `paf pin <unit> <tag>`, which prints the breaking entries in the changelog between the two tags. Framework 4 and later need `paf 2.0.0` or later, and a unit holding a plugin app needs framework 6 and `paf 2.2.0`. A face release reads the framework's version from `paf/package.json` and stops when it names none.

## Working on the Framework

The framework's own checks need no faces.

```sh
make -C tests/c/spec  # the host C suite
npm ci
npm test              # providers, Clay pieces, build tools against fixtures/, and the action scripts
npm run lint
npm run typecheck
npm run format:check  # or format to fix the framework's CSS, JSON, and YAML
npm run check:pages   # the settings page in headless Chromium, through the plugin and provider scenarios
```

`npm run check:fresh-unit` fills a new unit with no lock for each plugin, plus one with no plugins, from this checkout with `paf use local`. In each it checks that every package named is installed and every script a `paf` key names loads, then runs the unit's checks. It catches a package a fresh install leaves out, which a unit with a lock would hide. It needs paf, this repo's own git checkout, and the network.

| Path | What It Holds |
| :-- | :-- |
| `tools/` | The framework's own scripts, which only run in this repo. |
| `tests/c/spec/` | The host C test harness, and in `stops/` the compiles that have to fail. The specs sit beside the code they cover. |
| `eslint.config.ts`, `vitest.config.ts`, `tsconfig.*.json` | The framework's own lint, test, and typecheck setup. Its lint takes the house style from the `code-style` plugin. |
| `.githooks/` | The pre-commit hook that runs lint and typecheck. |
| `.github/actions/` | The GitHub Actions, each with its script and specs under `scripts/`, and `.github/shared/` for the helpers they share. |
| `docs/` | The docs site, with its own package and checks, so a face repo never installs them. |

### The Docs Site

Doxygen 1.18.0 or later builds the C docs from the doc comments in `src/c/` and the plugins. TypeDoc builds the TypeScript docs from the exported code in `src/ts/`, and both test suites write a coverage report. A small script then builds the home page and the pages around it. Doxygen, `make`, and gcovr need WSL or Linux.

```sh
npm ci --prefix docs           # the docs site tools
doxygen docs/Doxyfile          # the C docs
npm --prefix docs run ts       # the TypeScript docs
npx vitest run --coverage --coverage.reportsDirectory=docs/site/dist/coverage/ts
make -C tests/c/spec coverage  # the C coverage report, which needs gcovr
npm --prefix docs run site     # the home page and the pages around it, last since it reads both coverage reports
```

The [`docs/` README](docs/README.md) covers that folder's layout and its own checks. The site lands in `docs/site/dist/`, which git ignores.

### The Repo's Own CI

| Workflow | What It Runs |
| :-- | :-- |
| `framework-ci.yml` | The host C suite, Vitest, lint, the format check, and typecheck on every PR and every push to main that changes more than Markdown. It runs the same on the docs site tools, and `check:fresh-unit` in a job of its own. |
| `docs-site-publish.yml` | Builds the docs site on every PR, and fails on any Doxygen or TypeDoc warning. Main and each pushed `v*` tag publish a version of it to GitHub Pages, and the site opens on the latest release. |

## Licence

**Source Code:** © 2026 Andrew Klitbo (Null Syntax), dual-licensed. You may choose either:

* the [GNU Affero General Public License v3.0 or later](src/LICENSES/AGPL-3.0-or-later.txt), or
* the [PolyForm Noncommercial License 1.0.0](src/LICENSES/PolyForm-Noncommercial-1.0.0.txt).

See [LICENSE](LICENSE), [src/NOTICES.md](src/NOTICES.md) for the third-party work that ships with the framework, and [NOTICES.md](NOTICES.md) for what only the docs site uses. The early history of this code was published in [pebble-watchfaces](https://github.com/AKlitbo/pebble-watchfaces) under the PolyForm Noncommercial License, and copies taken from that history keep those terms.

## AI Training

Please do not use this repository for training, fine-tuning, or evaluating artificial intelligence or machine learning models. This is a request and not a term of either licence.
