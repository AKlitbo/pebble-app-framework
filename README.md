# Pebble Watchface Engine

The shared engine behind my Pebble watchfaces. It holds the device C, the PebbleKit JS runtime and Clay config pieces, the waf build helpers, and the generators and build tooling every face uses.

## Layout

**Engine Code**

* **`c/`**: the device engine. `c/core/` is pure and host-testable. `c/pebble/` needs the SDK. `c/spec/` holds the host test harness.
* **`ts/`**: the PebbleKit JS runtime (weather, stocks, calendar, Clay). Its `testing/` folder holds helpers the TypeScript specs share and never ships to a face.
* **`py/`**: the waf helpers that stage and build a face.
* **`css/`**: the Pebble-64 colour palette the frame backgrounds use.

**Tooling**

* **`tools/`**: manifest, pkjs, icon, frame, thumbnail and Clay component generators.
* **`config/`**: the shared tsconfig, eslint and vitest setup.
* **`.githooks/`**: the pre-commit hook that runs lint and typecheck.
* **`build.sh`**: builds a face's `.pbw` from WSL with the Pebble SDK installed.

**CI and Docs**

* **`.github/actions/`**: the GitHub Actions, each with its script and specs under `scripts/`. The engine's workflows run the verify actions, `build-doxygen`, `build-docs-site`, and `publish-docs-site`. The face repos' workflows run `setup-pebble`, `report-memory` and `render-memory` in CI, and `prepare-release`, `setup-pebble` and `publish-release` to release a face, each reached as `lib/.github/actions/<name>`.
* **`.github/shared/`**: the helpers and spec fakes the scripts in `.github/actions/` share.
* **`docs/doxygen/`**: the Doxygen theme, logo, main page, and header.
* **`docs/typedoc/`**: the look laid over TypeDoc's default theme.
* **`docs/site/`**: the docs site's page templates, its stylesheets for the pages, the shared bar, and the coverage reports, the theme script, and the version picker's script.
* **`docs/tools/`**: renders the docs site's home page and its changelog, notices, and licence pages, and puts the shared bar on every page Doxygen, TypeDoc, and the coverage reports write.

## Using It

The engine does not build on its own. It is mounted as a git submodule one folder down inside a repo of faces, most often at `lib/`, and that repo lists the folder as an npm workspace so the engine's dependencies install once. A repo holding one face keeps it at the root, laid out like a plain Pebble project with `config/`, `src/` and `resources/`. A repo of several keeps each at `watchfaces/<face>/`, or at `watchfaces/<family>/<face>/` beside the code the family shares.

```sh
git submodule add https://github.com/AKlitbo/pebble-watchface-engine.git lib
git config core.hooksPath lib/.githooks
npm install
bash lib/build.sh <face>
```

A repo of faces reaches the engine's tools through scripts in its own `package.json`, each running `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON` on the tool. The generators take a face name, and run for every face that needs them when given none.

| Script | Tool | Face |
| :-- | :-- | :-- |
| `gen:clay` | `tools/clay-components/generate-components.ts` | optional |
| `gen:thumbnails` | `tools/thumbnails/embed-thumbnails.ts` | optional |
| `gen:icons` | `tools/icons/generate-icons.ts` | optional |
| `gen:frame` | `tools/frame/generate-frame.ts` | required, then the frame |
| `dev:clay` | `tools/dev/clay-preview.ts` | required |

The folder can have any name, as long as it sits straight under the repo root and the repo's `package.json` lists it in `workspaces`. That listing is how the tools tell a mounted engine from one checked out on its own. Faces import the engine by relative path, so their imports use whatever name the repo picked, and the build stages the engine into `targets/<target>/` under that same name. Build output all lands in `targets/`, which the repo should ignore.

Each repo pins an exact engine commit, so an engine change reaches a face only when that repo moves its `lib` pointer.

## Versions

Engine releases are git tags such as `v1.0.0`. A repo using the engine moves its `lib` pointer to a tag:

```sh
git -C lib fetch --tags
git -C lib checkout v1.0.0
git add lib
git commit -m "move the engine to v1.0.0"
```

`git submodule status` then shows the tag beside the commit. Work between releases can point `lib` at any commit, but a face release checks that `lib` sits exactly on a tag and stops if it does not.

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
npm --prefix docs run lint            # the site's browser script, which the engine's own lint leaves out
npm --prefix docs run typecheck
npm --prefix docs run format:check    # or format to fix the templates, stylesheets, and theme script
```

A few specs also check real faces, such as whether each face's generated Clay components and thumbnails are up to date. They skip here and run in a repo that mounts the engine at `lib/` beside its `watchfaces/`.

## Docs

The docs site is built from four parts. Doxygen 1.18.0 builds the C docs from the doc comments in `c/`, TypeDoc builds the TypeScript docs from the exported code in `ts/`, and both test suites write a coverage report. A small script then builds the home page from this README, the changelog, the notices, and the licences. An older Doxygen ignores settings the Doxyfile uses.

To build it locally, run these from the repo root in this order. Doxygen, `make`, and gcovr need WSL or Linux.

```sh
npm ci --prefix docs           # TypeDoc and marked, kept out of the engine's own install
doxygen                        # the C docs
npm --prefix docs run ts       # the TypeScript docs
npx vitest run --config config/vitest.config.ts --coverage --coverage.reportsDirectory=docs/site/dist/coverage/ts
make -C c/spec coverage        # the C coverage report, which needs gcovr
npm --prefix docs run site     # the home page and the pages around it, last since it reads both coverage reports
```

The [`docs/` README](docs/README.md) covers that folder's layout, its own scripts, and how the shared bar reaches every page. The site lands in `docs/site/dist/`, which git ignores. CI fails a build with any Doxygen or TypeDoc warning. Main and each pushed release tag publish the site to [GitHub Pages](https://aklitbo.github.io/pebble-watchface-engine/), each into a folder of its own, and the site opens on the latest release.

## CI

* **`engine-ci.yml`**: runs the host C suite, Vitest, lint and typecheck on every PR and push to main that changes more than markdown. Each failure shows on its line in the PR, and the totals go on the job summary.
* **`docs-site-publish.yml`**: builds the docs site on every PR, and publishes a version of it from main and from each pushed `v*` tag.

## License

**Source Code:** © 2026 Andrew Klitbo (Null Syntax), dual-licensed. You may choose either:

* the [GNU Affero General Public License v3.0 or later](LICENSES/AGPL-3.0-or-later.txt), or
* the [PolyForm Noncommercial License 1.0.0](LICENSES/PolyForm-Noncommercial-1.0.0.txt).

See [LICENSE](LICENSE) and [NOTICES](NOTICES.md). The early history of this code was published in [pebble-watchfaces](https://github.com/AKlitbo/pebble-watchfaces) under the PolyForm Noncommercial License, and copies taken from that history keep those terms.

## AI Training

Please do not use this repository for training, fine-tuning, or evaluating artificial intelligence or machine learning models. This is a request and not a term of either license.
