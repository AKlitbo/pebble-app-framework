# Fonts

The font registry gives every font a face uses a small number, its slot, and hands back the loaded font for that number anywhere in the face. A face loads its fonts once at startup, and from then on its layout tables, its drawing code, and the framework's own text fitting all ask for a font by slot. It also keeps track of which fonts the face loaded and which belong to the watch, frees each loaded one exactly once on the way out, and falls back to a built-in font rather than crashing when a slot is empty.

It lives in [`fonts.h`](../../src/c/pebble/ui/fonts.h) and [`fonts.c`](../../src/c/pebble/ui/fonts.c) under `src/c/pebble/ui/`.

## Why a Number Rather than the Font

A loaded font is a `GFont`, a pointer the watch only hands over once the font is loaded at runtime. A table written in the source cannot hold one, so a face that kept `GFont`s in its layout would have to build that layout in code at startup.

A slot number is known when the face is compiled. So the zones that describe where each piece of text goes can be a `static const` table, with the fonts named by slot, and the registry turns the slot into the real font when the text is drawn:

```c
enum
{
    FONT_CLOCK,
    FONT_CLOCK_SMALL,
    FONT_LABEL,
    FONT_COUNT
};

static const Zone s_zones[] = {
    [ZONE_TIME] = {.rect = TIME_RECT, .font_id = FONT_CLOCK, .align = GTextAlignmentCenter,
                   .color = GColorWhite,
                   .font_id_fallback = FONT_CLOCK_SMALL, .rect_fallback = TIME_RECT_SMALL},
};
```

