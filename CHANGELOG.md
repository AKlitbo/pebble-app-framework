# Changelog

All notable API changes to the Pebble App Framework are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added `requests` to a feature's hooks, naming the watch requests it answers. The phone logs one warning when the watch sends a request no listed feature answers.
- Added `settings_mark_restored`, which clears `settings_was_fresh`. The transport calls it once a save or restore from the settings page has been saved.
- Added `layout_parse_int` in `c/core/layout/layout_string.h`, which reads one layout field and gives -1 for a number past `LAYOUT_INT_MAX` rather than overflowing. A face that parses layout strings itself can call it in place of its own copy.

### Changed

- The icon cache holds 24 icons rather than 64, which covers every icon the busiest layout draws at once and saves 800 bytes of watch memory. Icons nothing draws any more, such as past days' moon glyphs, are dropped rather than kept. The cap is the `ICON_CACHE_MAX` compile-time define. A face has no hook to raise it yet, since its sandbox wscript is generated, so one drawing more than 24 distinct icons in one redraw sees the oldest reloaded.
- `timeband_clip` now works out its minutes in 32-bit maths, so a face that clips spans onto a window no longer links libgcc's 64-bit division, about 750 bytes of watch binary.
- **Breaking:** Weather is now an opt-in feature. Import it from `lib/ts/weather/feature` and pass `features: [weather]` to `startPebbleApp`. Faces that omit it no longer bundle the weather providers. The settings page's default intro no longer mentions weather.
- A face without weather no longer needs the `WEATHER_*` or `LOCATION_*` message keys. A face with weather declares `WEATHER_REQUEST`, `WEATHER_TEMPERATURE`, `WEATHER_CONDITIONS`, and `WEATHER_OK` as before, and one that declares only some of them fails to build, with each missing key named. The coordinate keys are optional, and a face without them gets no coordinates. A pair where either half is not a string is ignored rather than blanking the saved fix. A face without weather must not use `KNOWN_TEMPERATURE_UNIT`, which reads `WEATHER_TEMPERATURE_UNIT`. The same holds for each group of extra readings: the humidity, wind, and sun times, today's high, low, UV, and rain chance, and the feels-like, pressure, and dew point. A face that declares only part of a group now fails to build rather than getting none of it.
- **Breaking:** `appmessage_open` now takes the inbox size in bytes. The outbox is sized from the face's settings table, rather than both buffers opening at the platform maximum. Pass the size of the settings page's biggest save. Clay sends every message key on a save, including the ones the watch never reads, so a page with a URL field, a layout string, and many keys can need 6 KB where a small one fits in 2 KB. The size is held between the SDK's minimum and the platform maximum. A message bigger than the inbox is dropped whole and logged with its reason, and a failed open is logged too.
- Stock symbols can now hold digits and `^`, `=`, `/`, `:`, and `_`, up to 15 characters. `7203.T`, `0700.HK`, `^GSPC`, `EURUSD=X`, `BTC/USD`, and `BINANCE:BTCUSDT` now reach the provider rather than being dropped. The watch shows the first 11 characters. A face whose fonts leave out `^`, `=`, or `_` shows those as missing glyphs, so add them to the font's `characterRegex`.
- **Breaking:** `createDedupedSender` now takes only the send queue and a label, and `push` takes the finished `AppMessageDict`. Pushes are compared by their JSON. Build the dict before pushing, and drop the `same` function from the call.
- The Clay builder's drag now follows only the finger that started it. Another finger's moves and releases are ignored, and a drag that starts while one is under way cancels the first. Rerun `gen:clay` to take this into a face's committed `.g.js`.
- **Breaking:** `timeband_window_epoch` now takes the clock as an epoch in place of today's midnight, and counts back from it. Pass `now` and the wall clock's minute of the day. A window on the morning the clocks change now starts at the right hour, and one that has not opened yet, such as a forecast strip starting at the next hour, is today's rather than yesterday's.

### Removed

- **Breaking:** Removed `formatCoords` from `startPebbleApp`'s options. Pass the formatter to `weather.withCoords` instead. It still runs on every weather result, a failed one included, so a face can show its own text when there is no fix.
- **Breaking:** Removed `location.timeZone` from `buildConfig`. Pass the new `clock: { timeZone: true }` instead, which puts the alternate time zone picker in the Clock section rather than Location Settings. It needs the `CLOCK_TIMEZONE_1` key and works without weather, and the saved zone is kept since the key is the same. `buildConfig` logs a warning if a face still passes `location.timeZone`.
- **Breaking:** Removed `bytesEqual` from `ts/pkjs/wire`'s default export.
- **Breaking:** Removed `wx_resource_for_forecast_code` from `ui/weather/icons.h`, and the generated `icon_codes_table.g.h` behind it. A face drawing the forecast strips maps the code to its own icons: the low bits are the condition's place in the vocabulary in `ts/weather/conditions.ts`, and `WX_FORECAST_NIGHT_BIT` marks a column after dark.
- **Breaking:** Removed `enabled` from every store's config: `TimeConfig`, `WeatherConfig`, `HealthConfig`, `SystemConfig`, `LocationConfig`, `StockConfig`, and `CalendarConfig`. Drop `.enabled = true` from each `*_store_init` call. A face that does not want a store leaves its init call out.
- **Breaking:** `ts/pkjs/app`'s default export now holds only `startPebbleApp`. Import `request` from `ts/pkjs/request`, `getConfig`, `readValue`, and `readBool` from `ts/pkjs/settings-store`, and `runWeatherRound`, `validCoord`, `getManualLocation`, `weatherRetryDelayMs`, `WEATHER_RETRY_DELAYS_MS`, `WEATHER_KEYS`, and the `WeatherState` and `WeatherDeps` types from `ts/weather/feature`. `collectDefaults`, `seedConfigFromWatch`, `retimeSettings`, and `SETTINGS_REFETCH_DELAY_MS` are named exports of `ts/pkjs/app`.
- **Breaking:** Removed `settings_serialized_size`. Use `settings_serialized_size_max`, the most bytes a face's settings reply can take. The outbox is opened at that size, so the settings reply always fits and is no longer measured before each send. `appmessage_open` logs once when a settings table could outgrow the platform's largest outbox.

