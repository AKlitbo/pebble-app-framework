# Weather Readings

This is the code that turns one weather message from the phone into the reading the [weather store](weather-store.md) keeps, along with the small conversions a weather panel needs: a wind direction as a bearing, a short label for the condition, and forecast strips that drop the hours already gone. Most of what can go wrong on a weather panel happens here, such as a reading the phone left out, a fetch that failed, or a forecast that arrived late, so these rules decide whether the face shows dashes, the last good number, or something wrong.

It lives under `src/c/core/weather/`, in [`weather_reading.h`](../../src/c/core/weather/weather_reading.h), [`forecast_age.h`](../../src/c/core/weather/forecast_age.h), [`wind_dir.h`](../../src/c/core/weather/wind_dir.h), and [`wx_label.h`](../../src/c/core/weather/wx_label.h). It is in `c/core`, so the store breaks the clock apart and hands it in (see [Where the Code Lives](index.md#where-the-code-lives)). The store takes the day's midnight from the SDK's `time_start_of_today` rather than working it back from the hour and minute, which would be an hour out on the day the clocks change.

## The Message, Group by Group

The phone sends the weather as one message, and its keys come in groups:

* **Current.** The temperature, the condition, and a flag saying the fetch worked. The condition's long label rides along for a face that declares a key for it.
* **Extras.** Humidity, wind speed, wind direction, sunrise, and sunset.
* **Today's Forecast.** The UV index, the high, the low, and the chance of rain.
* **Air.** The feels-like temperature, the pressure, and the dew point.
* **The Strips.** An hourly forecast and a daily one, each packed into a byte array.

A face declares the keys for the groups it shows, and a group is only read when the face declares all of its keys. The current group counts as sent when the message has both a temperature and a condition. Each of the others counts as sent when any one of its keys is in the message. A value the phone had none of is left out of the message, and the AppMessage layer marks it as missing before `weather_reading_apply` sees it.

`weather_reading_apply` then puts the message into the kept reading:

| The Message | The Kept Reading |
| :-- | :-- |
| leaves a group out | keeps that group's readings as they were |
| carries a group | replaces every reading in it, and one the group left out becomes no-data |
| carries the current group from a failed fetch | keeps the last good temperature and condition |
| carries a strip that reads clean | replaces that strip |
| carries a strip that does not read clean | keeps the last good strip |

A reading left out of a group that did arrive means the provider had none this time, so the panel shows dashes rather than an older number that would look current.

**No-Data Values.** A missing reading is -1 for anything that is never negative, such as humidity, wind speed, UV, the chance of rain, pressure, and the sun times. A temperature can be negative and 0 is a real one, so the temperatures use `WEATHER_NO_TEMP`, which is -1000, well outside any real reading. Missing text is an empty string, and a missing strip has a count of 0. The [weather store](weather-store.md#reading-it-back) hands these straight to the face.

**A Failed Fetch.** The flag has to read exactly 1 for the current group to count, and a missing or malformed flag counts as a failure. On a failure the phone sends a status in place of the condition, which the watch only logs. The face keeps the last good temperature and condition rather than going blank. Any other group in the same message still applies.

**Values That Cannot Be Right.** The current temperature is held to -99 to 199, so a corrupt value cannot overflow the 16-bit field it is kept in or draw as a five-digit number. Sunrise and sunset arrive as minutes past local midnight, and anything outside 0 to 1439 becomes -1, since no clock can show it. Text is cut to fit its field rather than run past it.

**What the Return Value Means.** `weather_reading_apply` returns whether it kept anything, and stamps the time as the last sync only then. That return is what the store uses to decide on a redraw and a save, so a message that brought nothing usable costs neither.

## Placing the Forecast Strips

A strip carries no date. The hourly strip says which hour its first column is and how many hours apart the columns are, and the daily strip says which weekday it starts on. The watch places the strip on its own clock when the message lands, by finding the nearest time that matches:

```c
int ahead = (state->hourly.base_hour - clock->hour + 36) % 24 - 12;
```

That gives a first hour from 12 hours behind the current hour to 11 ahead. A strip starting at 14 that lands at 13:40 is one hour ahead, so its first column starts at 14:00:

```
ahead = (14 − 13 + 36) % 24 − 12 = 37 % 24 − 12 = 1
first = 13:40 − 40 minutes + 1 hour = 14:00
```

A strip built at 13:58 that lands at 14:05 still starts at 13, and comes out one hour behind:

```
ahead = (13 − 14 + 36) % 24 − 12 = 35 % 24 − 12 = −1
first = 14:05 − 5 minutes − 1 hour = 13:00
```

Reading it as 23 hours ahead instead would put its first column tomorrow, and it would never age. The daily strip does the same with weekdays, up to three days either way, so a strip sent late in the evening that starts tomorrow is placed at tomorrow's midnight and stays whole until then.

## How the Strips Age

The phone can stay out of reach for hours, and the strip on the watch stays with it. Each time the face reads a strip, the store works out how much of it has gone by and drops those columns from the front. [`forecast_age.c`](../../src/c/core/weather/forecast_age.c) does the counting.

**Hourly.** A column is over once its whole step has gone by, so the column holding the current hour stays. With three hour columns starting at 15:00:

```
at 17:59   2 h 59 min in, 10740 / 10800 = 0 columns over
at 18:10   3 h 10 min in, 11400 / 10800 = 1 column over, the strip now starts at 18:00
```

The store moves the strip's first hour and start time along with the columns it drops, so the labels stay right.

**Daily.** A column is over once its day is before today. The days between the strip's first day and today are counted from midnight to midnight and rounded, so the 23 or 25 hour day when the clocks change still counts as one.

Both counts are capped at the number of columns, so a strip from days ago empties rather than going below zero, and a strip that starts in the future drops nothing. Trimming never writes to flash. Whatever copy is saved carries its own start time, so a relaunch trims it the same way.

## Switching Units

When the wearer switches between Celsius and Fahrenheit, `weather_reading_convert` converts every temperature in the kept reading, including each column of both strips. The face shows the reading in hand in the new unit while the fetch in the new unit is on its way. Each value rounds to the nearest degree, and no-data stays no-data:

```
23 °C → 23 × 9 / 5 + 32 = 73.4 → 73 °F
73 °F → (73 − 32) × 5 / 9 = 22.8 → 23 °C
```

A fifth or a ninth never lands on exactly a half, so no value ties and the rounding needs no rule for one. A Celsius reading always comes back to itself after a round trip, since a Fahrenheit degree is the smaller step. A Fahrenheit one can move a degree, so 71 °F becomes 22 °C and then 72 °F. That drift only lasts until the fetch in the new unit lands.

## Wind Direction

The phone sends the direction the wind comes from as one of the sixteen compass points, such as `NW` or `SSE`. The wind speed and its units are on [Numbers and Units](numbers-and-units.md#wind-speed). That prints fine but cannot be used for drawing, so `wind_bearing` turns it into degrees, 22.5 a point, kept in whole degrees. `NNE` is 22 and `NW` is 315. It ignores case, and anything that is not one of the sixteen points reads -1 rather than north.

`wind_lean` turns a bearing into the part of the wind blowing across a scene drawn from the side, such as trees bending or smoke drifting, from -100 blowing west to 100 blowing east:

```c
int lean = wind_lean(wind_bearing(weather_store_wind_dir()));
```

A wind from the west blows east, so `W` leans 100 and `SW` leans 70. A wind from due north or south blows straight into or out of the scene, so it leans 0, and so does a missing direction. The sine behind it comes from a table every 15 degrees with straight lines between the stops, which lands within a percent of the real sine. `NNE` leans -37 against a true -37.5, and the table costs less than pulling floating point into the face.

## Condition Labels

The phone sends the condition as a short label, such as `CLEAR` or `PCLDY`, so a small slot can print it as it is. After dark it adds `_NIGHT`, as in `PCLDY_NIGHT`, so the watch can pick a night icon. `wx_label_short` drops that ending for the text, since a small slot reads the same by day and by night, and writes `UNKNOWN` for an empty condition. The framework's condition readout shows dashes before any reading arrives and the short label after. [Icons](icons.md#weather-icons) covers how the condition picks a picture.

The long label, such as `Partly Cloudy`, arrives as its own value for a face that declares a key for it, and the store keeps it beside the short one.
