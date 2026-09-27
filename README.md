# Pebble App Framework

The shared framework behind my Pebble watchfaces and watchapps. It holds the device C, the PebbleKit JS runtime and Clay config pieces, the waf build helpers, and the generators and build tooling every face uses.

> [!NOTE]
> Built and tested with Pebble SDK 4.33.1 and pebble-tool 5.0.40, for emery and gabbro. The framework uses what that SDK offers, so something a newer PebbleOS adds, such as its extra vibe patterns, waits until an SDK ships it. A face built with another SDK may behave differently.

## Layout

**Framework Code**

* **`c/`**: the device code. `c/core/` is pure and host-testable. `c/pebble/` needs the SDK. `c/dev/` is the screenshot harness, which no release build links. `c/spec/` holds the host test harness.
* **`ts/`**: the PebbleKit JS runtime (weather, stocks, calendar, Clay). Its `testing/` folder holds helpers the TypeScript specs share. It ships to a face project with the rest of `ts/`, since the specs that check a face's generated files run there.
* **`py/`**: the waf helpers that stage and build a face.
* **`css/`**: the Pebble-64 colour palette the frame backgrounds use.

**Tooling**

* **`tools/`**: manifest, pkjs, icon, frame, thumbnail and Clay component generators.
* **`config/`**: the shared tsconfig, eslint and vitest setup.
* **`.githooks/`**: the pre-commit hook that runs lint and typecheck.
* **`build.sh`**: builds a face's `.pbw` from WSL with the Pebble SDK installed.
* **`project/`**: `toolchain.json`, the SDK, pebble-tool, and Node the framework is built with. paf and `setup-pebble` read it from a face project's `lib/`.

**CI and Docs**

* **`.github/actions/`**: the GitHub Actions, each with its script and specs under `scripts/`. The framework's workflows run the verify actions, `build-doxygen`, `build-docs-site`, and `publish-docs-site`. The face repos' workflows run `setup-pebble`, `report-memory` and `render-memory` in CI, and `prepare-release`, `setup-pebble` and `publish-release` to release a face. A workflow loads them from this repo at a tag, such as `AKlitbo/pebble-app-framework/.github/actions/setup-pebble@v3.0.0`, and passes the face each one works on. Actions at any later tag keep reading a face project made at 3.0.0 or after, since a project can stay on its tag for good.
* **`.github/shared/`**: the helpers and spec fakes the scripts in `.github/actions/` share.
* **`docs/doxygen/`**: the Doxygen theme, logo, main page, and header.
* **`docs/typedoc/`**: the look laid over TypeDoc's default theme.
* **`docs/site/`**: the docs site's page templates, its stylesheets for the pages, the shared bar, and the coverage reports, the theme script, and the version picker's script.
* **`docs/tools/`**: renders the docs site's home page and its changelog, notices, and licence pages, and puts the shared bar on every page Doxygen, TypeDoc, and the coverage reports write.

## Using It

The framework does not build on its own. It sits one folder down inside a face project, at `lib/`, and the project lists that folder as an npm workspace so the framework's dependencies install once. A face project is a face on its own, laid out like a plain Pebble project with `config/`, `src/` and `resources/`, or a family, with its `core/` and one folder per face. A repo is one face project, or keeps several side by side under `watchfaces/`, with apps under `watchapps/` if it likes. The two folders only sort faces from apps, and a project in either is laid out the same.

