/**
 * @file vibe.c
 * @brief The haptic feedback wrapper implementation.
 *
 * @ingroup lib_system
 */
#include "system/vibe/vibe.h"

#include "system/settings/settings.h"
#include "system/settings/setting_values.h"

#include "io/stores/health_store.h"
#include "io/stores/time_store.h"

#include "clock/hour_latch.h"
#include "health/goal_latch.h"
#include "health/goal_vibe_pattern.h"
#include "health/goals.h"

static HourLatch s_hour_latch = HOUR_LATCH_EMPTY;  ///< the hour the hourly buzz last fired for
static bool s_hourly_seeded;                        ///< whether the first call has remembered its hour
static GoalLatch s_goal_latch = GOAL_LATCH_EMPTY;  ///< the goals the goal buzz has already met today

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

/**
 * @brief Plays a list of milliseconds such as "100,80,300". A list with no numbers stays silent.
 *
 * @param text The list.
 */
static void play_goal_pattern(const char *text)
{
    // the firmware copies each step into its own queue as the pattern is queued, so the buffer only
    // has to last for the call. it stays static to keep 160 bytes off the stack
    static uint32_t steps[GOAL_VIBE_PATTERN_MAX];
    int count = goal_vibe_pattern_parse(text, steps, GOAL_VIBE_PATTERN_MAX);

    if (count > 0)
    {
        vibe_custom(steps, (uint32_t)count);
    }
}

/**
 * @brief The goal the wearer picked for one setting, or 0 when the face does not keep that setting.
 *
 * @param id The goal's setting, such as SETTING_GOAL_STEPS.
 * @param lookup The table lookup that turns its menu choice into the goal, such as goals_steps.
 * @return The goal, or 0 for none.
 */
static int goal_target(SettingId id, int (*lookup)(uint8_t index))
{
    return settings_enum_count(id) ? lookup(settings_u8(id)) : 0;
}

void vibe_goal(void)
{
    const char *pick = settings_str(SETTING_GOAL_VIBE);
    GoalVibeKind kind = goal_vibe_pattern_kind(pick);

    // None turns the buzz off, and the latch is left as it was
    if (kind == GOAL_VIBE_KIND_NONE)
    {
        return;
    }

    const int readings[GOAL_LATCH_COUNT] = {
        [GOAL_LATCH_STEPS] = health_store_steps(),
        [GOAL_LATCH_CALORIES] = health_store_calories(),
        [GOAL_LATCH_DISTANCE] = health_store_distance_m(),
        [GOAL_LATCH_ACTIVE] = health_store_active_min(),
    };
    // a goal the face does not keep has no entry, which settings_enum_count reads as 0
    // the latch takes a target of 0 as no goal, so that reading never buzzes
    const int targets[GOAL_LATCH_COUNT] = {
        [GOAL_LATCH_STEPS] = goal_target(SETTING_GOAL_STEPS, goals_steps),
        [GOAL_LATCH_CALORIES] = goal_target(SETTING_GOAL_CALORIES, goals_calories),
        [GOAL_LATCH_DISTANCE] = goal_target(SETTING_GOAL_DISTANCE, goals_distance_m),
        [GOAL_LATCH_ACTIVE] = goal_target(SETTING_GOAL_ACTIVE, goals_active_min),
    };

    // one buzz however many goals were met on this reading
    if (goal_latch_update(&s_goal_latch, time_store_tm()->tm_yday, readings, targets) == 0)
    {
        return;
    }

    switch (kind)
    {
        case GOAL_VIBE_KIND_SHORT:  vibe_pulse(VibePulseShort);  break;
        case GOAL_VIBE_KIND_LONG:   vibe_pulse(VibePulseLong);   break;
        case GOAL_VIBE_KIND_DOUBLE: vibe_pulse(VibePulseDouble); break;
        // a face with no custom entry reads it as empty text, which plays nothing
        case GOAL_VIBE_KIND_CUSTOM: play_goal_pattern(settings_str(SETTING_GOAL_VIBE_CUSTOM)); break;
        case GOAL_VIBE_KIND_LIST:   play_goal_pattern(pick); break;
        case GOAL_VIBE_KIND_NONE:   break;
    }
}
