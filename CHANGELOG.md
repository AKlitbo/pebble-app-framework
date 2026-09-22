# Changelog

All notable API changes to the Pebble Watchface Engine are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.1] - Unreleased

### Changed

- The `locationsearch` prompt to pick a city again now draws as a callout, with an accent bar and a badge. A face can repaint it through `.loc-note`.

### Fixed

- Fixed a timezone key never being seeded back from the watch, so the config page opened on an empty field when the phone had nothing saved. The place name now comes back and the picker asks for the city again.
- Fixed an empty timezone key being sent to the watch, which reads it as zero minutes under no name. The key is now left out until a place is saved.

## [2.1.0] - 2026-09-20

### Added

- Added `layout_has_any_block` in `c/core/layout/layout_string.h`, which says whether a layout wire string holds a placeable block. The catalog bound comes in as an argument.
- Added `layout_role_pick` in `c/core/layout/layout_role.h`, which picks between a face's day, night and Quiet Time layouts. A trigger with no layout assigned falls through to the next one rather than drawing an empty grid.
- Added time zones to a `locationsearch` field on a timezone key. It matches UTC, a zone name, or a typed offset such as `utc+05:30` as well as a city, and a zone pick persists `{label, offset, tz, fixed}` with no coordinates.

## [2.0.0] - 2026-09-17

### Added

- Added `node-version` and `sdk-version` inputs to the `setup-pebble` action. Both are optional and default to Node 24 and the latest SDK.
- Added `report-memory` and `render-memory` actions, which rank each face's memory use in the CI run summary.
- Added `prepare-release` and `publish-release` actions for checking and publishing face releases.
- Added an optional `cancel` callback to the builder's `DragSpec`, called when a pointer is taken away mid-drag. Builders that remove an item from their model in `lift` can restore it here.
- Added `createDedupedSender` to `ts/pkjs/send-queue.ts`. It wraps a queueSend so an unchanged payload is skipped and a payload whose send failed is not counted as delivered, which is what the weather, stock, and calendar pushes all use now.
### Changed

- **Breaking:** The engine can now be mounted under any folder name. The face repo declares that folder in its `package.json` workspaces, which is how the tools locate the engine.
- `build.sh` and the waf build now find faces through the same lookup as the other tools. `build.sh` no longer needs the repo's `build:pkjs` script.
- **Breaking:** Stocks and iCal are now opt-in features. Pass `features: [stocks, calendar]` to `startPebbleApp`. Faces that omit them no longer bundle their code, so Gridlock must list both.
- **Breaking:** The Clay, thumbnail, and icon generators now take the face as an optional argument and run for every face that needs them when it is omitted. A repo now needs one `gen:clay`, `gen:thumbnails`, and `gen:icons` script instead of one per face. Their banners name those scripts, so committed output must be regenerated.
- ical.js is now copied into a face's build only when the face uses iCal.
- **Breaking:** The thumbnail generator now takes panel sizes from the face instead of a fixed list. A face exports them as `thumbnailSizes` from `module-meta.ts`.
- Exported the option and state types used by `startPebbleApp`, `runWeatherRound`, `buildConfig`, the hidden store component, and the WeatherAPI provider so faces can name them in their own code.
- Pinned `@rebble/clay` to 1.1.0, which adds the `TOUCH`, `SPEAKER`, and `RGB_BACKLIGHT` capabilities and integer values for inputs, selects, and radio groups.
- The `setup-pebble` action now verifies that pebble-tool runs and adds the pebble-tool and SDK versions to the job summary. A pinned `sdk-version` is cached between runs.
- **Breaking:** A `locationsearch` field now persists the saved place as JSON for every key type, including its timezone alongside the coordinates. The pkjs side builds the `offset,label` value sent by a timezone field, so a face reading the setting from the phone's config now receives the JSON blob instead of the pair.
- The config page now prompts for a timezone city again when the saved place has no timezone.
- **Breaking:** `LocationConfig` now carries a `persist_key`, like every other store's config. Pass the key you want `location_store_init` to save the last fix under. A face that omits it gets key 0, and 253 is what earlier versions used.
- The strip caps and marker values the phone and the watch both bound against are now generated into `c/core/wire/wire_caps.g.h` from `WIRE_CAPS` in `ts/pkjs/wire.ts`, rather than defined once per language. `npm run build:conditions` writes it alongside the weather tables, and it is committed like them.
- The OpenWeatherMap provider now fetches its own endpoint and the Open-Meteo extras at the same time instead of one after the other. A weather round spends one request timeout rather than two, and the extras call goes out even when the OWM key is rejected.
### Removed

- **Breaking:** Removed the `tools/ci/` scripts. A face repo moving to this engine should switch its workflows to the new actions in the same commit.
- **Breaking:** Removed `weather_store_location_name` and the weather store's `LOCATION_NAME` handler. Nothing read them. `STORE_TAG_WEATHER` moves to `0x12` with the struct, so a saved reading is refused once after the upgrade and the weather panels show placeholders until the next poll.
### Fixed

- Fixed settings replies larger than the outbox being sent partially. They are now skipped unless they fit in full.
- Fixed deleted calendar events remaining on the agenda. An empty calendar or removed feed now clears them.
- Fixed a cleared watchlist remaining on the watch and returning on the next launch.
- Fixed moved occurrences of repeating events disappearing from the agenda.
- Fixed repeated weather requests from the watch each starting a provider fetch, and a failed send leaving weather stuck until the phone app restarted.
- Fixed an error watchlist being sent back to the watch while the provider's quota gate remained closed.
- Fixed drizzle displaying the N/A icon with OpenWeatherMap.
- Fixed a nacked send retrying immediately when another send was queued during its backoff.
- Fixed accented letters in calendar titles and stock statuses reaching the watch as different letters. The accent is now removed and the plain letter is retained.
- Fixed a store enabled after startup while disabled not receiving the reply to its poll.
- Fixed an overlong date format leaving the readout buffer unterminated for subsequent passes.
- Fixed every settings save requesting fresh weather. A field now counts as changed only when its value actually changes.
- Fixed timezone fields retaining the offset from when their city was selected. For example, a London selected in January previously ran an hour behind during summer. Places selected before this release have no saved timezone, so they retain the old offset until the city is selected again.
- Fixed `readout_weather_cond` cutting a condition token at the first underscore rather than at a trailing `_NIGHT`. It now reads the generated label table, which applies the same rule as the phone.
- Fixed `ICON_AUTOTRIM` and `ICON_TRIM_LOG` being impossible to override. They are `#ifndef`-guarded now, so a face can set either one before including `icon_cache.h` as the header always claimed.

## [1.1.0] - 2026-09-12

### Added

- Added support for a repo that holds a single face at its root, laid out like a plain Pebble project with `config/`, `src/` and `resources/`. The build and the face release find that face by the name in its `config/pebble.appinfo.json`, and its changelog sits at the repo root.

## [1.0.0] - 2026-09-12

### Added

- First release of the engine as its own repo, split out of the shared `lib/` in pebble-watchfaces.

[2.1.0]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/AKlitbo/pebble-watchface-engine/releases/tag/v1.0.0
