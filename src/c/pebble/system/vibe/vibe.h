/**
 * @file vibe.h
 * @brief The haptic feedback wrapper.
 *
 * @ingroup lib_system
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_system
 * @{
 */

/**
 * @brief Defines the available haptic pulse patterns.
 */
typedef enum
{
    VibePulseShort,  ///< A single short pulse
    VibePulseLong,   ///< A single long pulse
    VibePulseDouble, ///< Two short pulses
} VibePulse;

/**
 * @brief Fire a pulse unless in quiet time.
 *
 * @param pulse The pulse pattern to fire.
 */
void vibe_pulse(VibePulse pulse);

/**
 * @brief Buzz a custom on and off rhythm unless in quiet time. The durations are milliseconds
 * that alternate buzz then pause then buzz and so on, starting on a buzz. Lets a caller play a
 * little tune that the three canned pulses cannot.
 *
 * The firmware copies each duration into its own vibe queue when the pattern is queued, so the
 * array only has to last for the call. A stack array is fine.
 *
 * @param durations The on and off times in milliseconds. The first entry is a buzz.
 * @param num_segments How many entries the durations array has.
 */
void vibe_custom(const uint32_t *durations, uint32_t num_segments);

/**
 * @brief Fire the pattern named by a VibeChoice (VIBE_NONE stays silent). The caller resolves
 * the choice from wherever it likes, so the lib never has to know which setting it came from.
 *
 * @param choice A VibeChoice value (VIBE_NONE / VIBE_SHORT / VIBE_LONG / VIBE_DOUBLE).
 */
void vibe_choice(uint8_t choice);

/**
 * @brief The default bluetooth-transition buzz: fire the pattern the user picked in settings
 * for a connect or disconnect. A face installs this as system_store's vibe policy so the
 * store itself never has to know about settings or buzzing.
 *
 * @param connected True when the link just came up, false when it just dropped.
 */
void vibe_bt_transition(bool connected);

/**
 * @brief Buzz once at the top of each hour. A face calls this from its time callback on every
 * tick, and it buzzes on the first tick of each hour's minute 0.
 *
 * More than one ticker can tick inside minute 0, so it remembers when the hour that last buzzed
 * began and buzzes each real hour once, including the hour the clocks repeat when they fall back.
 * On a .beats clock the face sets hourly in its TimeConfig, so a tick lands in minute 0 at all.
 *
 * The first call after launch only remembers its hour. Subscribing to a tick sends one tick
 * straight away, so a face opened in minute 0 would otherwise buzz an hour that already buzzed
 * before the wearer left it. A face that was not running at the top of the hour, such as one
 * closed for an app, then stays silent until the next hour, which beats a second buzz on every
 * return in minute 0.
 *
 * @param tick The time of the tick, normally time_store_tm().
 * @param choice A VibeChoice value, normally the Hourly Vibration setting. VIBE_NONE stays silent.
 */
void vibe_hourly(const struct tm *tick, uint8_t choice);

/**
 * @brief Buzz the first time each day a movement goal is met. A face calls this once at startup, after
 * both health_store_init and time_store_init, and from its health store callback on every reading.
 *
 * health_store_init reads the totals without calling the callback, so without the startup call the
 * first check would wait for the next changed reading. A relaunch within about a minute's walk of a
 * goal would then check first with the goal already past, and lose that day's buzz. The startup call
 * records the reading below the goal, so the buzz is kept. It has to come after time_store_init too,
 * since each reading is filed under the day the time store reads, and before it starts that day reads
 * as 0, so the next call clears what the startup call recorded.
 *
 * It watches steps, calories, distance, and active minutes against the goals the wearer picked, and
 * plays the Goal Met Vibration once per goal per day. Two goals met on one reading give one buzz. A
 * goal only buzzes once a reading below it has been seen that day, so reopening the face on a goal
 * already met stays quiet, and so does yesterday's total landing just after midnight. The decision
 * lives in `health/goal_latch.h` in the core.
 *
 * It reads the goals and the pick through the `KNOWN_GOAL_*` entries, the readings from the health
 * store, and the day from the time store. While the pick is None it returns before anything else,
 * and it only reads a pattern on the call that buzzes, so a call on every reading costs little. The
 * health store only reads calories, active minutes, and distance for a face that turns them on in
 * its HealthConfig, so those goals never buzz on a face that leaves them off. A goal whose
 * `KNOWN_GOAL_*` entry the face leaves out never buzzes either. A Custom pick on a face with no
 * `KNOWN_GOAL_VIBE_CUSTOM` reads an empty pattern and stays quiet.
 */
void vibe_goal(void);

/** @} */
