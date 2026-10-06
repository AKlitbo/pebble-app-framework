# Sunrise and Sunset

The sun code tells a face where the day's light has got to: how far through the daylight it is, how far through the night, and how long until the next sunrise or sunset. A face uses it to move a sun along an arc, swap the sun for a moon after dark, or count down to dusk. It works the same on an ordinary day and on a summer night in the far north, where the sun sets after midnight and a simpler check reads the whole afternoon as night.

It lives in [`solar.h`](../../src/c/core/clock/solar.h) and [`solar.c`](../../src/c/core/clock/solar.c) under `src/c/core/clock/`.

## Where the Times Come From

The watch does not work sunrise and sunset out for itself. The weather provider sends them with each reading, and the weather store keeps them as minutes past midnight beside the temperature. [The Weather Store](weather-store.md) and [Weather Readings](weather-readings.md) follow them from the phone to the watch.

**The Trade-Off.** Working the sun out on the watch needs the latitude, the longitude, and the date, plus sines, cosines, and an arccosine to find where the sun crosses the horizon. That means a trig table or floating point in every face that shows the sun. Taking the provider's times costs none of that, and they come to the minute. The cost is that a face only has sun times once a weather reading has arrived, so it needs the weather feature and a location. A face with neither gets no data, and shows whatever it shows for no weather.

**On the Watch's Own Clock.** Each provider gives its times a different way. OpenWeatherMap sends UTC seconds, WeatherAPI sends the location's own time as text such as `06:42 AM`, and Open-Meteo sends the location's own time in ISO form. The phone moves each one onto the phone's clock before sending, which is the clock the watch keeps. A weather location in another zone shows its sunrise as the moment it happens on your watch, not as the time on the clocks there.

**Today's Times, All Day.** The phone sends the sunrise and sunset for the phone's own date, and the watch uses them until the next reading replaces them. Once the sun has set, today's sunrise also stands in for tomorrow's. Sunrise moves by a minute or two a day at middle latitudes and more in the far north, so a countdown to tomorrow's sunrise is off by about that much.

**No Data.** Every function takes -1 for a missing reading and answers -1 back, so a face never draws a sun at midnight because a reading was absent. A value outside 0 to 1439 counts as missing too, rather than being wrapped onto another day.

## Measuring Forward from Sunrise

Every sum here measures forward round the clock from sunrise. Going from one time to another, a negative answer gets a day added:

```c
static int forward(int from, int to)
{
    int minutes = to - from;
    if (minutes < 0)
    {
        minutes += MINUTES_PER_DAY;
    }
    return minutes;
}
```

The daylight is `forward(rise, set)`, and how far into it now sits is `forward(rise, now)`. When the second is bigger than the first, the sun has set and it is night.

That covers a sunset after midnight without a special case. Take a far northern summer day with sunrise at 03:00 and sunset at half past midnight. Sunset is the smaller number, so a check that expects sunset to come later in the day reads the whole afternoon as night. Measured forward from sunrise, noon is plainly daylight:

```
daylight = forward(180, 30)  = 1290 minutes, 21.5 hours
at noon  = forward(180, 720) =  540 minutes in
progress = 540 × 100 / 1290  =   41
```

At 01:00 it is `forward(180, 60)`, 1320 minutes in, which is past the end of the daylight, so it is night.

## The Readings

**Day Progress.** `solar_day_progress` runs from 0 at sunrise to 100 at sunset, and gives -1 at night so a face hides the sun rather than parking it at one end of its arc. It rounds down. With sunrise at 06:30 and sunset at 19:00, 15:00 is 510 of 750 minutes in, which reads 68.

**Night Progress.** `solar_night_progress` runs from 0 at sunset to 100 at the next sunrise, and gives -1 by day. The night is whatever the daylight leaves of the 24 hours. On the same day, 23:00 is 240 of the night's 690 minutes, which reads 34. In the far northern example the night is only 150 minutes, so 01:00 reads 20.

On the minute of sunset the day reads 100 and the night -1, and the night starts at 0 a minute later. With data, exactly one of the two is ever a number, so a face that draws the sun from one and the moon from the other never draws both or neither.

**The Next Event.** `solar_next_event` gives the minutes until the next sunrise or sunset, and sets a flag to say which. While the sun is up it counts to sunset. Before sunrise it counts to sunrise, and once the sun has set it counts across midnight to tomorrow's. At 15:00 on the ordinary day that is a sunset in 240 minutes, and at 23:00 a sunrise in 450. With no data it gives -1 and leaves the flag as it was.

## Polar Day and Night

When the sun stays up all day or never comes up, there is no sunrise or sunset to send. Depending on the provider, the times are left out, which reaches the watch as -1, or both arrive as the same minute. A sun that never sets and one that never rises can arrive looking exactly alike, so the sums read a sunrise and sunset on the same minute as no data rather than guess which it is. The face shows what it shows with no weather.

[Time Bands and Night Hours](time-bands.md#spans-that-repeat-every-day) reads the same pair its own way, since a span and a night window each need an answer.

## Using It in a Face

Each function takes the three times as minutes past midnight. The face reads the clock and the weather store and hands them over:

```c
const struct tm *t = time_store_tm();
int now = t->tm_hour * 60 + t->tm_min;
int rise = weather_store_sunrise();
int set = weather_store_sunset();

bool is_sunrise;
int minutes = solar_next_event(rise, set, now, &is_sunrise);

if (minutes >= 0)
{
    char text[12];
    duration_hm_compact(text, sizeof(text), minutes);  // such as "4h 0m"
    // and a sunrise or a sunset icon beside it, from is_sunrise
}
```

`duration_hm_compact` is covered in [Dates and Durations](dates-and-durations.md).
