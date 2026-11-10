/**
 * @file phone_level.h
 * @brief Reads the phone's battery level as the phone sends it.
 *
 * The phone sends `PHONE_BATTERY` as a whole percent, or -1 when it has no reading. The number comes
 * off a phone, so it is not trusted: anything below 0 is no reading and anything past 100 is full,
 * which keeps a battery readout or a bar from drawing past either end.
 *
 * The sender on the other side is ts/plugin-sources/phone.ts, through the phone battery feature.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

/// The level for no reading, on the wire and in the store
#define PHONE_NO_LEVEL (-1)

/**
 * @brief Reads one level off the wire.
 *
 * @param sent The number the phone sent.
 * @return The level from 0 to 100, or PHONE_NO_LEVEL for none.
 */
static inline int phone_level_read(int32_t sent)
{
    if (sent < 0)
    {
        return PHONE_NO_LEVEL;
    }

    return sent > 100 ? 100 : (int)sent;
}

/** @} */
