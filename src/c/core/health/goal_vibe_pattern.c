/**
 * @file goal_vibe_pattern.c
 * @brief The Goal Met Vibration pick and pattern reader, host-testable off-device.
 *
 * @ingroup lib_core
 */
#include "health/goal_vibe_pattern.h"

#include <stdbool.h>
#include <stddef.h>

GoalVibeKind goal_vibe_pattern_kind(const char *pick)
{
    if (pick == NULL)
    {
        return GOAL_VIBE_KIND_NONE;
    }

    switch (pick[0])
    {
        case '\0': return GOAL_VIBE_KIND_NONE;
        case 'S':  return GOAL_VIBE_KIND_SHORT;
        case 'L':  return GOAL_VIBE_KIND_LONG;
        case 'D':  return GOAL_VIBE_KIND_DOUBLE;
        case 'C':  return GOAL_VIBE_KIND_CUSTOM;
        default:   return GOAL_VIBE_KIND_LIST;
    }
}

/**
 * @brief A step held to what the firmware plays.
 *
 * @param value The step as written.
 * @return The step, from GOAL_VIBE_PATTERN_MIN_MS to GOAL_VIBE_PATTERN_MAX_MS.
 */
static uint32_t clamp_step(uint32_t value)
{
    if (value < GOAL_VIBE_PATTERN_MIN_MS)
    {
        return GOAL_VIBE_PATTERN_MIN_MS;
    }

    if (value > GOAL_VIBE_PATTERN_MAX_MS)
    {
        return GOAL_VIBE_PATTERN_MAX_MS;
    }

    return value;
}

int goal_vibe_pattern_parse(const char *text, uint32_t *out, int capacity)
{
    if (text == NULL)
    {
        return 0;
    }

    int count = 0;
    uint32_t value = 0;
    bool have = false;

    for (const char *at = text;; at++)
    {
        if (*at >= '0' && *at <= '9')
        {
            // a number already past the longest step is clamped to it anyway, so more digits are
            // left off rather than wrapping the value round to something short
            if (value <= GOAL_VIBE_PATTERN_MAX_MS)
            {
                value = value * 10 + (uint32_t)(*at - '0');
            }
            have = true;
            continue;
        }

        if (have && count < capacity)
        {
            out[count++] = clamp_step(value);
        }
        value = 0;
        have = false;

        if (*at == '\0')
        {
            break;
        }
    }

    return count;
}
