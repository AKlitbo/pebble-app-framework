# Changelog

All notable API changes to the Pebble Watchface Engine are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

### Added

- Added `node-version` and `sdk-version` inputs to the `setup-pebble` action. Both are optional and default to Node 24 and the latest SDK.
- Added the `report-memory` and `render-memory` actions, which rank every face's memory use on the CI run summary.
- Added the `prepare-release` and `publish-release` actions, which check a face release before it builds and then publish it.
- Added an optional `cancel` to the builder's `DragSpec`, which runs when the pointer is taken away mid drag. A builder that lifts an item out of its model in `lift` puts it back here.

### Changed

- **Breaking:** The engine can be mounted under any folder name. The repo of faces lists that folder in its `package.json` workspaces, which is how the tools tell the engine is mounted.
- `build.sh` and the waf build find faces through the same lookup as every other tool, and `build.sh` no longer needs the repo's own `build:pkjs` script.
- **Breaking:** Stocks and iCal are now features a face opts into, by passing `features: [stocks, calendar]` to `startPebbleApp`. A face that leaves them out no longer bundles their code, so Gridlock has to list both.
- **Breaking:** The Clay, thumbnail and icon generators take the face as an optional argument and run for every face that needs them without one, so a repo needs one `gen:clay`, `gen:thumbnails` and `gen:icons` script instead of one per face. Their banners name those scripts, so committed output needs regenerating.
- ical.js is only copied into a face's build when the face uses iCal.
- **Breaking:** The thumbnail generator takes the panel sizes from the face instead of a fixed list. A face's `module-meta.ts` exports them as `thumbnailSizes`.
- Exported the option and state types that `startPebbleApp`, `runWeatherRound`, `buildConfig`, the hidden store component, and the WeatherAPI provider take, so a face can name them in its own code.
- Pinned `@rebble/clay` to 1.1.0, which adds the `TOUCH`, `SPEAKER` and `RGB_BACKLIGHT` capabilities and integer values for inputs, selects and radio groups.
- The `setup-pebble` action now checks that pebble-tool runs and puts the pebble-tool and SDK versions on the job summary. A pinned `sdk-version` is cached between runs.
- **Breaking:** A `locationsearch` field persists the saved place as JSON for every kind of key, with the zone alongside the coordinates. The pkjs side builds the `offset,label` a timezone field sends the watch, so a face reading that setting off the phone's config sees the blob rather than the pair.
- The config page prompts to pick a timezone city again when the place saved for it carries no zone.

### Removed

- **Breaking:** Removed the `tools/ci/` scripts. A face repo moving to this engine switches its workflows to the actions above in the same commit.

### Fixed

- Fixed a settings reply too big for the outbox being sent in part. It is now skipped unless it fits whole.
- Fixed deleted calendar events staying on the agenda. An empty calendar or a removed feed now clears it.
- Fixed a cleared watchlist staying on the watch and coming back on the next launch.
- Fixed moved occurrences of a repeating event going missing from the agenda.
- Fixed repeated weather requests from the watch each starting a provider fetch, and a failed send leaving weather stuck until the phone app restarted.
- Fixed a watchlist of errors going back to the watch for as long as the provider's quota gate stayed shut.
- Fixed drizzle drawing the N/A icon on OpenWeatherMap.
- Fixed a nacked send retrying with no wait when another send was queued during its backoff.
- Fixed an accented letter in a calendar title or a stock status reaching the watch as a different letter. The accent comes off and the plain letter stays.
- Fixed a store switched on after starting disabled never receiving the reply to its poll.
- Fixed a date format too long for the readout buffer leaving the date line with no terminator for the passes that follow it.
- Fixed every settings save asking the phone for fresh weather. A field counts as changed only when its value moved.
- Fixed a timezone field keeping the offset its zone had when the city was picked, so a London picked in January ran an hour behind all summer. A place picked before this release has no zone saved with it, so it keeps the old offset until the city is picked again.

## [1.1.0] - 2026-09-12

### Added

- Added support for a repo that holds a single face at its root, laid out like a plain Pebble project with `config/`, `src/` and `resources/`. The build and the face release find that face by the name in its `config/pebble.appinfo.json`, and its changelog sits at the repo root.

## [1.0.0] - 2026-09-12

### Added

- First release of the engine as its own repo, split out of the shared `lib/` in pebble-watchfaces.

[2.0.0]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/AKlitbo/pebble-watchface-engine/releases/tag/v1.0.0
