/**
 * @file phone_level.h
 * @brief Reads the phone's battery level as the phone sends it.
 *
 * The phone sends `PHONE_BATTERY` as a whole percent, -1 when it has no reading yet, or -2 while no
 * plugin on the phone serves the battery. The number comes off a phone, so it is not trusted: any
 * other negative is no reading and anything past 100 is full, which keeps a battery readout or a bar
 * from drawing past either end.
 *
 * The sender on the other side is ts/plugin-sources/phone.ts, through the phone battery feature.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdint.h>

// PHONE_NO_LEVEL and WIRE_NO_PLUGIN are generated from the phone's cap table, so the two sides
// cannot drift
#include "wire/wire_caps.g.h"

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Reads one level off the wire.
 *
 * @param sent The number the phone sent.
 * @return The level from 0 to 100, WIRE_NO_PLUGIN while no plugin serves the battery, or
 *   PHONE_NO_LEVEL for no reading.
 */
static inline int phone_level_read(int32_t sent)
{
    if (sent == WIRE_NO_PLUGIN)
    {
        return WIRE_NO_PLUGIN;
    }

    if (sent < 0)
    {
        return PHONE_NO_LEVEL;
    }

    return sent > 100 ? 100 : (int)sent;
}

/** @} */
