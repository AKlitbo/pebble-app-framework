/**
 * @file beats.c
 * @brief Pure swatch .beats math, host-testable off-device.
 *
 * @ingroup lib_core
 */
#include "clock/beats.h"
#include "math/scale.h"

#include <string.h>

int beats_from_ms(int32_t ms_into_bmt_day)
{
    if (ms_into_bmt_day < 0)
    {
        ms_into_bmt_day = 0;
    }

    return (int)((ms_into_bmt_day % MS_PER_DAY) / MS_PER_BEAT);
}

uint32_t ms_until_next_beat(int32_t ms_into_bmt_day)
{
    if (ms_into_bmt_day < 0)
    {
        ms_into_bmt_day = 0;
    }

    // ms position within the current beat
    int32_t into_beat = ms_into_bmt_day % MS_PER_BEAT;

    // result runs 1..MS_PER_BEAT and never hits 0
    // right on a boundary we report a full beat to the next flip
    return (uint32_t)(MS_PER_BEAT - into_beat);
}

int32_t beats_ms_from_hms(int hour, int minute, int second, uint16_t ms)
{
    int32_t secs = hour * SECS_PER_HOUR + minute * SECS_PER_MIN + second;

    // caps just under a day of ms (86.4 million) so int32 holds it exactly
    return (((secs + BMT_UTC_OFFSET_S) % SECS_PER_DAY) * MS_PER_SEC) + ms;
}

/**
 * Where the first .beats token starts in a string, or -1 when there is none. The token is three
 * fixed characters, so a plain walk finds it with strncmp, which the firmware already exports.
 * strstr is not exported, so it would link about 1.4 KB of newlib into every face that references
 * the date readout.
 *
 * @param text The string to search.
 * @return The offset of the first token, or -1 when there is none.
 */
static int token_at(const char *text)
{
    for (int at = 0; text[at]; at++)
    {
        // only a brace can start the token, so most characters skip the call
        if (text[at] == BEATS_TOKEN[0] && strncmp(text + at, BEATS_TOKEN, BEATS_TOKEN_LEN) == 0)
        {
            return at;
        }
    }

    return -1;
}

bool beats_has_token(const char *format)
{
    return format && token_at(format) >= 0;
}

void beats_expand_token(char *text, int beats)
{
    if (!text)
    {
        return;
    }

    // clamped so the reading is always three digits, which is what lets the swap happen in place
    beats = clamp_int(beats, 0, 999);

    // written by hand rather than with snprintf, which would want a buffer sized for any int and
    // then warn about truncating one down to three
    char digits[BEATS_TOKEN_LEN];
    digits[0] = (char)('0' + (beats / 100));
    digits[1] = (char)('0' + (beats / 10) % 10);
    digits[2] = (char)('0' + (beats % 10));

    for (int at = token_at(text); at >= 0; text += at + BEATS_TOKEN_LEN, at = token_at(text))
    {
        memcpy(text + at, digits, BEATS_TOKEN_LEN);
    }
}
