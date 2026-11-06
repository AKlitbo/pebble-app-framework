/**
 * @file hrv_log.h
 * @brief The heart rate variability readings kept for a face's panels: the last few with what the
 * wearer was doing, today by the hour, last night's average, and the latest of each kind.
 *
 * The health store files every finished reading here and saves the lot to flash, so a face opened
 * again after an app still has its history. Plain C with no SDK, so its specs run on a PC. The
 * caller passes the time already broken into a day and a minute, so a clock change or a time zone
 * is decided once, where the clock is read.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

#define HRV_LOG_SLOTS 24        ///< How many of the latest readings the history keeps
#define HRV_LOG_HOURS 24        ///< Today's readings by the hour from midnight
#define HRV_LOG_MS_MAX 255      ///< Readings above this are kept as this, which fits one byte
#define HRV_LOG_NIGHT_GAP_MIN 720 ///< Twelve hours awake starts a new night
#define HRV_LOG_NAP_FROM_MIN 720   ///< From noon, a reading taken asleep is a nap's
#define HRV_LOG_NAP_UNTIL_MIN 1260 ///< Until 21:00, a reading taken asleep is a nap's
#define HRV_WALK_STEPS_DEFAULT 10 ///< Steps through a burst that make it a walk, when a face sets none

/**
 * @brief What the wearer was doing through a reading's burst.
 */
typedef enum
{
    HRV_STATE_STILL,   ///< The wrist moved no more than the face's still limit, and no walk
    HRV_STATE_BUSY,    ///< The wrist moved more, such as eating or a mouse and keyboard, but no walk
    HRV_STATE_WALKING, ///< The face's walking step count or more through the burst
    HRV_STATE_COUNT
} HrvState;

/**
 * @brief Which bursts count for the main reading. The first is the one a face gets when it sets none.
 */
typedef enum
{
    HRV_COUNT_NOT_WALKING, ///< Still and busy bursts count, walking ones do not
    HRV_COUNT_STILL,       ///< Only still bursts count
    HRV_COUNT_ANY,         ///< Every burst counts
} HrvCount;

#define HRV_RECENT 6  ///< How many of the latest bursts a tuning panel can see

/**
 * @brief One burst as a tuning panel shows it: what the wearer did and what came of it.
 *
 * Kept in memory only, since it is for watching the numbers while moving, not for history.
 */
typedef struct
{
    uint32_t at_sec;  ///< When the burst ended, in seconds, or 0 for an empty slot
    int16_t ms;       ///< Its reading in ms, or -1 when it was dropped or gave none
    int16_t score;    ///< Its movement score, or -1 when there was none
    int16_t steps;    ///< Its steps, or -1 when not known
    uint8_t state;    ///< Its HrvState
    uint8_t kept;     ///< How many beat to beat differences went into its reading
    uint8_t gaps;     ///< How many gaps it heard after the settle
    bool counted;     ///< Whether it became the main reading
} HrvBurst;

/**
 * @brief The readings kept, in the shape that goes to flash. Start it with hrv_log_reset.
 *
 * Every field is a fixed width and the larger ones come first, so the layout is the same on the
 * watch and in a spec, and the whole of it fits one persist slot.
 */
typedef struct
{
    uint32_t at_min[HRV_LOG_SLOTS];      ///< When each kept reading was taken, in minutes, or 0 for an empty slot
    uint32_t state_at_min[HRV_STATE_COUNT]; ///< When the latest reading of each kind was taken, or 0 for none
    uint32_t night_last_min;             ///< When the last reading taken asleep came, or 0 for none
    int32_t today;                       ///< The day the hourly totals belong to
    uint16_t hour_sum[HRV_LOG_HOURS];    ///< Today's resting readings added up by the hour
    uint16_t night_sum;                  ///< The readings taken asleep this night, added up
    uint8_t ms[HRV_LOG_SLOTS];           ///< Each kept reading in ms
    uint8_t flags[HRV_LOG_SLOTS];        ///< Each kept reading's HrvState, plus HRV_LOG_ASLEEP
    uint8_t hour_count[HRV_LOG_HOURS];   ///< How many readings went into each hour's total
    uint8_t state_ms[HRV_STATE_COUNT];   ///< The latest reading of each kind in ms
    uint8_t night_count;                 ///< How many readings went into the night's total
    uint8_t head;                        ///< The slot the next reading goes in
} HrvLog;

