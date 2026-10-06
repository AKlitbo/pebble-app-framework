# How It Works

Each page follows one piece of the framework from end to end: what it does for a face, how it does it, and the trade-offs behind it. The Device API and Phone API references list every function, and these pages explain why they behave the way they do.

## Where the Code Lives

* **`src/c/core/`:** plain C with no Pebble SDK, so its specs run on a PC. Anything that decides what a face shows goes here, and the caller hands it the clock already broken apart.
* **`src/c/pebble/`:** the thin layer that talks to the SDK, such as the stores, the engine, and AppMessage. It gathers what `c/core` needs and passes it down.
* **`src/ts/`:** the phone side, with the settings page, the PebbleKit JS runtime, and the weather, stock, and calendar features.
* **`src/plugins/`:** what a face opts into by listing it in `paf.config.json`, such as the icon and background generators and the dev harness. The `code-style` plugin is lint and format only, so it has no page here.

## Where to Start

[How the Stores Work](stores.md), [The Engine](engine.md), and [The Life of a Setting](life-of-a-setting.md) cover what every face does: read data, draw it, and take settings.
