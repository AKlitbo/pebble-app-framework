# Readouts

A readout is a ready-made line of text: the time, the date, the heart rate, the steps, the temperature, and so on. Each one reads its store, follows the setting the wearer picked for it, and writes the text into a buffer, with `--` or nothing at all when there is no reading yet. A face drops one into a slot and gets the formatting, the settings, and the no-data case without writing any of it, and every face that uses the same readout shows the same reading the same way.

They live in [`readouts.h`](../../src/c/pebble/ui/readouts.h) and [`readouts.c`](../../src/c/pebble/ui/readouts.c) under `src/c/pebble/ui/`.

## Using One

Every readout has the shape `void readout_x(char *out, size_t n)`, the same as a text slot's function in [The Engine](engine.md), so a slot binds straight to one:

```c
out[i++] = (EngineSlot){.zone = &s_zones[ZONE_TIME], .text = readout_time};
out[i++] = (EngineSlot){.zone = &s_zones[ZONE_DATE], .text = readout_date};
out[i++] = (EngineSlot){.zone = &s_zones[ZONE_HR],   .text = readout_hr};
```

They are plain functions, so a face can call one from its own drawing code too. A face that draws a heart beside the heart rate calls `readout_hr` into its own buffer and measures that string to place the icon, so the icon sits against exactly the text the slot shows.

A readout holds no state and keeps no copy. It reads the store each time it is called, so it is always as fresh as the store, and the engine's check for an unchanged string keeps that cheap.

| Readout | Reads | Follows | With No Reading |
| :-- | :-- | :-- | :-- |
| `readout_time` | the time store | Time Format | always has a time |
| `readout_meridiem` | the time store | Time Format | empty on a 24 hour or .beats clock |
| `readout_date` | the time store | Date Format | always has a date |
| `readout_hr` | the health store | nothing | `--` |
| `readout_steps` | the health store | Steps Mode | `--` |
| `readout_weather_temp` | the weather store | Temperature Unit | `--` |
| `readout_weather_cond` | the weather store | nothing | `--` |
| `readout_lat`, `readout_lon` | the location store | nothing | `--` |
| `readout_phone_battery` | the phone store | nothing | `--` |

## The Clock

`readout_time` follows the Time Format setting.

**System.** The watch's own 12 or 24 hour setting decides. The readout asks the watch each time it runs, so changing it in the watch's menu shows on the next repaint without a settings save.

**12 Hour and 24 Hour.** Both go through `strftime`, as `%I:%M` or `%H:%M`, so the 12 hour clock reads `06:30` with its leading zero.

**12 Hour without the Leading Zero.** This reads `6:30`. The C library's `%l` would give that directly, but it is an extension to the standard that the SDK's library is not guaranteed to carry, so the readout formats with `%I` and drops a leading `0` itself.

**.beats.** The clock becomes a Swatch Internet Time reading such as `@672`, always three digits after the `@`. [.beats](beats.md) covers the maths and the timer that redraws on each beat.

`readout_meridiem` writes `AM` or `PM` on either 12 hour choice, and on System when the watch is in 12 hour mode. On a 24 hour or .beats clock it writes an empty string, so a face can leave its AM/PM slot in place on every layout and the slot shows nothing when there is nothing to show.

## The Date

`readout_date` runs the Date Format setting through `strftime`, which turns a pattern such as `%a %d %b` into `Thu 18 Jun`, then upper-cases the result to `THU 18 JUN`. [Fonts](fonts.md) covers why capitals matter.

**A .beats Reading in the Date.** A format can carry the `{B}` token, which the readout fills with the current beat, as [.beats](beats.md#the-b-token) covers.

**Too Long for the Buffer.** When the date does not fit the buffer, `strftime` leaves whatever it managed with no ending, and the readout returns an empty string rather than reading past the end looking for one. In an engine slot that means a date longer than 23 characters shows as blank rather than cut short. The date formats on the framework's settings page are all well inside that.

## Health

**Heart Rate.** `readout_hr` writes the beats per minute, or `--`. It prints only a rate above 0, so a reading of 0 shows `--` as well.

**Steps.** `readout_steps` follows the Steps Mode setting. In steps mode it writes the count. In miles or kilometres mode it writes the distance walked to one decimal place with its unit, such as `2.4 KM` or `1.5 MI`. The conversion stays in whole numbers by counting tenths of a unit, so no floating point code is linked into the face.

A step count of -1 means there is no reading, and the readout writes `--` in every mode, since the distance alone reads 0 with no data (see [The Health Store](health-store.md#what-each-read-costs)).

## Weather

**Temperature.** `readout_weather_temp` writes the temperature with its unit letter, such as `23C` or `73F`. The weather store already holds it in the wearer's unit, so the readout only adds the letter. When the store has no temperature yet it writes `--`.

**A Face with No Unit Setting.** A face built with `PLUGIN_WEATHER` and no `WEATHER_TEMPERATURE_UNIT` key gets the number alone, such as `73`. The phone sends all of that face's weather, from the plugin or from a fetch, in the unit the wearer picked in the Pebble app, as [Fetching the Weather](fetching-the-weather.md#units-and-values) covers, and the watch never hears which unit that is. Every other face keeps its letter.

**Condition.** `readout_weather_cond` writes the condition's short label, such as `RAIN` or `PCLDY`. After dark the phone sends a night form such as `CLEAR_NIGHT`, which picks the night icon (see [Icons](icons.md)). The readout trims the `_NIGHT` off, so the text reads `CLEAR` by day or night. With no condition yet it writes `--`.

**The UV Risk Band.** There is no UV readout, since faces put the band in different places, but every face gets the band from the same place. `uv_band` in [`uv_band.h`](../../src/c/core/weather/uv_band.h) turns the weather store's UV index into its WHO risk band: 0 to 2 low, 3 to 5 moderate, 6 and 7 high, 8 to 10 very high, and 11 or more extreme. `uv_band_name` gives the full name, such as `VERY HIGH`, and `uv_band_short_name` gives at most six letters, such as `V.HIGH`, for a slot with the number in front of it. With no reading the store gives -1, the band is `UV_BAND_NONE`, and both names are empty, so a face that writes the name after its dashes adds nothing:

```c
int uv = weather_store_uv();
if (uv < 0)
{
    snprintf(out, n, "--");
}
else
{
    snprintf(out, n, "%d %s", uv, uv_band_short_name(uv_band(uv)));
}
```

The band is an enum, so a face can also colour the reading by it. The font has to carry the space and the full stop the names use.

## Location

`readout_lat` and `readout_lon` write the latitude and longitude as the phone formatted them, or `--` when the watch has no location yet. The location store keeps them as text, so the readout copies them as they are.

## The Phone's Battery

`readout_phone_battery` writes the phone's battery as a percent, such as `84%`, or `--` when the watch has no reading. It has none with the phone away, with plugins off in the Pebble app, and on a face built without the phone battery keys (see [The Phone and Music Stores](phone-and-music-stores.md)).
