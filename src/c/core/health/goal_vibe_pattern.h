/**
 * @file goal_vibe_pattern.h
 * @brief Reads the Goal Met Vibration pick, and turns a comma list of milliseconds into a rhythm the
 * watch can buzz.
 *
 * The tune comes from the settings page, not the watch. The pick is a short string: empty for None,
 * one letter for a plain pulse (S, L, or D), C for the wearer's own pattern, or a comma list of
 * milliseconds for a fanfare. So the watch carries no tune tables of its own.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

#define GOAL_VIBE_PATTERN_MAX     40     ///< The most steps a pattern plays. Any past it are dropped
#define GOAL_VIBE_PATTERN_MIN_MS  10     ///< The shortest step, so a 0 still buzzes or pauses a moment
#define GOAL_VIBE_PATTERN_MAX_MS  10000  ///< The longest step the firmware plays

/**
 * @brief What a Goal Met Vibration pick plays.
 */
typedef enum
{
    GOAL_VIBE_KIND_NONE,    ///< Nothing, the pick is empty
    GOAL_VIBE_KIND_SHORT,   ///< The watch's short pulse, from S
    GOAL_VIBE_KIND_LONG,    ///< The watch's long pulse, from L
    GOAL_VIBE_KIND_DOUBLE,  ///< The watch's double pulse, from D
    GOAL_VIBE_KIND_CUSTOM,  ///< The wearer's own pattern, from C
    GOAL_VIBE_KIND_LIST,    ///< The pick itself, as a comma list of milliseconds
} GoalVibeKind;

/**
 * @brief What a pick plays, read from its first character.
 *
 * Only the first character counts, so anything that opens on S, L, D, or C plays that, and anything
 * else is read as a list of milliseconds.
 *
 * @param pick The Goal Met Vibration setting, or NULL.
 * @return What the pick plays. Empty or NULL is GOAL_VIBE_KIND_NONE.
 */
GoalVibeKind goal_vibe_pattern_kind(const char *pick);

/**
 * @brief Reads a list of milliseconds such as "100,80,300" into the caller's buffer.
 *
 * Any character that is not a digit ends a number, so commas, spaces, and anything else all work as
 * separators, and a run of them adds nothing. Each number is held to GOAL_VIBE_PATTERN_MIN_MS and
 * GOAL_VIBE_PATTERN_MAX_MS, and a run of digits too long for a number reads as the longest step
 * rather than wrapping round. Numbers past the buffer's room are dropped.
 *
 * @param text The list, or NULL.
 * @param[out] out Where the steps go, starting on a buzz and then turning between pause and buzz.
 * @param capacity How many steps out holds, normally GOAL_VIBE_PATTERN_MAX.
 * @return How many steps it wrote, 0 for a list with no numbers in it.
 */
int goal_vibe_pattern_parse(const char *text, uint32_t *out, int capacity);

/** @} */