#define HRV_LOG_ASLEEP 0x80   ///< Set in a reading's flags when Pebble said the wearer was asleep
#define HRV_LOG_STATE_MASK 0x0F ///< The bits of a reading's flags that hold its HrvState

/**
 * @brief Empties the log.
 *
 * @param log The log to empty.
 */
void hrv_log_reset(HrvLog *log);

/**
 * @brief Works out what a burst was from its steps and its movement score.
 *
 * Steps decide walking, since Pebble's step counter only counts a stepping rhythm and leaves out
 * a busy wrist that is not walking. The score then splits still from busy.
 *
 * @param motion_score The burst's score from hrv_motion_score, or -1 when there was none.
 * @param steps The steps taken through the burst, or a negative number when they are not known.
 * @param still_mg The most the wrist may move for the burst to be still, in milli-g a sample.
 * @param walk_steps The steps through a burst that make it a walk.
 * @return The state. A burst with no score and no steps known counts as still, since nothing said it moved.
 */
HrvState hrv_log_state_of(int motion_score, int steps, uint16_t still_mg, uint16_t walk_steps);

/**
 * @brief Whether a burst in one state counts for the main reading.
 *
 * @param state What the wearer was doing.
 * @param count Which bursts count.
 * @return True when it counts.
 */
bool hrv_log_counts(HrvState state, HrvCount count);

/**
 * @brief Files one finished reading.
 *
 * A reading taken walking goes into the history and the latest walking reading, but not into
 * today's hours or the night, since a walking reading is not a resting one. A new day clears the
 * hours first. A reading taken asleep twelve hours or more after the last one starts a new night,
 * and one taken asleep between noon and 21:00 is a nap's, which stays out of the night.
 *
 * @param log The log to add to.
 * @param ms The reading in ms.
 * @param now_min The time now, in whole minutes.
 * @param day The day now, counting from any fixed day, so the hours know when to start over.
 * @param minute_of_day The minute of the day now, 0 to 1439.
 * @param state What the wearer was doing.
 * @param asleep Whether Pebble said the wearer was asleep.
 */
void hrv_log_add(HrvLog *log, int ms, uint32_t now_min, int32_t day, int minute_of_day, HrvState state, bool asleep);

/**
 * @brief Moves the hours on to a new day without a reading, so a day chart drawn after midnight
 * does not show yesterday as today.
 *
 * @param log The log to check.
 * @param day The day now.
 * @return True when the day changed and the hours were cleared.
 */
bool hrv_log_roll_day(HrvLog *log, int32_t day);

/**
 * @brief How many readings the history holds, up to HRV_LOG_SLOTS.
 *
 * @param log The log to read.
 * @return The count.
 */
int hrv_log_count(const HrvLog *log);

/**
 * @brief One reading from the history, newest first.
 *
 * @param log The log to read.
 * @param back 0 for the newest, 1 for the one before, and so on.
 * @param[out] ms The reading in ms.
 * @param[out] at_min When it was taken, in minutes.
 * @param[out] flags Its state, plus HRV_LOG_ASLEEP.
 * @return False when there is no reading that far back.
 */
bool hrv_log_get(const HrvLog *log, int back, int *ms, uint32_t *at_min, uint8_t *flags);

/**
 * @brief Today's average of the resting readings in one hour.
 *
 * @param log The log to read.
 * @param hour The hour from midnight, 0 to 23.
 * @return The average in ms, or -1 for an hour with none.
 */
int hrv_log_hour_avg(const HrvLog *log, int hour);

/**
 * @brief Today's resting readings summed up.
 *
 * @param log The log to read.
 * @param[out] low_ms The lowest hour's average, or -1 with none.
 * @param[out] avg_ms The average of every resting reading today, or -1 with none.
 * @param[out] high_ms The highest hour's average, or -1 with none.
 */
void hrv_log_today(const HrvLog *log, int *low_ms, int *avg_ms, int *high_ms);

/**
 * @brief The average of the readings taken asleep in the latest night.
 *
 * @param log The log to read.
 * @return The average in ms, or -1 before any reading taken asleep.
 */
int hrv_log_night_avg(const HrvLog *log);

/**
 * @brief The latest reading of one kind.
 *
 * @param log The log to read.
 * @param state Which kind.
 * @param[out] ms The reading in ms.
 * @param[out] at_min When it was taken, in minutes.
 * @return False when there has been none of that kind.
 */
bool hrv_log_last(const HrvLog *log, HrvState state, int *ms, uint32_t *at_min);

/** @} */
