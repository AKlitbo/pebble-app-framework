/**
 * @file fonts.c
 * @brief Font registry implementation. A flat id-indexed table of loaded handles, with the
 * decisions about owning and freeing them in core's font_slots.c.
 *
 * @ingroup lib_ui
 */
#include "ui/fonts.h"
#include "ui/font_slots.h"

static void *s_fonts[FONT_SLOTS_MAX]; ///< Loaded font handles, indexed by FontId

/**
 * @brief A FontSlotState for each slot: whether the app loaded the handle and so has to free it,
 * and whether the slot records the resource it came from.
 *
 * A system font is parked with fonts_register_system and stays unowned, because unloading one the
 * firmware owns faults.
 */
static uint8_t s_states[FONT_SLOTS_MAX];

/**
 * @brief The resource each slot's font was loaded from, read only while its state says it was.
 *
 * Only fonts_load and fonts_swap reach this, so a face that calls neither leaves it out of its build.
 */
static uint32_t s_resources[FONT_SLOTS_MAX];

/// The tables handed to font_slots.c
static const FontSlots s_slots = {.handles = s_fonts, .states = s_states, .count = FONT_SLOTS_MAX};

/**
 * @brief Loads a font from its resource, for font_slots.c.
 *
 * @param resource The font's resource id.
 * @return The loaded font, or NULL when it did not load.
 */
static void *load_font(uint32_t resource)
{
    return fonts_load_custom_font(resource_get_handle(resource));
}

/**
 * @brief Frees a font the app loaded, for font_slots.c.
 *
 * @param handle The font to free.
 */
static void unload_font(void *handle)
{
    fonts_unload_custom_font(handle);
}

void fonts_register(FontId id, GFont handle)
{
    if (id >= FONT_SLOTS_MAX)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "fonts_register: id %d out of range", id);
        return;
    }

    font_slots_put(&s_slots, id, handle, true);
}

void fonts_register_system(FontId id, GFont handle)
{
    if (id >= FONT_SLOTS_MAX)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "fonts_register_system: id %d out of range", id);
        return;
    }

    font_slots_put(&s_slots, id, handle, false);
}

GFont fonts_get(FontId id)
{
    if (id < FONT_SLOTS_MAX && s_fonts[id])
    {
        return s_fonts[id];
    }

    // a mis-wired zone resolves the same id every tick so log the miss once per
    // id rather than spamming the log. out-of-range is a build-time bug so log it plainly
    if (id < FONT_SLOTS_MAX)
    {
        static bool s_warned[FONT_SLOTS_MAX];
        if (!s_warned[id])
        {
            s_warned[id] = true;
            APP_LOG(APP_LOG_LEVEL_ERROR, "fonts_get: id %d unregistered", id);
        }
    }
    else
    {
        // out-of-range can't index s_warned[FONT_SLOTS_MAX] so dedup with its own flag
        static bool s_oor_warned;
        if (!s_oor_warned)
        {
            s_oor_warned = true;
            APP_LOG(APP_LOG_LEVEL_ERROR, "fonts_get: id %d out of range", id);
        }
    }

    return fonts_get_system_font(FONT_KEY_GOTHIC_24);
}

void fonts_unload_all(void)
{
    font_slots_unload_all(&s_slots, unload_font);
}

bool fonts_load(FontId id, uint32_t resource_id)
{
    if (id >= FONT_SLOTS_MAX)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "fonts_load: id %d out of range", id);
        return false;
    }

    bool loaded = font_slots_load(&s_slots, s_resources, id, resource_id, load_font);
    if (!loaded)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "fonts_load: slot %d did not load, falling back to a system font", id);
    }

    return loaded;
}

bool fonts_swap(FontId id, uint32_t resource_id)
{
    if (id >= FONT_SLOTS_MAX)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "fonts_swap: id %d out of range", id);
        return false;
    }

    bool loaded = font_slots_swap(&s_slots, s_resources, id, resource_id, load_font, unload_font);
    if (!loaded)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "fonts_swap: slot %d did not load, falling back to a system font", id);
    }

    return loaded;
}
