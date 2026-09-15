# Changelog

All notable API changes to the Pebble Watchface Engine are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added `node-version` and `sdk-version` inputs to the `setup-pebble` action. Both are optional and default to Node 24 and the latest SDK.

### Changed

- The `setup-pebble` action now checks that pebble-tool runs and puts the pebble-tool and SDK versions on the job summary. A pinned `sdk-version` is cached between runs.

### Fixed

- Fixed moved occurrences of a repeating event going missing from the agenda.
- Fixed repeated weather requests from the watch each starting a provider fetch, and a failed send leaving weather stuck until the phone app restarted.

## [1.1.0] - 2026-09-12

### Added

- Added support for a repo that holds a single face at its root, laid out like a plain Pebble project with `config/`, `src/` and `resources/`. The build and the face release find that face by the name in its `config/pebble.appinfo.json`, and its changelog sits at the repo root.

## [1.0.0] - 2026-09-12

### Added

- First release of the engine as its own repo, split out of the shared `lib/` in pebble-watchfaces.

[Unreleased]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/AKlitbo/pebble-watchface-engine/releases/tag/v1.0.0