### Fixed

- Fixed a place typed into a location picker and saved without tapping a suggestion saving as nothing, while the box still showed the name. The picker now shows "Pick a place from the list to save it." while the box holds text that is not a pick.
- Fixed `tap-walk.sh` reporting one screenshot state fewer than it captured.
- Fixed a theme walk ignoring the face's `DEV_TIME_MIN`. Each shot moved the pinned clock to a minute of its own, so a panel that builds its own time through `dev_force_time` disagreed with the clock. Every shot now keeps the hour and minute the face pinned.
- Fixed settings being rewritten to flash on every weather, stock, or calendar message after a fresh install, until the face relaunched. On a face that declares `SETTINGS_FRESH`, the phone now sends the key with every save and restore from the settings page. While fresh, the watch only writes to flash on that message, and saving it ends fresh. Anything else, such as the time zone push on every `ready`, stays in memory until the restore lands. The phone also stops pushing the whole config back on every `ready`. A face without the key saves only when a setting changes. The key carries 1 on a restore and 0 on a save, so a unit switch on the first save of a fresh watch converts the reading in hand, where it read as a restore and showed 21 degrees C as 21F.
- Fixed `solar_day_progress`, `solar_night_progress`, and `solar_next_event` when sunset falls after midnight, as in a high latitude summer. Daytime read as night and the next event read as a sunrise hours away. Equal sunrise and sunset times, and readings outside the day, now return no data.
- Fixed the time zone picker on the settings page reopening its list after a zone was tapped, while a search was still waiting or the geocoder had not answered, where a stray tap could overwrite the pick. Also fixed a zone's UTC offset hint coming out a minute short when the page opened as the minute rolled over.
- Fixed `fmt_hundredths` and `fmt_pct_signed` printing garbage for `INT_MIN`. A stock price comes off the wire as an int32, so a corrupt saved strip can hold it.
- Fixed `layout_has_any_block` overflowing on a corrupt module number of ten or more digits, which could wrap onto a real module and count an empty layout as placed.
- Fixed `moon_days_to_phase` returning 30 right on the new moon. It now returns 0 to 29, and the half day after the moon counts as now as well as the half day before.
- Fixed Finnhub's 403 showing NET ERROR. Its free plan answers 403 for a symbol outside the US, such as `SHOP.TO`, and that now shows NO ACCESS. Twelve Data's 403 for a symbol outside the plan now shows NO ACCESS too, and its server errors show NET ERROR. Both read as INVALID KEY, which shut the quota gate for a problem the key did not cause.
- Fixed `clay-preview.ts` crashing on a face that declares `messageKeys` as a map of name to id, and `--watch` missing edits to the family core's settings sections and to `lib/ts`.
- Fixed `timeband_rolling` putting now just past the far end when the lead was as long as the window. The lead is now pinned to the window's last minute, so the window always holds the moment it was built around.
- Fixed the system store's reconnect callback running before the store recorded the phone as connected, so a face's reconnect handler that read `system_store_bluetooth` saw it disconnected.

## [2.2.0] - 2026-09-23

### Changed

- Renamed the repo to `pebble-app-framework`, and its package to match. GitHub redirects the old URL, so a face's `.gitmodules` keeps working. Point it at `https://github.com/AKlitbo/pebble-app-framework.git` and run `git submodule sync`. A face moving `lib` to this release has to run `npm install` and commit `package-lock.json`, because the lock names the `lib` workspace and its `node_modules` link after the package. `npm ci`, and so CI, fails until it does.

## [2.1.1] - 2026-09-22

### Changed

- The `locationsearch` prompt to pick a city again now draws as a callout, with an accent bar and a badge. A face can repaint it through `.loc-note`.

### Fixed

- Fixed a timezone key never being seeded back from the watch, so the config page opened on an empty field when the phone had nothing saved. The place name now comes back and the picker asks for the city again. The watch's value only fills a field the phone has nothing saved in, so a saved place keeps its zone.
- Fixed an empty timezone key being sent to the watch, which reads it as zero minutes under no name. The key is now left out until a place is saved.
- Fixed a city picked in a `locationsearch` timezone field saving as UTC when the page was saved before the zone lookup answered, or while offline. The pick now takes its zone from the geocoder result straight away, and the prompt to pick again shows when the result has none.
- Fixed a moved occurrence of one recurring iCal event replacing the occurrence of every other recurring event at the same time, and showing once for each of them. `parseIcal` now relates a `RECURRENCE-ID` VEVENT only to the event with the same UID.
- Fixed an older calendar fetch that answered last overwriting a newer one, such as the old feed showing after the iCal URL changed. Only the newest fetch's answer is sent to the watch.
- Fixed `-DBUILD_WATCHAPP` never being passed, so an app target built as though it were a watchface. A face's `#ifdef BUILD_WATCHAPP` code now reaches the app, which for Gridlock is the weather request it makes as it opens. Run `npm run build:manifests` to rewrite the sandboxes, which `build.sh` and CI already do.

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

[Unreleased]: https://github.com/AKlitbo/pebble-app-framework/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/AKlitbo/pebble-app-framework/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/AKlitbo/pebble-watchface-engine/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/AKlitbo/pebble-watchface-engine/releases/tag/v1.0.0