[paf](https://github.com/AKlitbo/pebble-app-framework-cli) keeps each project on its own framework tag. A project's `paf.json` names the tag, and paf fills `lib/` with the files the framework's `package.json` `files` list names, then builds and checks the project in place.

```sh
paf sync
paf build <face>
```

A face project reaches the framework's tools through scripts in its own `package.json`, each running `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON` on the tool. The generators take a face name, and run for every face that needs them when given none.

| Script | Tool | Face |
| :-- | :-- | :-- |
| `gen:clay` | `tools/clay-components/generate-components.ts` | optional |
| `gen:thumbnails` | `tools/thumbnails/embed-thumbnails.ts` | optional |
| `gen:icons` | `tools/icons/generate-icons.ts` | optional |
| `gen:frame` | `tools/frame/generate-frame.ts` | required, then the frame |
| `dev:clay` | `tools/dev/clay-preview.ts` | required |
| `typecheck` | `tools/typecheck.ts` | none |

`gen:icons` reads its SVG sources from the folder a project names as `"framework": { "iconSources": "<folder>" }` in its `package.json`, or from the `ICON_SOURCES` environment variable when it names none.

The folder can have any name, as long as it sits straight under the project and the project's `package.json` lists it in `workspaces`. That listing is how the tools tell a mounted framework from one checked out on its own. Faces import the framework by relative path, so their imports use whatever name the repo picked, and the build stages the framework's C into `targets/<target>/` under that same name. Build output all lands in `targets/`, which the repo should ignore. paf always mounts the framework at `lib/`, and the face actions read it there.

## Versions

Framework releases are git tags such as `v1.0.0`. A face project moves with `paf pin <project> <tag>`, which shows the changelog between the two tags first. A face release reads the framework's version from `lib/package.json` and stops when it names none.

## Tests

Everything here runs on its own, with no faces needed:

```sh
make -C c/spec      # the host C suite
npm ci
npm test            # providers, Clay pieces, build tools against fixtures/, and the action scripts
npm run lint
npm run typecheck
```

The docs site tools have a package of their own in `docs/`, with their own scripts, so a repo of faces never installs TypeDoc, marked, or Prettier:

```sh
npm ci --prefix docs
npm --prefix docs run test
npm --prefix docs run lint            # the site's browser script, which the framework's own lint leaves out
npm --prefix docs run typecheck
npm --prefix docs run format:check    # or format to fix the templates, stylesheets, and theme script
```

A few specs also check real faces, such as whether each face's generated Clay components and thumbnails are up to date. They skip here and run in a face project that mounts the framework at `lib/`.

## Docs

The docs site is built from four parts. Doxygen 1.18.0 builds the C docs from the doc comments in `c/`, TypeDoc builds the TypeScript docs from the exported code in `ts/`, and both test suites write a coverage report. A small script then builds the home page from this README, the changelog, the notices, and the licences. An older Doxygen ignores settings the Doxyfile uses.

To build it locally, run these from the repo root in this order. Doxygen, `make`, and gcovr need WSL or Linux.

```sh
npm ci --prefix docs           # TypeDoc and marked, kept out of the framework's own install
doxygen                        # the C docs
npm --prefix docs run ts       # the TypeScript docs
npx vitest run --config config/vitest.config.ts --coverage --coverage.reportsDirectory=docs/site/dist/coverage/ts
make -C c/spec coverage        # the C coverage report, which needs gcovr
npm --prefix docs run site     # the home page and the pages around it, last since it reads both coverage reports
```

The [`docs/` README](docs/README.md) covers that folder's layout, its own scripts, and how the shared bar reaches every page. The site lands in `docs/site/dist/`, which git ignores. CI fails a build with any Doxygen or TypeDoc warning. Main and each pushed release tag publish the site to [GitHub Pages](https://aklitbo.github.io/pebble-app-framework/), each into a folder of its own, and the site opens on the latest release.

## CI

* **`framework-ci.yml`**: runs the host C suite, Vitest, lint and typecheck on every PR and push to main that changes more than markdown. Each failure shows on its line in the PR, and the totals go on the job summary.
* **`docs-site-publish.yml`**: builds the docs site on every PR, and publishes a version of it from main and from each pushed `v*` tag.

## License

**Source Code:** © 2026 Andrew Klitbo (Null Syntax), dual-licensed. You may choose either:

* the [GNU Affero General Public License v3.0 or later](LICENSES/AGPL-3.0-or-later.txt), or
* the [PolyForm Noncommercial License 1.0.0](LICENSES/PolyForm-Noncommercial-1.0.0.txt).

See [LICENSE](LICENSE) and [NOTICES](NOTICES.md). The early history of this code was published in [pebble-watchfaces](https://github.com/AKlitbo/pebble-watchfaces) under the PolyForm Noncommercial License, and copies taken from that history keep those terms.

## AI Training

Please do not use this repository for training, fine-tuning, or evaluating artificial intelligence or machine learning models. This is a request and not a term of either license.