`font_id_fallback` names the smaller font the engine steps down to when the time does not fit, as [The Engine](engine.md#text-that-fits-its-slot) covers.

The face owns the numbering and what each slot means. The registry treats a slot as a plain index into a fixed table of 24, and a face with more fonts than that sets `FONT_SLOTS_MAX` in its appinfo's `defines`, up to 255. A face can check its own count against that cap with a `_Static_assert`, so going over fails the build. Without one, the registry turns the extra slots away with a log line at runtime, and their text draws in the fallback font.

## Loading at Startup

A face loads each font once, before the engine builds its screen:

```c
static void load_fonts(void)
{
    fonts_load(FONT_CLOCK, RESOURCE_ID_FONT_CLOCK_48);
    fonts_load(FONT_CLOCK_SMALL, RESOURCE_ID_FONT_CLOCK_36);
    fonts_register_system(FONT_LABEL, fonts_get_system_font(FONT_KEY_GOTHIC_14));
}
```

`fonts_load` loads the font from its resource and registers it under the slot. It is the same as `fonts_register(id, fonts_load_custom_font(resource_get_handle(resource)))`, which a face can still write itself, and it logs the slot when the font does not load. It also records the resource in the slot, so a later `fonts_swap` to the same one does nothing.

On the way out, one call to `fonts_unload_all` frees every font the face loaded.

**Custom Fonts and System Fonts.** The two register calls differ in who owns the font. `fonts_register` is for a font the face loaded itself, which the face has to free, and `fonts_load` registers through it. `fonts_register_system` is for one of the watch's built-in fonts, which the firmware owns. Freeing one of those is a fault when the app closes. So the registry remembers which is which, and `fonts_unload_all` skips the built-in ones.

**One Font in Several Slots.** A face can register the same loaded font under more than one slot, such as a fallback tier that reuses the main font at the same size. `fonts_unload_all` frees it once and clears every slot holding it, so the second slot never frees it again.

**A Missing Font.** `fonts_get` hands back Gothic 24, one of the watch's built-in fonts, for a slot with nothing in it. That covers a slot the face forgot to register and a font that failed to load, since `fonts_load_custom_font` gives back NULL then and the slot reads as empty. The text still draws, only in the wrong typeface, and the registry logs the miss once per slot rather than on every redraw. `fonts_load` also logs the slot at the moment its load fails, because the wrong typeface on one line is easy to miss on the screen, and it returns false so a face can act on it.

## Swapping a Font While Running

A face that lets the wearer pick a font swaps it when the setting changes:

```c
static void apply_header_font(void)
{
    fonts_swap(FONT_HEADER, header_font_resource(settings_u8(SETTING_HEADER_FONT)));
}
```

`fonts_swap` frees the font the slot held, then loads and registers the new one. The face can call it on every settings save, since it does nothing when the slot already holds that resource from `fonts_load` or an earlier swap. The first call on an empty slot just loads, so the same call works at startup. A load that fails leaves the slot empty, and the text draws in the fallback font.

**Rebuild Straight After.** Call `fonts_swap` only where the face rebuilds its layers right after it. A `TextLayer` keeps the font it was last fitted with, and so does a `GFont` the face copied out of `fonts_get` and kept, and after a swap that font may be freed memory. `engine_rebuild` makes the text layers again, and the face calls it after any settings save anyway (see [The Engine](engine.md)). Anything that looks the slot up while drawing gets the new font straight away.

**What It Leaves Loaded.** It never frees a system font. It does not free a font another slot also holds, since that slot still draws with it. When the other slot registered it as a system font, that slot takes over owning it, so it is still freed once on the way out. In either case the old font and the new one sit in the heap together. Otherwise the old font is freed before the new one loads. `fonts_unload_all` frees whatever is left on the way out, the last font swapped in included.

**Each Write Resets the Record.** The record of which resource a slot holds lasts only until the next write to the slot. `fonts_register`, `fonts_register_system`, and `fonts_unload_all` clear it, and `fonts_load` replaces it. So a font a face registered by hand is always swapped out, even when it happens to sit at the address a freed font used.

**Plain Registering Never Frees.** `fonts_register` and `fonts_load` overwrite a slot without freeing the font in it, so a face that swaps with them keeps its own handle and frees the old font first.

**What It Costs.** Each slot records the resource its font came from, which is 4 bytes of RAM a slot, 96 with the default 24 slots. A face that calls neither `fonts_load` nor `fonts_swap` carries none of it.

The decisions about owning and freeing live in [`font_slots.c`](../../src/c/core/ui/font_slots.c) under `src/c/core/ui/`, with a host spec, and `fonts.c` hands them the SDK's load and unload calls.

## What a Font Costs

**Built-in Fonts.** The watch's own fonts, Gothic, Bitham, Roboto, and the rest, are part of the firmware. Using one adds nothing to the app and takes nothing from its heap. They come in a fixed set of sizes, though, and none of them is any particular face's look.

**Custom Fonts.** A custom font starts as a TrueType file listed in the face's resources at one pixel size. The SDK turns it into a bitmap font at build time, so every size a face uses is its own resource, and a face that shows a clock at four sizes ships four fonts. Each one takes room in the app's resources, and loading it takes room on the heap the face shares with its pictures and layers.

**Only the Characters It Names.** A font resource can carry a `characterRegex` that lists the characters to build, and the SDK leaves every other character out of the font:

```json
{
  "type": "font",
  "name": "FONT_CLOCK_48",
  "file": "fonts/Clock.ttf",
  "characterRegex": "[0-9:@]"
}
```

A large clock font that only ever shows digits, a colon, and the `@` of a .beats reading is a small fraction of the whole alphabet, which is what makes big sizes affordable. The cost is that any character outside the list draws as a box. The date readout upper-cases its text, so a font cut down to capitals still holds every letter of `THU 18 JUN`. A smaller fallback font in a zone has to carry the same characters as the main one, or the text that only fits in the fallback draws as boxes. The SDK does not always notice a changed `characterRegex` on an ordinary build, so a face that changes one builds again from clean.

The engine cuts an over-long string by bytes rather than characters, and the cut-down fonts are why that is safe. A character past plain ASCII takes more than one byte, and a font that carries only what a face shows does not have it, so it draws as a box whether the cut went through the middle of it or not.
