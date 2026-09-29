/**
 * @file zone_setting.c
 * @brief Reads a time zone setting the way the phone sends it.
 *
 * @ingroup lib_core
 */
#include "clock/zone_setting.h"

#include <stdlib.h>
#include <string.h>

bool zone_setting_is_set(const char *value)
{
    return value && value[0] != '\0';
}

int16_t zone_setting_offset(const char *value)
{
    // atoi stops at the comma, so it reads the minutes and nothing after them
    return zone_setting_is_set(value) ? (int16_t)atoi(value) : 0;
}

const char *zone_setting_label(const char *value)
{
    const char *comma = value ? strchr(value, ',') : NULL;
    return comma ? comma + 1 : "";
}
