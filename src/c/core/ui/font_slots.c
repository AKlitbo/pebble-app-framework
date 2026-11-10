/**
 * @file font_slots.c
 * @brief The decisions behind the font registry: who owns each slot's font, when a swap has
 * nothing to do, and when a font can be freed.
 *
 * @ingroup lib_core
 */
#include "ui/font_slots.h"

#include <stddef.h>

/**
 * @brief Whether a slot id is inside the tables.
 *
 * @param slots The registry's tables.
 * @param id The slot.
 * @return true when the tables hold that slot.
 */
static bool slot_in_range(const FontSlots *slots, int id)
{
    return id >= 0 && id < slots->count;
}

void font_slots_put(const FontSlots *slots, int id, void *handle, bool owned)
{
    if (!slot_in_range(slots, id))
    {
        return;
    }

    slots->handles[id] = handle;
    slots->states[id] = owned ? FONT_SLOT_OWNED : FONT_SLOT_UNOWNED;
}

bool font_slots_load(const FontSlots *slots, uint32_t *resources, int id, uint32_t resource,
                     FontSlotLoad load)
{
    // checked before the load, since a font loaded for a slot that does not exist could never be freed
    if (!slot_in_range(slots, id))
    {
        return false;
    }

    void *handle = load(resource);
    slots->handles[id] = handle;
    slots->states[id] = handle ? FONT_SLOT_LOADED : FONT_SLOT_UNOWNED;
    resources[id] = resource;
    return handle != NULL;
}

/**
 * @brief Lets go of the font in a slot before the slot takes another, freeing it if nothing else
 * holds it.
 *
 * Only slots the app owns count as holding a font for this. A copy put in as a system font would
 * otherwise keep it alive with nobody left to free it, so ownership moves to the first slot that
 * held it as a system font instead. That slot then frees it like any font the app owns. Registering
 * over that slot afterwards leaves the font it took over loaded, as registering over any owned slot
 * does, so nothing frees it until the face does.
 *
 * @param slots The registry's tables.
 * @param id The slot letting go.
 * @param unload The call that frees a font.
 */
static void let_go(const FontSlots *slots, int id, FontSlotUnload unload)
{
    void *old = slots->handles[id];
    if (!old || slots->states[id] == FONT_SLOT_UNOWNED)
    {
        return;
    }

    int heir = -1;
    for (int i = 0; i < slots->count; i++)
    {
        if (i == id || slots->handles[i] != old)
        {
            continue;
        }

        if (slots->states[i] != FONT_SLOT_UNOWNED)
        {
            // another owner holds it and frees it later
            return;
        }

        if (heir < 0)
        {
            heir = i;
        }
    }

    if (heir >= 0)
    {
        slots->states[heir] = FONT_SLOT_OWNED;
        return;
    }

    unload(old);
}

bool font_slots_swap(const FontSlots *slots, uint32_t *resources, int id, uint32_t resource,
                     FontSlotLoad load, FontSlotUnload unload)
{
    if (!slot_in_range(slots, id))
    {
        return false;
    }

    // only a slot whose last write was a load records a resource, so a font put in by any other
    // write, or a freed one whose address came back, never counts as already loaded
    if (slots->handles[id] && slots->states[id] == FONT_SLOT_LOADED && resources[id] == resource)
    {
        return true;
    }

    let_go(slots, id, unload);
    return font_slots_load(slots, resources, id, resource, load);
}

void font_slots_unload_all(const FontSlots *slots, FontSlotUnload unload)
{
    for (int i = 0; i < slots->count; i++)
    {
        void *handle = slots->handles[i];
        if (handle && slots->states[i] != FONT_SLOT_UNOWNED)
        {
            unload(handle);

            // one handle can sit in several slots, so clear every copy of it before moving on
            // or the next slot holding it would unload it a second time
            for (int j = i; j < slots->count; j++)
            {
                if (slots->handles[j] == handle)
                {
                    slots->handles[j] = NULL;
                    slots->states[j] = FONT_SLOT_UNOWNED;
                }
            }
        }

        slots->handles[i] = NULL;
        slots->states[i] = FONT_SLOT_UNOWNED;
    }
}
