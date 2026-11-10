# Pebble App Plugins

The Pebble app runs plugins on the phone that serve data to watchfaces: the weather for the places in the Pebble app's own weather list, the events in the phone's calendars, what the phone is playing, and the phone's battery. A face built with a plugin define reads that data through the Pebble app rather than fetching it, and a face built without one carries none of the code. Plugins only answer while the wearer has them turned on in the Pebble app, under Settings, Plugins, so every part of this is written for a phone where they are off as well. [Plugin Apps](plugin-apps.md) covers building a plugin of your own.

The phone code lives under `src/ts/plugin-sources/`, and the rest of the phone code reaches it only through [`index.ts`](../../src/ts/plugin-sources/index.ts). The shared parts are [`subscription.ts`](../../src/ts/plugin-sources/subscription.ts), which keeps one live subscription per kind, [`page.ts`](../../src/ts/plugin-sources/page.ts), which adds the plugin choice and its notes to the settings page, and [`standard.ts`](../../src/ts/plugin-sources/standard.ts), which checks what a plugin says it serves. Each kind has a file that turns a plugin's update into what the watch takes, such as [`weather.ts`](../../src/ts/plugin-sources/weather.ts) and [`calendar.ts`](../../src/ts/plugin-sources/calendar.ts). The build side is the table of kinds in [`plugin-kinds.ts`](../../src/tools/manifest/plugin-kinds.ts), the providers list in [`providers.ts`](../../src/tools/manifest/providers.ts), and the swap in [`build-pkjs.ts`](../../src/tools/pkjs/build-pkjs.ts).

## Turning It On

A face turns plugins on one kind of data at a time, in its appinfo's `defines`. For the weather and the calendar it lists the `weather` and `calendar` features in `startPebbleApp` as it would without plugins. Now playing and the phone's battery have no feature without plugins, so a face lists `music` from `ts/music/feature` and `phone` from `ts/phone/feature` for those two:

```json
"defines": {
  "PLUGIN_WEATHER": 1,
  "PLUGIN_CALENDAR": 1
}
```

```ts
app.startPebbleApp({ clayConfig, features: [weather, calendar] });
```

| Define | What It Reads | Keys It Brings | Select Key | Permission |
| :-- | :-- | :-- | :-- | :-- |
| `PLUGIN_WEATHER` | `weather/location` | `WEATHER_REQUEST`, `WEATHER_TEMPERATURE`, `WEATHER_CONDITIONS`, `WEATHER_OK` | `WEATHER_PROVIDER` | `Location`, which every weather face lists |
| `PLUGIN_CALENDAR` | `calendar/event` | `CALENDAR_STRIP` | `CALENDAR_SOURCE` | `Calendar` |
| `PLUGIN_MUSIC` | `music/track` | `MUSIC_TITLE`, `MUSIC_ARTIST`, `MUSIC_PLAYING`, `MUSIC_REQUEST` | none | `ReadMusic` |
| `PLUGIN_PHONE` | `phone/phone_state` | `PHONE_BATTERY`, `PHONE_REQUEST` | none | none |

