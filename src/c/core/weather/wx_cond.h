/**
 * @file wx_cond.h
 * @brief The condition token the phone sends, as a number a face can index its own art by.
 *
 * The phone sends the sky as a short token, such as "RAIN", with "_NIGHT" on the end after dark.
 * A face that draws its own art for each condition keeps a table indexed by WxCond and reads the
 * token through wx_cond_parse. The numbers and tokens come from the same list the phone sends from,
 * so the two cannot drift.
 *
 * The face builds the table from WX_COND_EACH rather than writing its rows out. Each condition's
 * row then names a resource after the condition, so a condition added to the list stops the
 * face's build on a resource it has not got, wherever in the list it lands.
 *
 * @code
 * #define SKY_ART(name) [WX_COND_##name] = RESOURCE_ID_SKY_##name,
 * static const uint32_t s_art[WX_COND_COUNT] = {WX_COND_EACH(SKY_ART)};
 *
 * bool night;
 * WxCond cond = wx_cond_parse(weather_store_cond(), &night);
 * uint32_t art = cond < WX_COND_COUNT ? s_art[cond] : RESOURCE_ID_SKY_NA;
 * @endcode
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>

#include "weather/wx_cond.g.h"

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Finds the condition for a token, with or without its "_NIGHT" ending.
 *
 * The match is exact and minds case, the same as the icon lookup, so "rain" or "RAINY" reads as
 * unknown.
 *
 * @param token The token, such as "RAIN" or "RAIN_NIGHT". NULL or empty reads as unknown.
 * @param night Set to whether the token ended in "_NIGHT", and false for an unknown one. May be NULL.
 * @return The condition, or WX_COND_UNKNOWN for a token the list does not hold.
 */
WxCond wx_cond_parse(const char *token, bool *night);

/** @} */
