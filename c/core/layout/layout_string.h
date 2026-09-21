/**
 * @file layout_string.h
 * @brief Reading a layout wire string without parsing the whole thing.
 *
 * A layout reaches the watch as a run of records separated by semicolons, each starting with the
 * module that goes there. Before any of it is worth parsing, something has to answer whether the
 * string holds anything at all, because a face that swaps between layouts has to know which of
 * them are real and which are empty.
 *
 * The bound on a module number comes in from the caller, since each family of faces has its own
 * catalog. Nothing here touches a watch, which is what keeps it host-testable.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Whether a layout string holds at least one placeable block.
 *
 * One test covers the ways a layout can be nothing: the "0" sentinel a cleared grid is sent as,
 * an empty string, and whatever a corrupt blob left behind. A record naming a module the catalog
 * does not have is not placeable either, so it does not count.
 *
 * @param layout The wire string, or NULL.
 * @param type_count How many module numbers the caller's catalog has, so anything at or past it
 * is junk.
 * @return True when at least one record names a real module.
 */
bool layout_has_any_block(const char *layout, int type_count);

/** @} */
