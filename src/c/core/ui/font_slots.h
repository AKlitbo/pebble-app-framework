/**
 * @file font_slots.h
 * @brief The decisions behind the font registry: who owns each slot's font, when a swap has
 * nothing to do, and when a font can be freed.
 *
 * The registry in `ui/fonts.c` keeps the tables and hands in the SDK's load and unload calls, so
 * everything that decides whether a font is freed runs here, off the watch. Freeing the wrong font
 * leaves another slot drawing with memory that is gone, and freeing none leaks a font a swap at a
 * time, and neither shows until the heap runs out.
 *
 * A handle is a plain pointer here, since this file cannot see `GFont`. Each slot carries a state
 * beside its handle. Every write to a slot sets that state, so a record of where a font came from
 * only lasts while the slot still holds that font, and a freed handle whose address comes back for
 * another font is never mistaken for the old one.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief What a slot holds and who frees it. Kept in a `uint8_t` a slot.
 */
typedef enum
{
    FONT_SLOT_UNOWNED, ///< Empty, or a system font the firmware owns and the app never frees
    FONT_SLOT_OWNED,   ///< A font the app loaded and registered itself, freed by the registry
    FONT_SLOT_LOADED,  ///< A font loaded from the resource the slot records, freed by the registry
} FontSlotState;

/**
 * @brief The registry's tables, one entry a slot in each.
 */
typedef struct
{
    void **handles;  ///< The font in each slot, NULL for an empty one
    uint8_t *states; ///< A FontSlotState for each slot
    int count;       ///< How many slots both tables hold
} FontSlots;

/**
 * @brief Loads a font from its resource.
 *
 * @param resource The font's resource id.
 * @return The loaded font, or NULL when it did not load.
 */
typedef void *(*FontSlotLoad)(uint32_t resource);

/**
 * @brief Frees a font the app loaded.
 *
 * @param handle The font to free.
 */
typedef void (*FontSlotUnload)(void *handle);

/**
 * @brief Puts a font in a slot, overwriting whatever it held without freeing it.
 *
 * @param slots The registry's tables.
 * @param id The slot. One outside the tables is ignored.
 * @param handle The font.
 * @param owned true for a font the app loaded, which the registry frees, false for a system font.
 */
void font_slots_put(const FontSlots *slots, int id, void *handle, bool owned);

/**
 * @brief Loads a font into a slot and records the resource it came from.
 *
 * Like font_slots_put, it overwrites the slot without freeing what it held. A load that fails
 * leaves the slot empty.
 *
 * @param slots The registry's tables.
 * @param resources One resource id a slot. Only this and font_slots_swap read or write it, so a
 *   face that never calls either keeps the table out of its build.
 * @param id The slot.
 * @param resource The font's resource id.
 * @param load The call that loads a font.
 * @return true when the font loaded, false when it did not or the slot is outside the tables.
 */
bool font_slots_load(const FontSlots *slots, uint32_t *resources, int id, uint32_t resource,
                     FontSlotLoad load);

/**
 * @brief Swaps a slot's font for another resource, freeing the old one when nothing else holds it.
 *
 * It does nothing when the slot holds a font it loaded from that same resource. Otherwise it lets go
 * of the old font and loads the new one as font_slots_load does. Letting go frees the old font only
 * when the app owns it and no other slot holds it. When another slot the app owns holds it too,
 * that slot keeps it. When the only other holders were put in as system fonts, the first of them
 * takes over owning it, so it is still freed once at the end and never while one is drawing with it.
 *
 * @param slots The registry's tables.
 * @param resources One resource id a slot.
 * @param id The slot.
 * @param resource The font's resource id.
 * @param load The call that loads a font.
 * @param unload The call that frees a font.
 * @return true when the slot holds a font from that resource afterwards, false when the load
 *   failed or the slot is outside the tables.
 */
bool font_slots_swap(const FontSlots *slots, uint32_t *resources, int id, uint32_t resource,
                     FontSlotLoad load, FontSlotUnload unload);

/**
 * @brief Frees every font the app owns, each one once, and empties every slot.
 *
 * @param slots The registry's tables.
 * @param unload The call that frees a font.
 */
void font_slots_unload_all(const FontSlots *slots, FontSlotUnload unload);

/** @} */
