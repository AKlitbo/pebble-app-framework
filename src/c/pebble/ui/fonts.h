/**
 * @file fonts.h
 * @brief Font registry. A face loads its custom fonts once, each under a small integer slot id,
 * and the rest of the ui looks them up by id so layout tables can stay static, carrying an id
 * rather than a live GFont handle. The registry does not care which fonts they are. The face
 * owns the slots and what they mean. See the face's own `draw/fonts.h`. This just maps an id to
 * its handle.
 *
 * @ingroup lib_ui
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_ui
 * @{
 */

/**
 * @brief A font slot id. The face defines its slots as 0 to FONT_SLOTS_MAX-1 and the registry
 * treats the id as a plain index.
 */
typedef uint8_t FontId;

/// Registry capacity. A face can check its own count against this at build time, so adding a slot
/// past it fails the build with a clear message. A face that needs more sets it in its appinfo's
/// `defines`.
#ifndef FONT_SLOTS_MAX
#define FONT_SLOTS_MAX 24
#endif

// a FontId is a uint8_t, and the registry turns away an id past the cap, which needs one id above
// it. at 256 the SDK's -Werror stops the build on a compare that can never be true
#if FONT_SLOTS_MAX < 1 || FONT_SLOTS_MAX > 255
#error "FONT_SLOTS_MAX has to be 1 to 255"
#endif

/**
 * @brief Store a loaded font handle under its slot id.
 *
 * This is for a handle the app loaded itself with `fonts_load_custom_font`, so the registry
 * takes on freeing it in `fonts_unload_all`. A system font must go in through
 * `fonts_register_system` instead, since the app never owned it, and unloading one is a fault at
 * teardown.
 *
 * You keep the handle. Registering over a slot that already holds one just overwrites it and the
 * old font stays loaded, so a font that changes at runtime goes through `fonts_swap`, which frees
 * the old one. The same handle may safely sit in more than one slot, since `fonts_unload_all`
 * clears every copy when it frees it.
 *
 * A NULL handle goes in like any other and `fonts_get` then reads that slot as empty and hands
 * back the system font for the rest of the session. `fonts_load_custom_font` gives you NULL when
 * it cannot load the resource, so passing that straight in quietly parks you on the fallback.
 * `fonts_load` does the load and the register in one call and logs the slot when that happens.
 *
 * @param id The slot id.
 * @param handle The loaded font handle.
 */
void fonts_register(FontId id, GFont handle);

/**
 * @brief Load a custom font from its resource and register it under its slot id, in one call.
 *
 * It does what `fonts_register(id, fonts_load_custom_font(resource_get_handle(resource_id)))` does,
 * and logs the slot when the font does not load. The slot then reads as empty and `fonts_get`
 * hands back the system font, which looks fine on screen and hides the cause, so the log is the
 * only place a font that ran out of heap shows up.
 *
 * It is for the face's start-up, one call per font. Like `fonts_register` it overwrites the slot
 * and leaves any font already there loaded. A font that changes at runtime goes through
 * `fonts_swap`. The slot records the resource, so a `fonts_swap` to the same one later does nothing.
 *
 * @param id The slot id.
 * @param resource_id The font's resource, such as `RESOURCE_ID_FONT_TEKO_24`.
 * @return true when the font loaded, false when the slot fell back to the system font or the id is
 *   out of range.
 */
bool fonts_load(FontId id, uint32_t resource_id);

/**
 * @brief Swap the font in a slot for another resource, freeing the one it held.
 *
 * For a font the wearer picks, such as a header font. Call it on every settings save and it does
 * nothing when the slot already holds that resource from `fonts_load` or an earlier swap, so it
 * reloads only when the pick changed. Otherwise it frees the slot's font and loads and registers
 * the new one the way `fonts_load` does. The first call on an empty slot just loads.
 *
 * It frees the old font only when the app owns it and no other slot holds it. A system font is
 * never freed. A font another slot also owns stays loaded for that slot. A font whose only other
 * slots hold it as a system font stays loaded too, and the first of those slots takes over owning
 * it, so `fonts_unload_all` still frees it once.
 *
 * Call it only where the face rebuilds its layers straight after, as `engine_rebuild` does after a
 * settings save. A `TextLayer` keeps the font it was given, and so does any `GFont` a face copied
 * out of `fonts_get`, so either one draws with freed memory if the face swaps and does not rebuild.
 *
 * When it frees the old font, that goes before the new one loads, so the two never sit in the heap
 * together. When another slot still holds the old font, both stay loaded. A load that fails leaves
 * the slot empty, and `fonts_get` hands back the system font for it.
 *
 * A face that calls this on a slot never frees that slot's font itself, since the registry frees it
 * on the next swap or in `fonts_unload_all`, and a second free faults.
 *
 * `fonts_unload_all` frees the last font swapped in, so there is nothing to tear down. Each slot
 * records the resource its font came from, which costs 4 bytes of RAM a slot in a face that calls
 * this or `fonts_load`, and nothing in one that calls neither.
 *
 * @param id The slot id.
 * @param resource_id The font's resource.
 * @return true when the slot holds a loaded font from that resource afterwards, false when the load
 *   failed or the id is out of range.
 */
bool fonts_swap(FontId id, uint32_t resource_id);

/**
 * @brief Store a system font handle under its slot id, without taking ownership.
 *
 * `fonts_get_system_font` hands back a handle the firmware owns, so the app must never unload it.
 * Registering one through `fonts_register` would put it in the queue for `fonts_unload_all` and
 * fault on the way out. This parks it in the slot and leaves it out of that sweep.
 *
 * @param id The slot id.
 * @param handle The system font handle.
 */
void fonts_register_system(FontId id, GFont handle);

/**
 * @brief Resolve a slot id to its handle. Falls back to the system font on a miss.
 *
 * @param id The slot id.
 * @return The font handle.
 */
GFont fonts_get(FontId id);

/**
 * @brief Unload every font the app owns and clear the registry.
 *
 * Only handles registered through `fonts_register` are freed. System fonts parked with
 * `fonts_register_system` are left alone, and a handle sitting in several slots is freed once.
 */
void fonts_unload_all(void);

/** @} */
