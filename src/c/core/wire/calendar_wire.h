/**
 * @file calendar_wire.h
 * @brief The agenda as the phone packs it, and the reader that unpacks it.
 *
 * The phone sends the agenda as one run of bytes with the events laid end to end, each carrying
 * its own lengths. Nothing about it is fixed width, so the reader walks it and checks every step
 * against the length it was handed. The bytes come off a phone, so none of it is trusted: the
 * lengths are the phone's word for how long things are and the room is ours.
 *
 * The packer on the other side is lib/ts/pkjs/wire.ts, and the two have to agree exactly.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <time.h>

/**
 * @addtogroup lib_core
 * @{
 */

// CALENDAR_MAX_SLOTS, CAL_TITLE_LEN and CAL_LOC_LEN are generated from the phone's cap table, so
// the two sides of the strip cannot drift
#include "wire/wire_caps.g.h"

/**
 * @brief One event. start and end are absolute epochs so the readouts stay fresh against the
 * watch's own clock. The phone fills end with a sensible default when the feed omits DTEND.
 */
typedef struct
{
    time_t start;                 ///< Absolute epoch of the event start
    time_t end;                   ///< Absolute epoch of the event end so we can show how long it runs
    bool   all_day;               ///< True shows a weekday or date instead of a time
    char   title[CAL_TITLE_LEN];  ///< The event summary, or empty when there is none
    char   location[CAL_LOC_LEN]; ///< The place, or empty when there is none
} CalendarEvent;

/** @brief The agenda strip. count is 0 until a reading lands. */
typedef struct
{
    uint8_t       count;                   ///< How many events are filled (0 means none yet)
    CalendarEvent event[CALENDAR_MAX_SLOTS]; ///< The event slots, filled up to count
} CalendarStrip;

/**
 * @brief Unpacks an agenda off the wire.
 *
 * Layout is [count] then per event [start int32 LE][end int32 LE][flags bit0=allDay][titleLen]
 * [title bytes][locLen][loc bytes]. A count past what the strip holds is pinned to it rather than
 * walking off the end.
 *
 * Nothing is written to @p out until the whole run reads clean, so a message that stops halfway
 * leaves the caller's last good agenda alone rather than half replacing it.
 *
 * @param buf The raw wire bytes.
 * @param len How many bytes there are.
 * @param[out] out Receives the agenda. Untouched unless this returns true.
 * @return Whether the run read clean.
 */
bool calendar_wire_decode(const uint8_t *buf, uint16_t len, CalendarStrip *out);

/** @} */
