/**
 * @file vibe.c
 * @brief The haptic feedback wrapper implementation.
 *
 * @ingroup lib_system
 */
#include "system/vibe/vibe.h"

#include "system/settings/settings.h"
#include "system/settings/setting_values.h"

#include "clock/hour_latch.h"

static HourLatch s_hour_latch = HOUR_LATCH_EMPTY;  ///< the hour the hourly buzz last fired for
static bool s_hourly_seeded;                        ///< whether the first call has remembered its hour

void vibe_pulse(VibePulse pulse)
{
    // respect do-not-disturb: stay silent so a flurry of events can't buzz through it
    if (quiet_time_is_active())
    {
        return;
    }

    switch (pulse)
    {
        case VibePulseShort:
            vibes_short_pulse();
            break;
        case VibePulseLong:
            vibes_long_pulse();
            break;
        case VibePulseDouble:
            vibes_double_pulse();
            break;
    }
}

void vibe_custom(const uint32_t *durations, uint32_t num_segments)
{
    // stay silent during do-not-disturb, same as vibe_pulse
    if (quiet_time_is_active())
    {
        return;
    }

    vibes_enqueue_custom_pattern((VibePattern){ .durations = durations, .num_segments = num_segments });
}

void vibe_choice(uint8_t choice)
{
    switch (choice)
    {
        case VIBE_SHORT:  vibe_pulse(VibePulseShort);  break;
        case VIBE_LONG:   vibe_pulse(VibePulseLong);   break;
        case VIBE_DOUBLE: vibe_pulse(VibePulseDouble); break;
        default: break;  // VIBE_NONE
    }
}

void vibe_bt_transition(bool connected)
{
    vibe_choice(connected ? settings_u8(SETTING_BLUETOOTH_VIBE_CONNECT)
                          : settings_u8(SETTING_BLUETOOTH_VIBE_DISCONNECT));
}

/**
 * @brief When the current local hour began.
 *
 * It reads the clock once and breaks that same reading apart. Pairing a fresh time(NULL) with an
 * older tick's minutes and seconds would give one hour two starts whenever a second turns over
 * between them.
 *
 * @return The start of the current hour, as seconds since the epoch.
 */
static time_t current_hour_start(void)
{
    time_t now = time(NULL);
    const struct tm *local = localtime(&now);

    return hour_latch_start(now, local->tm_min, local->tm_sec);
}

void vibe_hourly(const struct tm *tick, uint8_t choice)
{
    // read before localtime runs, since a tick the caller got from localtime shares its buffer
    int minute = tick->tm_min;

    if (!s_hourly_seeded)
    {
        // the first call is the tick a subscribe sends at launch, and its hour counts as buzzed
        s_hourly_seeded = true;
        hour_latch_seed(&s_hour_latch, current_hour_start());
        return;
    }

    // only minute 0 needs the clock read, so every other tick returns before it
    if (minute != 0)
    {
        return;
    }

    if (hour_latch_take(&s_hour_latch, minute, current_hour_start()))
    {
        vibe_choice(choice);
    }
}