Each define decides its own kind and nothing else. It puts that kind's plugin code in the phone bundle, adds that kind's choice and notes to the settings page, and adds its permission to the manifest, as [What the Phone Lets It Reach](phone-side.md#what-the-phone-lets-it-reach) covers. A face can take plugin weather and keep its calendar on the iCal link alone, with no calendar choice on its page and no `Calendar` prompt, by setting `PLUGIN_WEATHER` alone. A define set to `0` is off, the same as one left out. The defines also reach the watch C as `-DPLUGIN_WEATHER=1` and so on. There the weather and calendar defines keep the wearer's choice on the watch, as [Keeping the Choice through a Reset](#keeping-the-choice-through-a-reset) covers, and `PLUGIN_WEATHER` on a face with no unit key drops the unit letter, as [Units from the Pebble App](#units-from-the-pebble-app) covers.

**The Watch Needs settings_init.** With the weather or calendar define on and the select key declared, the watch keeps the wearer's choice in the framework's own settings schema, so a reset of the Pebble app brings it back. That only happens once `settings_init` has run. A face with settings of its own already calls it. A face with no settings of its own has to call `settings_init(NULL)` at launch, before `appmessage_open`, or it keeps nothing and a reset drops the wearer's pick. The outbox is sized from the settings reply when it opens, so a call after it leaves every settings reply empty, and a reinstall restores nothing. The build cannot tell whether a face calls it, so nothing warns. The choice only goes back to the phone in the settings reply, so the build adds `SETTINGS_REQUEST` and `SETTINGS_FRESH` to such a face's keys, even one with no settings of its own. [Keeping a Plugin Source](settings-on-the-watch.md#keeping-a-plugin-source) covers the rest, including key 249, which every face leaves free.

**Each Define Needs Its Keys.** The build stops on a define without the keys its kind needs, so the mistake shows at build time rather than as a lost save or a subscription with nowhere to send. The select key is the one the plugin choice saves under. The calendar's select is one the page adds, and Clay saves a setting to the watch under its key's number, so the face declares `CALENDAR_SOURCE` even though its own page has no such row. A new key needs a `--clean` build. Now playing and the phone's battery have no other source, so the build also stops on their keys without their define, since nothing on the phone would ever answer them.

## The List beside the Define

The define puts the code in. The `providers` list in the appinfo, beside `defines`, says what the settings page offers for the kind:

```json
"providers": {
  "weather": ["plugin", "openmeteo"],
  "calendar": ["plugin"]
}
```

With the define on, weather and the calendar each run in one of three modes:

* **No List.** The source select offers every custom provider, and Preferred Source joins it when a plugin on the phone serves the kind.
* **The Plugin and Custom Providers,** such as `["plugin", "openmeteo"]`. The select offers the listed custom providers, and Preferred Source joins it the same way. The first custom provider listed is the default, wherever `plugin` sits.
* **The Plugin Alone,** `["plugin"]`. The page has no select and none of the rows only a custom provider needs, and the feature always reads from the plugin, whatever is saved.

Now playing and the phone's battery only ever run the third way, so their list is `["plugin"]` or left out.

**What Each Mode Brings.** Every mode brings the kind's keys from the table, which the build adds to the face's message keys after its own. The select key comes with no list or a mixed list, along with `SETTINGS_REQUEST` and `SETTINGS_FRESH`, and is refused beside a plugin only list, since a plugin only kind keeps no choice. A face moving a kind to `["plugin"]` that lists `WEATHER_PROVIDER` or `CALENDAR_SOURCE` itself takes it out of `messageKeys` and builds with `--clean`.

**What the Build Refuses.** The list and the define have to agree. `plugin` in a list needs the kind's define on, and a define on beside a list for its kind needs `plugin` in that list. [What the Build Refuses](phone-side.md#what-the-phone-lets-it-reach) lists the rest of the checks on the providers list, and [Offering Fewer Providers](settings-page.md#offering-fewer-providers) covers what each list does to the page.

**A Face That Shows Coordinates.** A plugin's places carry no coordinates. So a face started with `weather.withCoords` and no list or a mixed list is offered no plugin choice, and fetches as a face without the define does. It warns once when its list holds `plugin`. With a plugin only list it reads the plugin anyway, since it asked for nothing else, and warns that its coordinate readouts show no fix.

## What the Wearer Sees

With no list or a mixed list, the weather's Data Source select gains **Pebble App: Preferred Source** when a plugin on the phone serves the weather. Picking it reads the weather from the plugin the wearer prefers in the Pebble app. The page puts the select first in its section, under the heading and its lead line, and moves the Location Settings section up to sit right after it when that section only holds rows for a fetch, so picking the plugin never makes rows above the wearer's finger vanish. While it is picked, the rows only a fetch needs hide, such as the API key and the location rows, and a note under the select says the weather comes from the first location in the Pebble app's weather settings.

The calendar's page has no source select of its own, since without plugins it would hold one option. The calendar adds a **Calendar Source** select, with **iCal Link** and Preferred Source, under the leading heading and text rows of the section holding the iCal link. A phone with no plugin serving the events leaves it one option, so the select goes and the page shows the link as it would without the define.

With a plugin only list, the page shows notes where the select or the iCal link would sit: where the data comes from, and while nothing on the phone serves the kind, how to turn plugins on. Now playing and the phone's battery always get their notes this way, as [The Phone and Music Stores](phone-and-music-stores.md#on-the-settings-page) covers.

**Warnings under the Choice.** While the plugin is picked, the page reads what the plugin source saved last and adds a note for each thing that went wrong. A plugin that answered and does not send the readings the face needs gets one, as [Preferred Source and the Standard Check](#preferred-source-and-the-standard-check) covers. A wearer who has not allowed the permission gets one saying to allow it for this watchface in the Pebble app. A calendar update that held no events gets a calmer note saying the Pebble app may need permission to read the phone's calendars, or that those calendars may be switched off in its calendar settings.

### With Plugins Off

A current Pebble app always has the plugin calls, and with plugins off `Pebble.enumeratePlugins()` lists nothing. That reads the same as a plugin the wearer removed, so the face treats the two alike.

* **No Define.** Nothing changes, since the face has no plugin code.
* **No List or a Mixed List, Plugin Not Picked.** The select offers only the custom providers, and the calendar has no select. The face fetches as it would without the define. The supported plugins panel opens on a line saying to turn plugins on.
* **A Saved Plugin Choice.** The option stays, as **Pebble App: Preferred Source (Plugins Off)**, with a note saying to turn plugins on, so a save keeps the choice and the plugin answers again once they are back. The weather panel on the watch shows `No Plugin`. The calendar sends nothing, so the watch keeps the agenda it holds.
* **The Plugin Alone.** The page shows the note saying to turn plugins on, or leaves it to the panel when the panel opens on the same line. The weather shows `No Plugin` and the calendar keeps what it holds.

A Pebble app from before plugins has no plugin calls at all, and the page reads it as a phone with plugins off. The one difference is a settings restore after a reset, which drops a saved plugin choice back to the page's default, since that phone can never answer it.

## Each Kind

**Weather.** A weather plugin serves one place per location in the Pebble app's weather list, and the face shows the first. Its update becomes the same reading an Open-Meteo fetch gives, so the watch reads it through the keys it already has. The plugin keeps its reading fresh by itself, so a watch ask only resends the last update as of now. The watch shows `No Location` for an update with no places, `No Wx Data` for a first place with no temperature it can use, `No Plugin` when nothing on the phone serves the weather, and `No Permission` until the wearer allows Location. [Fetching the Weather](fetching-the-weather.md#from-a-pebble-app-plugin) covers the reading.

**The Calendar.** A calendar plugin serves one instance per event in the phone's calendars. Its events go through the same week the iCal reader keeps, so the agenda reads the same from either source. An update with no events sends an empty agenda, since that is how the watch hears every event was deleted. An error sends nothing, since the watch has no status line for the calendar. [The Calendar Store](calendar-store.md#from-a-pebble-app-plugin) covers the reading and the agenda hold after a reset.

**Now Playing and the Phone's Battery.** Both come only from plugins, so their stores on the watch clear when no plugin answers. [The Phone and Music Stores](phone-and-music-stores.md) covers both.

## The Build Swap

The phone bundle only carries what the face's entry reaches through `require`, so the define has to cut the require graph rather than skip code at runtime. Every kind's code sits in its own file under `plugin-sources/`, and `index.ts` exports one name per kind, such as `weatherPlugins`, typed as possibly `null`. The features import that name and run exactly as they would without plugins when it is `null`.

After the phone code compiles, the build writes its own `plugin-sources/index.js` over the compiled one. A kind whose define is on is required from its own file, and a kind whose define is off is `null`:

```js
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.weatherPlugins = require('./weather').weatherPlugins;
exports.calendarPlugins = null;
exports.musicPlugins = null;
exports.phonePlugins = null;
```

With every kind off, the build also deletes the rest of the emitted `plugin-sources/` files, so the emit tree shows plainly that the face built without plugins. The build log says which way it went, as `with plugin weather, calendar` or `without plugins`. A face's own code that requires a file in `plugin-sources/` other than its index stops the build, since that require would reach a file the swap can leave out.

Turning a define on or off needs no `--clean`. The phone code compiles into an emptied emit tree on every build, and the define's C flag rebuilds the C side on its own. So does the default the build writes for the choice the watch keeps, which changes with the `providers` list. Its keys still need one when they are new.

## Preferred Source and the Standard Check

The face never names a plugin. It subscribes to the kind, such as `weather/location`, and the Pebble app routes it to the plugin the wearer prefers for that kind, under Preferred Sources in the Pebble app. So one face works with the Pebble app's own plugins and with any store plugin that serves the same data.

The Pebble app only holds a plugin to its own manifest, so a weather plugin that names its reading `temp` rather than `temperature` still reaches the face, which then finds nothing it can use. So the settings page reads the manifest of the plugin that answered last and checks it declares what the face needs:

| Kind | What a Plugin Has to Declare |
| :-- | :-- |
| weather | `temperature` as a `numericValue`, and `condition_code` as a `longText` |
| calendar | `name` as a `shortText` or a `longText`, and `starts_at` as a `timestamp` |
| now playing | `title` as a `shortText` or a `longText`, and `playing` as a `boolean` |
| phone battery | `battery_level` as a `numericValue` |

A plugin that fails gets a note on the page naming it, saying it sends data this watchface cannot read, and pointing the wearer at Preferred Sources in the Pebble app, or at another source on the face's own select. Everything else a plugin sends is optional, and leaving it out only leaves that readout on its dashes.

## The Supported Plugins Panel

A face built with any plugin define gets one more row at the foot of its settings page once one of its kinds offers a plugin: a closed panel titled **Plugins This Watchface Supports**. Opened, it lists under a heading for each kind the face has on the plugins known to serve it, and where to get them.

* **The Pebble App's Own.** Each built-in plugin reads **Built Into the Pebble App**, with **Off** after it when the phone's plugin list leaves that one out, as it leaves every one out with plugins off. The music plugin is built in on Android only, and says so.
* **Store Plugins.** A store plugin links to its listing on the Pebble appstore, and reads **Installed** when the phone lists it.
* **Plugins the Table Does Not Know.** A plugin on the phone serving the kind that the table does not know is listed by its own name, cut to 40 characters, or as **Unnamed Plugin** when it has none, and reads **Installed**.
* **Plugins Off.** When the phone lists no plugins at all, the panel opens on a line saying to turn plugins on in the Pebble app under Settings, Plugins, or to update the Pebble app.

The table of known plugins is [`directory.ts`](../../src/ts/plugin-sources/directory.ts). It is copied by hand from the appstore, so it ages, and each framework release refreshes it.

**Links.** A plain link on a Clay page would load inside the settings web view and lose the wearer's unsaved settings. The Pebble app gives a settings page `Pebble.openUrl` while plugins are on, which asks before opening the link in the phone's browser. So a store plugin's name is a link only when the page has `Pebble.openUrl`, and is plain text with the listing's address under it otherwise.

The panel is drawn with `<details>`, so the web view opens and closes it with no script. Every name in it is escaped before it reaches the page, so a plugin's name can never become markup or code.

## Marks on the Page

The settings page is built on the phone from the face's own config, and the builder cannot see the defines. So the builder marks its rows on every face, and only a face built with a plugin define acts on the marks. Clay ignores fields it does not know, so on any other face the marks do nothing.

| Mark | Goes On | What a Face with the Define Does with It |
| :-- | :-- | :-- |
| `pluginSource: { category, item }` | the select a plugin choice joins | adds Preferred Source to it |
| `pluginSourceHides: '<select key>'` | a row that means nothing while the plugin is picked | hides it while the plugin is picked, and takes it off the page in plugin only mode |
| `pluginSourceLead: '<select key>'` | a line that leads into the select | keeps it showing with the select, and takes it away with the select |
| `pluginSourceRows: '<kind>'` | a row the face wants a kind's notes under, such as `'music'` | puts the notes for a kind with no select straight after it, rather than at the foot of the page |

`buildConfig` marks its own rows: `WEATHER_PROVIDER` carries `pluginSource`, the weather lead line carries `pluginSourceLead`, and the API key, the Location Settings heading and its three rows, the iCal lead line, and the iCal link carry `pluginSourceHides`. A face that builds its own weather or calendar section marks its own rows the same way. A select that carries no mark is still found by its message key when it has `options`, so a weather select from a family core gets Preferred Source with nothing added. A row that already has a `visibleWhen` keeps it, and the hide joins it as one more condition that has to hold.

**A Section with Every Row Hidden.** Clay draws a section as a card it cannot hide, so a section whose rows all hide would leave an empty card behind. The page marks such a section `hideWhenEmpty`, and the framework's show and hide then hides the card while every row in it is hidden. A face can put `hideWhenEmpty` on a section of its own for the same reason, as long as a row inside it has a message key.

**When There Is No Choice.** When a plugin choice has nothing to join, such as a weather select the face left out or a calendar select left with one option, the page takes the marks naming that select off every row, and the lead line marked for it goes with the select. A section the two leave holding only headings goes too, so no card stands empty under its heading. A `visibleWhen` naming the select is settled against the one option left, so a row whose condition holds shows and a row whose condition fails stays hidden. Without that, a condition on a missing control would hide its row for good.

### The `page` Hook

The features add all of this through `page`, a hook any feature can supply, as [Features](phone-side.md#features) lists. Each time the wearer opens the settings, after `configOpened`, the app passes the page through each feature's `page` hook in turn and opens the result:

* **It Starts from the Face's Page.** Each open starts again from the face's own page, which the defaults and the settings restore also read, so a hook keeps nothing from one open to the next.
* **It Gets Its Own Copy.** Each hook gets its own copy of the page so far and hands back the page to open. It can change that copy in place.
* **One Hook Cannot Break the Page.** A hook that throws, or hands back something that is not a page, is skipped and logged, and the page the hooks before it made goes on.
* **Components Ride Along.** A feature lists the Clay components its rows are drawn with as `components`, and the app registers each one only for a page that holds its rows. A face without the define never carries their code.
* **The Show and Hide Comes First.** The page's custom function is put together again on every open. The framework's show and hide for `visibleWhen` rows runs first, and the face's own `customClay` after it, so a face's function can still change a row the plugin page showed or hid.

A face with no feature that supplies a `page` hook opens exactly the page Clay built from its config.

## The Quick Retry

A plugin subscription lasts as long as the phone code's session, so the feature starts it afresh on every `ready`. While the plugin is picked and nothing is live, such as with plugins off or no plugin installed, the feature tries again every 2 minutes, so a plugin the wearer has just installed or turned on shows up within minutes. Reading the phone's plugin list is a local call, so a retry costs nothing on the network.

The quick retry runs 15 times, about 30 minutes, and then leaves it to the slow refresh every 30 minutes or so. Starting the subscription, opening the settings page, and a save while the plugin is picked each give it the full 15 again. A retry is only spent while nothing is live, so a subscription that ends hours later, as when the wearer turns plugins off, still has its retries then and catches plugins coming back on.

Every kind waiting on a retry shares one 2 minute timer, so a face with weather and the calendar from plugins wakes the phone code once on each beat rather than once for each kind. Each kind keeps its own 15 retries, and the timer stops once no kind has any left. A kind that starts waiting while the timer already runs takes its first retry on the timer's next beat, which can come sooner than 2 minutes. A subscription with no quick retry, such as the one to the Pebble app's units, stays off the timer.

## Units from the Pebble App

A face built with `PLUGIN_WEATHER` and no `WEATHER_TEMPERATURE_UNIT` key has no unit setting of its own. The phone sends all of its weather, from the plugin and from a fetch alike, in the unit the wearer picked in the Pebble app, read from the Pebble app's `preferences/units`, which needs no permission. Until the Pebble app has given a unit, the weather goes in Celsius. The watch has no unit to convert to, so `readout_weather_temp` writes the number with no letter, as [Readouts](readouts.md#weather) covers. A face with the key keeps its own setting. [Fetching the Weather](fetching-the-weather.md#units-and-values) covers when the unit is read and what a change sends.

## Keeping the Choice through a Reset

When the Pebble app is reinstalled, or its saved settings for the face are cleared, the phone fills its settings back in from what the watch sends, as [The Life of a Setting](life-of-a-setting.md#after-a-reinstall) shows. The watch only sends what it keeps. So on a face that offers the plugin choice, the framework keeps it on the watch in a schema of its own, with a default the build writes from the `providers` list, as [Keeping a Plugin Source](settings-on-the-watch.md#keeping-a-plugin-source) covers. The face adds nothing to its own settings for it.

The features' `seeded` hooks then check what came back. A plugin choice comes back on any phone with the plugin calls, plugins off included, and comes out on a Pebble app from before plugins. A weather provider that needs an API key comes out when the phone holds no key, since the key never reaches the watch, and the face falls back to its default provider rather than showing `No API Key`.

## A Face with No Settings Page

A face with no settings of its own passes an empty page, and takes its weather from the plugin alone:

```json
"defines": { "PLUGIN_WEATHER": 1 },
"providers": { "weather": ["plugin"] }
```

```ts
app.startPebbleApp({ clayConfig: [], features: [weather] });
```

The define and the weather feature bring the four weather keys, so it lists no message keys of its own. Its page holds only the weather's notes and the supported plugins panel. It has no unit setting, so it shows the weather in the unit the wearer picked in the Pebble app, and keeps nothing on the watch for a reset, since it has no choice to keep.
