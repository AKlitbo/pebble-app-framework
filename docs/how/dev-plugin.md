# The Dev Plugin

The `dev` plugin is for working on a face rather than wearing it. On the watch it has a harness that fills the stores with fixed readings and steps the face through its themes on a tap, so the same build draws the same screen every time it runs. On the computer, `clay-preview` builds the face's settings page into a file a browser opens, and `tap-walk` drives the emulator through the harness and saves a screenshot of every screen it reaches. A face lists the plugin once and turns the harness on only in a dev build, so none of it reaches a release.

The harness is [`dev_walk.h`](../../src/plugins/dev/c/dev/dev_walk.h) and [`dev_walk.c`](../../src/plugins/dev/c/dev/dev_walk.c) under `src/plugins/dev/c/dev/`. The tools are [`clay-preview.ts`](../../src/plugins/dev/clay-preview.ts) and [`tap-walk.ts`](../../src/plugins/dev/tap-walk.ts) beside it. A face runs them with `paf tool <face> clay-preview` and `paf tool <face> tap-walk`, which [the paf commands](../paf/commands.md#paf-tool) cover. The framework repo also checks the settings page in a browser with `page-check.ts`, which [Checking the Page in a Browser](#checking-the-page-in-a-browser) covers.

## Listing the Plugin

A unit lists the plugin under `plugins` in its `paf.config.json`, as `"dev": {}`. It takes no settings. `paf` then copies it into the unit's `paf/plugins/dev/`, and both tools become available to every face in the unit.

**The Harness Joins the Build.** The build stages each folder under a listed plugin's `c/` beside the framework's own C, so the plugin's `c/dev/` lands as `dev/` and a face includes `dev/dev_walk.h`. A face can keep its own `src/c/dev/` folder, since only whole paths clash. A face with its own `dev/dev_walk.h` stops the build, which names both files rather than compile against whichever one the include path finds first.

## Fixed Readings for Screenshots

`dev_walk_seed_stores(hour, minute)` starts the time, weather, health, system, and location stores from one fixture, with `live` false and the clock pinned. A face calls it in place of those stores' live inits. The stock and calendar stores start empty with `live` false on a face that declares `STOCK_STRIP` or `CALENDAR_STRIP`, so a face that shows quotes or an agenda seeds its own after the call. The phone battery and now playing stores start empty the same way on a face that declares their keys, since the seeded system store tells them nothing about the link. Call it after `settings_init`, since the weather seed takes the wearer's temperature unit. A seeded store shows its seed and nothing else, and [How the Stores Work](stores.md#seeded-for-screenshots) covers why nothing from the phone or the watch's services can replace it.

**The Fixture.** The readings come from a table of shots, one per step of the theme walk below, and the first shot is what a face shows with no walk running: 21 degrees Celsius and partly cloudy, a heart rate of 72, 8,431 steps, the battery at 64 percent, the phone connected, and the Quiet Time mark down. Every shot also carries the same 420 calories, 7 hours 11 minutes of sleep, 52 active minutes, and 5.3 km walked. The battery never reads as charging, and the system store has no next alarm. On a watch set to Fahrenheit each temperature goes in converted, so 21 degrees shows as 70F.

**The Pinned Clock.** The time store gets the face's hour and minute with the seconds at 0, and no ticker runs. The date is not pinned. It comes from the watch's clock when the stores are seeded, so a face that shows the date draws the day it runs, and a screenshot taken tomorrow differs in the date alone.

**Everything Else Reads as Missing.** The weather seed starts from `WEATHER_SEED_EMPTY` and sets only the temperature and the condition. Humidity, wind, UV, sunrise, sunset, the high and low, and the forecast all keep their no-data values, so a panel showing one draws dashes rather than a 0 that looks real. A face whose screenshots need those readings writes its own walk with a fuller fixture, as below.

**Only What the Face Declares.** The harness only fills the weather and location stores for a face that declares their message keys. [`appmessage_features.h`](../../src/c/pebble/io/appmessage/appmessage_features.h) defines `APPMESSAGE_HAS_WEATHER` when the face declares all four weather keys and `APPMESSAGE_HAS_LOCATION` when it declares both coordinate keys, which [Talking to the Phone](talking-to-the-phone.md) explains. Without them the harness still starts the store, empty and not live. A face without weather can still link a readout that reads the weather store, and an untouched store would hold zeros where a started one holds its no-data values.

**The Coordinates Are Text.** The location store keeps whatever text the face's phone code formats, as [The Location Store](location-store.md#how-a-fix-arrives) covers. The fixture's coordinates are the text `33-44` and `-112-07`, so a face that formats its coordinates as decimals or with hemisphere letters shows the fixture in a style its real readings never take.

## The Theme Walk

`dev_walk_init(mode, apply_theme)` starts the harness once the engine is up. `apply_theme` is the face's own hook for a theme change, such as recolouring its zones or swapping a frame picture. The harness runs it, then calls `engine_rebuild` so the whole face repaints.

With `DEV_WALK_NONE` that is all it does, and the face shows the fixture in whichever theme its settings hold. With `DEV_WALK_THEMES` it forces the first theme and subscribes to the accelerometer's tap service. Each tap moves to the next theme, seeds the stores again from the shot with the same number, sets that shot's Quiet Time mark, runs the face's hook, and rebuilds. After the last theme a tap comes back to the first:

```mermaid
flowchart LR
  first["first theme, first shot"] -- tap --> second["second theme, second shot"]
  second -- tap --> third["third theme, third shot"]
  third -- "more taps" --> last["last theme, its shot"]
  last -- tap --> first
```

**A Range of Readings.** The table holds eight shots, spread across temperatures from -8 to 35 degrees, six different conditions, a battery from 8 to 100 percent, the phone dropped in two shots, and the Quiet Time mark up in four. A sheet of every theme is also a sheet of how the face draws a flat battery, a lost phone, or snow. A face with fewer than eight themes uses the first shots, and a ninth theme starts the table again.

**The Number of Themes.** The walk asks the settings layer how many values the theme setting allows, which is the same count that caps a theme sent from the phone. Every theme the watch accepts is in the walk, without the walk being told how many there are. A face with no theme setting gets a count of 0, so every tap redraws the first theme and the walk never moves.

**Nothing Is Saved.** The harness writes the theme and the Quiet Time mark with `settings_set_u8`, which changes the value in memory and never touches flash. A walk on the emulator leaves the theme the face had saved there as it was. On a face that has no Quiet Time setting, the write does nothing.

**A Face's Own Walks.** A walk is a tap handler that changes one thing and rebuilds, so a face can write its own beside the plugin's. The LCARS face steps its readout slots through every readout it offers, with a fuller weather fixture so no slot shows dashes and a different clock on each step. It has a second walk that steps the weather condition through every icon, day and night. Both live in the face's own `src/c/dev/` and seed the stores the same way, and `tap-walk` drives them like the theme walk.

## Turning It On for a Dev Build

A face keeps its switches in one header of its own, such as `src/c/dev/dev.h`, with a master switch that stays at 0 in every build it ships. The hooks are `static inline` and turn into nothing when the switch is off, so the face's `main.c` calls them without any `#if` of its own:

```c
// src/c/dev/dev.h
#pragma once
#include <pebble.h>

#define DEV_MODE 0             // 1 boots the face on the fixture. 0 in anything shipped
#define DEV_TAP_WALK_THEMES 0  // 1 makes a tap step to the next theme

#if DEV_MODE
#include "dev/dev_walk.h"
#endif

static inline bool dev_seed_stores(void)
{
#if DEV_MODE
    dev_walk_seed_stores(10, 42);
    return true;
#else
    return false;
#endif
}

static inline void dev_start(void (*apply_theme)(void))
{
#if DEV_MODE
    dev_walk_init(DEV_TAP_WALK_THEMES ? DEV_WALK_THEMES : DEV_WALK_NONE, apply_theme);
#else
    (void)apply_theme;
#endif
}

static inline void dev_stop(void)
{
#if DEV_MODE
    dev_walk_deinit();
#endif
}
```

`main.c` skips the live inits when the stores were seeded, starts the walk once the engine is built, and stops it on the way out, which drops the tap subscription:

```c
if (!dev_seed_stores())
{
    time_store_init((TimeConfig){.live = true, .minute_tick = true}, NULL);
    weather_store_init((WeatherConfig){.live = true, .poll_min = 30, .persist_key = WEATHER_KEY}, NULL);
    // and the rest of the face's live inits
}

engine_init(window, build_face);
window_stack_push(window, true);
dev_start(apply_theme);
```

`tap-walk`'s hints name `DEV_MODE` and `DEV_TAP_WALK_THEMES` in `src/c/dev/dev.h`, so a face that keeps the same names and the same file gets hints that name its own switches.

**Out of a Release.** With the switch at 0, `dev_seed_stores` returns false, the live inits run, and the face never includes the harness's header. `dev_walk.c` is still compiled for every face in a unit that lists the plugin. The Pebble SDK puts each function in its own section and has the linker drop any section nothing calls, so a face that never calls the harness ships none of it. Nothing checks the switch at build time, so it is up to the face to commit it at 0.

**A Settings Save Keeps the Stores Pinned.** Only a store's init decides whether it is live. The harness starts the time, weather, health, system, and location stores with `live` false, and the stock, calendar, phone battery, and now playing stores too on a face that declares their keys. A face's settings handler reconfigures its stores with `live` true, and each store the harness seeded stays seeded through that. A store nothing started, such as the stock store on a face without `STOCK_STRIP`, ignores the reconfigure. So a save from the settings page on the emulator's phone leaves the clock on its pinned time, and the weather, stock, and calendar stores fetch nothing and spend none of the provider's quota. The face's settings handler needs no check of its dev switch, and passes the same rules in a dev build as in a release.

## Previewing the Settings Page

`clay-preview` builds a face's real settings page into `paf/plugins/dev/clay-preview.html`, a plain HTML file a desktop browser opens. It compiles the face's phone code into its build sandbox the way the build does, and fills the sandbox the way the build fills it: the committed `*.g.js` components, ical.js for a face that uses the calendar, the plugin sources entry written from the face's defines, and the face providers entry written from its `providers` list. It runs the build's own step for this, so a face whose own code requires a file in the framework's `plugin-sources/` or `face-providers/` other than its index stops the preview, as it stops the face's real build, and so does a `providers` list the build would refuse. Then it loads the face's own `src/pkjs/index.ts` with `startPebbleApp` swapped for a stand-in that only records what the face hands it. The page, the components, `customClay`, and the features all come from there. The page goes through `faceStart` and then `createClay` in the framework's `ts/pkjs/app.ts`, the same calls `startPebbleApp` builds the phone's page with, so a face that lists providers previews its page narrowed to them, as [Offering Fewer Providers](settings-page.md#offering-fewer-providers) covers. A face with no `src/pkjs/index.ts` of its own stops with a line saying so, and so does one whose `index.ts` never calls `startPebbleApp`. It needs Node and nothing from the Pebble SDK.

**The Build's Own Loader.** The loading is the framework's settings page loader, [`settings-page.ts`](../../src/tools/pkjs/settings-page.ts) under `src/tools/pkjs/`, which `paf build` also runs on every build to count the page's choices and read its defaults for the watch, as [Counts from the Settings Page](settings-on-the-watch.md#counts-from-the-settings-page) covers. So a page that loads in the preview loads in the build, and one whose loading stops the build stops the preview with the same line. The checks the build makes once the page has loaded, such as a control on a key the appinfo does not declare or a `customClay` written as an arrow, run in the build alone, so the preview still opens a page the build refuses, which shows what to fix. The build always starts the features, as the phone does, while the preview starts them only on a face with a plugin define, below.

**The Features Change the Page.** On a face built with a plugin define, such as `PLUGIN_WEATHER`, the preview starts each feature the face passes, with the face's message keys, the page's defaults, and a send queue that sends nothing. It then hands the page to `prepareSettingsPage` in `app.ts`, which is what `startPebbleApp` runs each time the wearer opens the settings. Each feature's `configOpened` runs, and when any feature has a `page` hook, the page goes through the hooks before it is written. A face that lists providers adds the providers' own page pass after the features' hooks, plugin define or not, which drops a picker left with one provider. A face with neither starts no feature at all, so it previews exactly the page Clay builds from the face's own config. A feature that throws as it starts stops the preview with a line naming the feature and listing what the preview's phone has, since a feature that reaches for anything else as it starts cannot run under Node.

**The Same Components as the Phone.** The preview registers what the phone does, since both build the page through `createClay`: the location component, the theme picker and the hidden store when the page holds one, and the components the face passes to `startPebbleApp`, and nothing else. On a face with a plugin define, the features' own components join them for a page that uses them. A face that leaves one of its own out gets a page that fails in the browser's console the way it fails on the phone, where Clay stops with "The component: X is not registered" and the settings screen never opens.

```sh
paf tool <face> clay-preview --watch
```

The preview has a console, which the phone does not. A page whose script fails to parse, such as one with a component method written in shorthand, shows its error there, where on the phone the settings screen just never opens. [The Settings Page](settings-page.md#the-serialization-trap) covers the mistakes that cause it.

**Stand-Ins for the Phone.** Clay expects to run inside PebbleKit JS, so the preview gives it a `Pebble` object that reports the chosen platform on firmware 4.3, a `localStorage`, and a map of the face's message keys built from its `pebble.appinfo.json`. The ids in the map are made up, since rendering only needs the names. With `Pebble` defined, Clay's `generateUrl` returns the page as one data URL, which [The Serialization Trap](settings-page.md#the-serialization-trap) covers, and the preview decodes it into the file. Clay notes which watch opened the page when PebbleKit JS reports it is ready, which never happens under Node, so the preview fills that in itself. Without it, Clay has no watch to check an item's capabilities against, and stops on the first item that names any.

**Watching for Changes.** `--watch` rebuilds the page after every save until stopped. It follows the face's `src/pkjs/`, its family core's `pkjs/` when it has one, and the framework's `ts/`. A burst of saves inside 150 ms rolls into one rebuild. Each rebuild drops the face's compiled code from Node's module cache, keeping Clay and the rest of `node_modules` loaded, and compiles again without emptying the earlier output, so it is an incremental compile rather than a cold one. Nothing reloads the browser, so refresh it after each rebuild. A failed rebuild prints its error and keeps watching. An edit to builder pieces triggers a rebuild too, but the page reads the committed component, so run `paf gen <face> clay` first, as [A Face's Own Builder](settings-page.md#a-faces-own-builder) explains.

**A Returning Wearer.** `--settings=<file>` opens the page filled from a file of saved values. Without it every preview is a fresh install on the page's defaults, and a bug that only shows once something is saved never shows. The file holds what Clay saves on the phone, each message key's name with its value, which [The Life of a Setting](life-of-a-setting.md) shows arriving there:

```json
{ "APPEARANCE_THEME": "2", "APPEARANCE_QUIET_TIME_ICON": true }
```

A select's value is text, as it is on the phone. A path that names no file stops the tool. A file that is not valid JSON does not, since Clay catches it, prints the parse error in the terminal, and opens the page on its defaults.

**Flags.** The face comes first, and the flags can follow in any order. Any argument the tool does not know stops it with a line naming the argument, so a typo, or `--settings saved.json` with a space in place of the `=`, never previews a fresh install by mistake. `-h` or `--help` prints the usage.

**A Round Watch.** `--platform=<name>` opens the page as if from that watch, `emery` by default. With `--platform=gabbro` the items a face filters by capability drop out the way they would there, as [The Settings Page](settings-page.md#building-the-page-from-sections) covers. The tool passes the name to Clay as typed and does not check it against the watches that exist.

**Plugins on the Phone.** `--plugins=<file>` opens the page on a phone with the Pebble app plugins the file lists. It matters for a face built with a plugin define, such as `PLUGIN_WEATHER`, whose features offer a plugin as a source only when the phone has one that serves it. Without the flag the phone lists no plugins. The file holds an object with up to three fields, and each can be left out:

```json
{
  "plugins": [
    { "uuid": "00000000-0000-0000-0001-000000000002", "name": "Weather", "sources": [{ "category": "weather", "items": ["location"], "properties": { "temperature": ["numericValue"], "condition_code": ["longText"] } }] }
  ],
  "state": {
    "weather/location": { "pluginUuid": null, "lastError": "PERMISSION_DENIED", "lastEmpty": false }
  }
}
```

`plugins` is what `Pebble.enumeratePlugins()` hands back, each entry as the Pebble app lists a plugin. A current Pebble app always has the plugin calls, and with plugins switched off its list is empty, so an empty list is plugins off or none installed. A file without `plugins` is an older Pebble app with no plugin calls at all. `src/plugins/dev/fixtures/plugins/plugins-off.json` and `older-app.json` are the two. `state` holds what each plugin source last saved, by its category and item, which is what the page reads to pick its warning rows. The preview puts each one in `localStorage` under the key the plugin source saves it under. `unreadable`, set to `true`, is a phone whose list call throws, so the page cannot tell what is installed and still offers the plugin as a source, as `src/plugins/dev/fixtures/plugins/unreadable.json` shows:

```json
{ "unreadable": true }
```

The files under `src/plugins/dev/fixtures/plugins/` in the framework are worked examples. A path that names no file, a file that is not valid JSON, and a field the preview does not know all stop the tool.

**Another File.** `--out=<file>` writes the page to that file rather than to `clay-preview.html`, and makes its folder when it has to. A relative path is read from the folder the tool runs in.

### What the Preview Leaves Out

**Save.** The Save button sends the page to `pebblejs://close`, which only the phone app answers, so nothing happens. The face's `index.ts` runs in full, but its call to `startPebbleApp` reaches the preview's stand-in rather than the real one. On a face with a plugin define the features start, but nothing tells them PebbleKit JS is ready, and their sends go nowhere, so nothing is fetched or sent to a watch. Code a face runs at the top of `index.ts` after that call still runs under Node, and stops the preview if it reaches for something the stand-ins lack.

**Plugin Updates.** The `--plugins` file gives the plugin list and what each source saved, and nothing more. The phone never subscribes, so no update or error arrives while the page is open.

**The Watch's Copy.** On the phone, the page opens on what Clay saved there, and the phone fills that from the watch's own settings when it holds none, as [The Life of a Setting](life-of-a-setting.md#after-a-reinstall) shows. The preview has no watch and keeps nothing between runs, so it opens on the defaults or on the `--settings` file. A face that lists providers settles that file the way the phone settles its saved settings at launch, so a saved provider the face no longer offers opens as the default.

**The Web View.** A desktop browser is not the phone app's web view. Spacing at phone width and anything the web view handles differently only show on the phone.

## Checking the Page in a Browser

[`page-check.ts`](../../src/plugins/dev/page-check.ts) builds the preview for a list of scenarios and opens each page in Playwright's headless Chromium. The specs check each piece of the settings page on its own, and this is the one check that runs the whole page the way the phone does, with the features' `page` hooks folded in and Clay drawing it. It runs in the framework repo, from its root:

```sh
npm run check:pages
npm run check:pages built-in-weather html-name
```

With no names it runs every scenario, and naming scenarios runs just those. It needs the Chromium that Playwright installs for the `frame` plugin, so it stays out of `npm test`. It is offline, and it waits only for each page to load and answer. A run takes a few seconds.

**The Fixture Faces.** A scenario previews one of the faces under `src/plugins/dev/fixtures/`, `face/` unless it names another, each built from the framework's own folder through the same `facePaths` and `writeTsconfig` the build uses. `face/` has weather and a calendar. Its location and weather sections come from the config builder, and its calendar section is its own, with a lead line, the iCal sentence, the link, and a refresh interval. It passes the framework's own weather and calendar features, so a build with `PLUGIN_WEATHER` or `PLUGIN_CALENDAR` gets that feature's real `page` hook, and a build without it gets none. `core-face/` lays its weather section out the way a family core does, with no mark on its select, `one-source-face/` offers one provider on a select of its own, with its own conditions on the rows under it, `no-choice-face/` keeps the builder's location section with no Data Source select at all, and `custom-clay-face/` takes `face/`'s page with weather alone and passes a `customClay` of its own. Once Clay has built the page, that function marks it with whether the framework had already hidden the weather key row, and then shows the row again. `music-phone-face/` lists the now playing and phone battery features and declares their keys, so every scenario on it sets both `PLUGIN_MUSIC` and `PLUGIN_PHONE`, since the build refuses those keys without their defines. Its own Now Playing section ends on a line marked `pluginSourceRows: 'music'`, so the music notes land under that line and the phone notes at the foot of the page, above the supported plugins panel. `plugin-weather-face/` and `plugin-calendar-face/` take `face/`'s page and declare no `WEATHER_PROVIDER` or no `CALENDAR_SOURCE`, as a face whose list for that kind is the plugin alone has to. `rows-face/` holds one row of every kind Clay draws in a card, with no features, and `picker-face/` holds a theme picker and a toggle with no plain select. `stock-face/` has a stock section of its own, with a key row shown only for the providers that need a key, and `no-page-face/` passes an empty page with weather alone. `no-unit-face/` has the builder's location and weather sections with no temperature unit, so its Weather section holds only the Data Source select, its lead line, and the key row, and `plugin-no-unit-face/` takes that page and declares no `WEATHER_PROVIDER`. The check compiles each face once, then gives each scenario its own copy of that face's build with the scenario's defines and providers list, and previews it with the scenario's `--plugins` and `--settings` files. The providers list goes through the build's own check, `readProviders`, and then the plugin define check with it, so a scenario the build would refuse stops before its page is built.

**What Fails a Page.** The check fails a page that throws, logs to `console.error`, or opens a dialog, which on a phone is a settings screen that never opens or a plugin's name running as code. The one console error it lets through is Chromium's own line saying it cannot open `pebblejs://close#`, which only the phone app opens. It fails a page where Clay leaves a row undrawn, other than one whose capabilities the watch lacks and the rows inside it, a row that shows when it should be hidden or the other way round, on load and after each select change, a section card that shows with nothing in it but headings, checked at the same moments, an element the scenario says must not exist, and a page missing one the scenario says must be there. It fails a custom function whose text holds `$$`, `$&`, `` $` ``, or `$'`, which Clay's plain string replace would read rather than copy, and a page that does not carry that text whole. The text comes from the face's tsc output, the same code the phone runs. It fails a page that holds the framework's row rules other than once, or where it cannot find Clay's base sheet. It fails a page where turning those rules off moves any row's padding. It fails a location search drawn without the look of Clay's text box, read by its label and its field both being laid out as blocks, and a theme picker drawn without the look of Clay's select, read by its name being laid out as a block and its native dropdown being fully see-through. A scenario with `androidHead` opens its page the way the Pebble Android app leaves it with plugins on, with a head of its own ahead of the page's. It fails when Clay's base sheet still comes first, when no row Clay takes padding off picks up the base sheet's padding with the rules off, or when any row sits differently from where it sits once the base sheet is moved back ahead of the rest. Last, it clicks Save, catches the `pebblejs://close#` address the page goes to, and fails a save that leaves out a value the scenario expects or holds the wrong one. It prints a `pass` or `FAIL` line for each scenario, with a line under a failure for each problem, and exits non-zero when any fails. The pages and their builds stay in `src/plugins/dev/build/page-check/`, so a failing page can be opened in a browser.

**Adding a Scenario.** A scenario is one row of `SCENARIOS` in `page-check.ts`. It names its defines, its `--plugins` file in `src/plugins/dev/fixtures/plugins/` or `null` for none, and what the page shows:

```ts
{
  name: 'permission-denied',
  defines: { PLUGIN_WEATHER: 1 },
  plugins: 'permission-denied.json',
  load: { textsHidden: [PERMISSION_TEXT] },
  changes: [
    { key: 'WEATHER_PROVIDER', value: 'plugin', textsVisible: [PERMISSION_TEXT] },
    { key: 'WEATHER_PROVIDER', value: 'openmeteo', textsHidden: [PERMISSION_TEXT] },
  ],
},
```

`providers` is the face's `providers` list for the build, such as `{ weather: ['plugin'] }`, and the build writes it into the page's phone code as it does for a real face. `load` is what the page shows once it opens, and each entry in `changes` picks a value on a select and says what shows after it. Each of them can list rows by message key under `visible` and `hidden`, text and heading rows by their exact words under `textsVisible` and `textsHidden`, and the option values a select has to offer or leave out under `options`. Notes the plugin sources draw go by their words under `notesVisible` and `notesHidden`, and `badged` and `unbadged` list notes that have to show with the warning's badge and without it. `order` lists rows by message key in the order they run down the page, and `textsAbove` and `textsBelow` place a text row, by its words, against a row, by its key. Every row and text listed has to hold, and a row that is not on the page counts as hidden. `absent` lists CSS selectors nothing on the page may match, and `present` lists CSS selectors something on the page has to match. `save` lists the values the save has to carry, by message key, with a select's value as text, and `saveNot` lists values it must not carry. The check only presses Save for a scenario with one of the two. `unchanged: true` renders the page twice more, once with every feature started and its hooks run, as the phone does on every open, and once with none, and fails the scenario unless the two pages are the same byte for byte. It is for a build whose features should leave the page as the face built it.

**The Supported Plugins Panel in a Scenario.** `panel` lists what the supported plugins panel has to show, as `{ kinds, off }`. `kinds` holds each kind's heading and its plugins in order, each plugin by its `name`, with the `tag` after it and the `listing` address of a store plugin. `off` says whether the panel opens on the line to turn plugins on. The check fails a page with no panel or two, a panel that is open on load or does not open and close on a tap of its title, and one that lists anything else. `openUrl: true` hands the page a stand-in for the `Pebble.openUrl` call the Pebble app gives a settings page while plugins are on. With it, each store plugin's name has to link to its listing, and a tap has to ask the stand-in for that address and leave the page where it is. Without it, the name has to be plain text with the address under it. A page that should have no panel lists `.pf-plugins` under `absent`.

**Saved Settings in a Scenario.** `settings` names a file of saved values in `src/plugins/dev/fixtures/settings/`, the same file `--settings` takes, so the page opens on those values rather than as a fresh install. `plugin-picked.json` there is a wearer who picked the Pebble app plugin for the weather:

```json
{
  "WEATHER_PROVIDER": "plugin"
}
```

A scenario names it as `settings: 'plugin-picked.json'`, and `calendar-plugin-picked.json` beside it is a wearer who picked the plugin for the calendar. The spec beside the check fails a row whose plugins or settings file is missing or does not load, that asks about a key the fixture does not declare, or whose providers list or defines the fixture's keys cannot back.

## Walking the Emulator with `tap-walk`

`tap-walk` takes a screenshot of every screen a face's walk reaches. It needs a face built with `DEV_MODE` on and a walk switched on, the emulator, and the Pebble SDK's `pebble` command, so it runs where the build does, which on Windows means WSL. It takes the start, then taps, waits, and takes another, until a screenshot matches the start:

```mermaid
sequenceDiagram
  participant Walk as Tap Walk
  participant Emulator
  participant Face
  Walk->>Emulator: pebble screenshot
  Emulator-->>Walk: the start, saved as shot_000
  loop until a screenshot matches the start
    Walk->>Emulator: pebble emu-tap
    Emulator->>Face: an accelerometer tap
    Face->>Face: next step of the walk, then redraw
    Walk->>Walk: wait 900 ms
    Walk->>Emulator: pebble screenshot
    Emulator-->>Walk: the new screen
    Walk->>Walk: save it if no earlier screenshot matches
  end
```

```sh
paf build my-face
paf tool my-face tap-walk --install
```

**Telling Screens Apart.** The tool hashes each screenshot's PNG bytes with SHA-256. The clock is pinned, so the same step of a walk always draws the same bytes, and a match with the start means the walk has come round. A screenshot that matches an earlier one is skipped without using up a number, so the saved files run `shot_000.png`, `shot_001.png`, and on with no gaps. Two themes that happen to draw the same screen save once.

**When the Taps Change Nothing.** A walk has at least two screens, so a first tap that draws the start again stops the tool with a hint to check the switches. That catches a face built with `DEV_MODE` off, with no walk switched on, or with no theme setting to walk. Anything that changes the screen outside the walk, such as a clock the face starts live itself, keeps the start from ever coming back. The tool gives up after 200 taps and names the folder holding what it saved so far.

**Installing, Not Building.** `--install` puts the `.pbw` from `targets/<target>/build/` on the emulator and gives it two seconds to start. It stops when there is no build there yet. It never builds, since `paf build` is what knows when a new message key or a framework change needs a clean build. Without `--install` the walk runs on whatever face is already on the emulator. `--emulator=<name>` picks the emulator to walk, `emery` by default. `--target=<target>` picks which build `--install` installs, so it stops without `--install`, and a face with more than one target stops until one is picked.

**A Stuck Emulator.** Each screenshot or tap gets 30 seconds before the tool stops, since both normally finish in well under one. The install and the first screenshot can boot the emulator, which on WSL can take a minute or more, so they get three minutes. `pebble` prints its own progress on stderr, and the tool holds that back and shows it only when a step fails, where it says why.

**The Out Folder.** `--out=<folder>` names where the screenshots go, `.tmp/tap-walk-shots` in the unit by default. The tool empties the folder at the start of each walk, once the install has worked, so it only ever holds one walk's screenshots. That is also why the tool refuses a folder outside the unit, the unit itself, or one holding anything other than earlier screenshots and the files an operating system leaves when someone opens a folder, such as `Thumbs.db`. The default sits under `.tmp/`, so a repo that gitignores `.tmp/` keeps the screenshots out of its commits. Each screenshot lands in a temporary file first and only moves into the folder once it is kept, so a step that fails partway never leaves a half-written screenshot among the others.
