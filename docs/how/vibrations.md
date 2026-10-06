# Vibrations

A face built on the framework can buzz the wrist at the top of each hour, when the phone connects, and when it drops. The wearer picks the buzz for each on the settings page from the same choices, None, Short, Long, or Double. Every buzz the framework plays stays silent during Quiet Time, so a phone dropping in and out overnight never buzzes through it.

It lives in [`vibe.h`](../../src/c/pebble/system/vibe/vibe.h) and [`vibe.c`](../../src/c/pebble/system/vibe/vibe.c) under `src/c/pebble/system/vibe/`.

## The Choices

The settings page offers each vibration as a select with the values 0 to 3, and the watch reads the same numbers:

| Choice | Value | What It Plays |
| :-- | :-- | :-- |
| None | 0 | nothing |
| Short | 1 | the watch's short pulse, about 250 ms |
| Long | 2 | the watch's long pulse, about 500 ms |
| Double | 3 | the watch's double pulse, two buzzes of about 100 ms |

Each one is the watch's own pulse rather than a pattern of the framework's, so it matches the buzzes the rest of the watch makes.

`vibe_choice` plays the pattern for a value, and anything other than 1 to 3 is silent. Every vibration setting starts at None on a fresh install, so a face only buzzes once the wearer asks it to. A value out of range from the phone goes back to the default when it lands (see [Settings on the Watch](settings-on-the-watch.md#taking-values-from-the-phone)), which is None again. A face whose settings leave a vibration setting out reads it as None too.

## Quiet Time

The watch's firmware does not silence an app's buzz during Quiet Time. It plays whatever the app asks for. So `vibe_pulse` and `vibe_custom` check `quiet_time_is_active` first and return without a sound while it is on. Every buzz the framework plays goes through one of them.

The cost is that a face cannot use these calls for a buzz that has to get through, such as an alarm. A face that needs one calls the SDK's `vibes_` functions directly.

**A Buzz While Another Plays.** The firmware drops a pattern asked for while another is still playing rather than queueing it behind. An hourly buzz landing in the same moment as a disconnect gives one buzz, not two.

## Phone Connect and Disconnect

The system store watches the link to the Pebble app on the phone and calls the face's buzz policy on a real change, never on its first reading at launch (see [The System Store](system-store.md#the-phone-connection)). `vibe_bt_transition` is the framework's own policy:

```c
system_store_init((SystemConfig){.live = true, .vibe = vibe_bt_transition}, NULL);
```

It reads Vibrate on Connect or Vibrate on Disconnect, whichever fits, and plays it through `vibe_choice`. Both rows sit in the Bluetooth section that every settings page built with `buildConfig` carries. It reads the setting at the moment it buzzes, so a change on the settings page takes effect without telling the store. Like every buzz here, it stays silent in Quiet Time, so a phone drifting in and out of range at night never buzzes the wearer awake.

## On the Hour

The framework provides the hourly setting but not a timer for it, since the face already has one. The time store calls the face on every tick (see [The Time Store](time-store.md)). The settings page shows an Hourly Vibration row in the Clock section when the face passes `hourlyVibe` to `buildConfig`, and the watch side is the `KNOWN_HOURLY_VIBE` entry in `settings_catalog.h`. The face plays it from its time callback when the minute is 0:

```c
static void on_time_changed(void)
{
    static int s_buzzed_hour = -1;
    const struct tm *now = time_store_tm();

    if (now->tm_min == 0 && now->tm_hour != s_buzzed_hour)
    {
        s_buzzed_hour = now->tm_hour;
        vibe_choice(settings_u8(SETTING_HOURLY_VIBE));
    }

    engine_mark_dirty();
}
```

**Once per Hour.** The time callback runs on the minute tick, and on each beat as well when the face shows .beats (see [.beats](beats.md)), so the check for minute 0 can pass twice in the same minute. Remembering the hour that buzzed keeps it to one buzz.

**Keep the Minute Tick On.** A face that turns the minute tick off and runs only the beat timer is called every 86.4 seconds, so it only gets a call during minute 0 when a beat happens to turn over in it. In a time zone a whole number of hours from UTC that happens every hour. In one that sits half an hour or 45 minutes off, such as India or Nepal, one hour in three has no beat in its first minute and passes without a buzz.

## Playing Your Own Rhythm

`vibe_custom` plays a face's own pattern, a list of milliseconds that starts with a buzz and then switches between pause and buzz. It stays silent in Quiet Time like the rest. A face can use it for something the choices do not cover, such as a little celebration when a step goal is met. The firmware caps each step at 10 seconds.
