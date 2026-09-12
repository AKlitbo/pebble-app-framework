# Pebble Watchface Engine

The shared engine behind a family of Pebble watchfaces. It holds the device C, the PebbleKit JS runtime and Clay config pieces, the waf build helpers, and the generators and build tooling every face uses.

## Layout

* **`c/`**: the device engine. `c/core/` is pure and host-testable, `c/pebble/` needs the SDK, `c/spec/` holds the host test harness.
* **`ts/`**: the PebbleKit JS runtime (weather, stocks, calendar, Clay).
* **`py/`**: the waf helpers that stage and build a face.
* **`css/`**: the Pebble-64 colour palette the frame backgrounds use.
* **`testing/`**: shared test helpers.
* **`tools/`**: manifest, pkjs, icon, frame, thumbnail and Clay component generators, plus CI scripts.
* **`config/`**: the shared tsconfig, eslint and vitest setup.
* **`build.sh`**: builds a face's `.pbw` from WSL with the Pebble SDK installed.

## Using it

The engine does not build on its own. It is mounted as a git submodule at `lib/` inside a watchfaces repo, which holds the faces under `watchfaces/` and lists `lib` as an npm workspace so the engine's dependencies install once.

```sh
git submodule add https://github.com/AKlitbo/pebble-watchface-engine.git lib
git config core.hooksPath lib/.githooks
npm install
bash lib/build.sh <face>
```

The mount point has to be `lib/`. Faces import the engine by relative path, and the waf build finds the repo root by looking for it.

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
npm test            # the TypeScript specs: providers, Clay pieces, build tools against fixtures/
npm run lint
npm run typecheck
```

A few specs also check real faces, such as whether each face's generated Clay components and thumbnails are up to date. They skip here and run in a repo that mounts the engine at `lib/` beside its `watchfaces/`.

## License

**Source Code:** © 2026 Andrew Klitbo (Null Syntax), dual-licensed. You may choose either:

* the [GNU Affero General Public License v3.0 or later](LICENSES/AGPL-3.0-or-later.txt), or
* the [PolyForm Noncommercial License 1.0.0](LICENSES/PolyForm-Noncommercial-1.0.0.txt).

See [LICENSE](LICENSE) and [NOTICES](NOTICES.md). The early history of this code was published in [pebble-watchfaces](https://github.com/AKlitbo/pebble-watchfaces) under the PolyForm Noncommercial License, and copies taken from that history keep those terms.

## AI Training

Please do not use this repository for training, fine-tuning, or evaluating artificial intelligence or machine learning models. This is a request and not a term of either license.
