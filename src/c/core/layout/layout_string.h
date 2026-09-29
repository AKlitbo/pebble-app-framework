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

/// The biggest number a layout field holds. Nothing the builder writes comes close
#define LAYOUT_INT_MAX 9999

/**
 * @brief Reads a run of digits and moves the cursor past them.
 *
 * A number past LAYOUT_INT_MAX comes back as -1 rather than overflowing, since only a corrupt
 * string holds one. Its digits are still skipped, so the cursor lands on the next field either way.
 *
 * @param cursor The cursor, moved past the digits.
 * @return The value read, 0 when there are no digits, or -1 when it is too big.
 */
int layout_parse_int(const char **cursor);

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
