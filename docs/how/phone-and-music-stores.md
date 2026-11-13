# The Phone and Music Stores

The phone store holds the phone's own battery, and the music store holds what the phone is playing. Both come from Pebble app plugins on the phone, which the phone code reads and passes on. Neither has any other source, so a face only gets them with plugins turned on in the Pebble app.

They live in [`phone_store.h`](../../src/c/pebble/io/stores/phone_store.h) and [`music_store.h`](../../src/c/pebble/io/stores/music_store.h), with their `.c` files beside them. The phone side is [`ts/phone/feature.ts`](../../src/ts/phone/feature.ts) and [`ts/music/feature.ts`](../../src/ts/music/feature.ts), and the plugin code behind them is in `src/ts/plugin-sources/`.

## Setting Them Up

On the phone, the face sets `PLUGIN_PHONE` or `PLUGIN_MUSIC` in its appinfo's `defines` and lists the feature in `startPebbleApp`:

```json
"defines": {
  "PLUGIN_PHONE": 1,
  "PLUGIN_MUSIC": 1
}
```

```ts
startPebbleApp({ clayConfig, features: [phone, music] });
```

Each define brings the keys its store needs, `PHONE_BATTERY` and `PHONE_REQUEST` for the battery, and `MUSIC_TITLE`, `MUSIC_ARTIST`, `MUSIC_PLAYING`, and `MUSIC_REQUEST` for now playing, and the build adds them to the face's message keys. A sandbox whose keys change that way builds clean on its own. The build refuses any of those keys without the define, since only the plugin fills them.

On the watch, the face starts each store live, beside a live system store:

```c
system_store_init((SystemConfig){.live = true, .vibe = vibe_bt_transition}, NULL);
phone_store_init((PhoneConfig){.live = true}, NULL);
music_store_init((MusicConfig){.live = true}, NULL);

phone_store_subscribe(redraw);
music_store_subscribe(redraw);
```

**Live Only While Shown.** A plugin sends on every change, so a subscription nobody reads wakes the watch for each one. Start each store live only while the face shows its reading, such as when a phone battery panel is on the wearer's layout, and start it again with `live` false when the layout drops the last one. A store started live asks the phone with `PHONE_REQUEST` or `MUSIC_REQUEST` set to 1, and the phone subscribes. A store started not live sends the same key set to 0, through `appmessage_release_phone` or `appmessage_release_music`, and the phone ends its subscription. The phone keeps the last answer under a `pf-wanted-` key in `localStorage`, so after its own restart it subscribes again unless the watch last said it shows no such reading. A phone that has never heard an answer, as after an install or an upgrade, subscribes at ready rather than waiting on an ask that may run out of tries while the phone code starts, and a store started not live ends that subscription with its 0 a moment after launch. A face that always starts both stores live behaves as before, at the cost of a wake on every change.

**Built Only with the Keys.** Each store's code is built only for a face that declares all of its keys. A face that declares part of a set fails to build, with the missing key named. A face with none of them gets the public calls as stubs, so the battery reads -1, the track reads as nothing playing, and nothing runs.

## The Phone's Battery

`phone_store_battery` gives the level from 0 to 100, or -1 when there is none. `readout_phone_battery` writes it as `84%`, or `--` with no reading.

**No Plugin.** While nothing on the phone serves the battery, the phone sends -2 in place of a level. That is a plugin list with no Phone plugin in it, such as with plugins off in the Pebble app, a subscription that found no plugin or that the phone ended, and a Pebble app from before plugins. The level still reads as -1 and the readout as `--`, and `phone_store_no_plugin` turns true, so a face can say why in place of the dashes, such as `PLUGINS OFF` on a phone battery panel. A level arriving or the phone dropping turns it false again. -1 is left for a reading still on its way, such as before the plugin's first update. The two values are `PHONE_NO_LEVEL` and `WIRE_NO_PLUGIN` in `wire_caps.g.h`, generated from `WIRE_CAPS` in `ts/pkjs/wire.ts`, so the two sides read the same numbers.

The phone sends the whole percent only when it changes, so a Wi-Fi switch with the battery where it was wakes nothing. On iOS the level only moves in steps of 5, and the store shows it as it comes.

## What Is Playing

`music_store_title` and `music_store_artist` give the two lines, each up to 32 characters and empty for none. `music_store_playing` says whether the track plays, and `music_store_has_track` says whether there is a title or an artist to show, paused or not.

**The Text Is ASCII.** The phone folds both lines to ASCII before sending, as [The Message Formats](message-formats.md#text-on-the-way-over) covers, since the watch fonts carry nothing else. A line in a script with no ASCII form, such as a Japanese title, arrives empty rather than as a row of question marks, so the panel shows its empty state. A line of plain ASCII punctuation, such as `!!!`, arrives as written.

**Where It Comes From.** The Pebble app has a music plugin built in on Android. iOS has none built in, and no store plugin serves it yet, so an iPhone shows nothing playing until one is published. The phone code reads from whichever plugin serves it, so a face needs no update when one appears.

**No Plugin.** While nothing on the phone serves now playing, for the same reasons as the battery, the phone sends both lines empty and `MUSIC_PLAYING` as -2. The store reads as nothing playing, and `music_store_no_plugin` turns true until a track or a clear arrives or the phone drops, so a face can show its own words in place of its empty state.

## Not Saved, and Cleared When the Phone Drops

Neither store saves to flash. A battery level or a song from an hour ago is worse than none, so a relaunch starts empty and asks.

Each store adds itself to the system store's link listeners (see [The System Store](system-store.md#the-phone-connection)). When the phone drops, the battery goes back to -1 and the track clears, since the watch can no longer know either, and neither store reports no plugin. When the phone comes back, each store asks again with `appmessage_request_phone` or `appmessage_request_music`. Each also asks once a moment after launch. Neither costs a provider call, so neither waits on a poll interval or the stores' cadence.

## On the Settings Page

Neither kind has a choice to make, so the settings page has no select for either. What it does have is notes, always shown. With nothing on the phone serving the kind, the note says to turn plugins on in the Pebble app under Settings, Plugins, or update the Pebble app. With plugins off the phone lists no plugins at all, and the supported plugins panel opens on a line saying the same, so the kind adds no note of its own and the wearer reads the instruction once. Now playing also gets a note when the wearer has not allowed Music for the face, and either gets one for a plugin whose readings the face cannot use.

The notes go straight after a row the face marks with `pluginSourceRows: 'music'` or `'phone'`, or else at the foot of the page above the supported plugins panel, which lists the plugins each kind can read from.

## Seeding

```c
phone_store_init((PhoneConfig){.live = false}, &(PhoneSeed){.battery = 72});  // -2 seeds no plugin
music_store_init((MusicConfig){.live = false}, &(MusicSeed){.title = "Clocks", .artist = "Coldplay", .playing = true});
```

A store that is not live keeps its seed and takes nothing from the phone. It never asks, and a moment after it starts it tells the phone the face no longer shows the reading, so the phone ends its subscription. That holds for a store the face started live and then again with `live` false. [How the Stores Work](stores.md#seeded-for-screenshots) covers the rest of seeding.
