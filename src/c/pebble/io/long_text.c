/**
 * @file long_text.c
 * @brief The deciding behind the face's long text setting: when it can be set, whether it fits, what
 * the reply carries, and whether an arrival changed it.
 *
 * @ingroup lib_io
 */
#include "io/long_text.h"

#include <pebble.h>
#include <string.h>

bool long_text_set(LongText *slot, uint32_t key, uint16_t cap, LongTextProvider provider,
                   LongTextReceiver receiver, bool opened)
{
    // the outbox is sized at open, so a text set after it could outgrow the settings reply, and the
    // phone would get an empty one on every launch
    if (opened)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "long text set after appmessage_open, so it is left out");
        return false;
    }

    // a cap of 0 has no room for even the end of the text, and the buffer for one past the most sits
    // on the stack for each send or compare
    if (cap == 0 || cap > LONG_TEXT_CAP_MAX)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "long text cap %d is outside 1 to %d", (int)cap, LONG_TEXT_CAP_MAX);
        return false;
    }

    // without the provider every save would count as a change, and without the receiver nothing would
    // keep what the page sends
    if (!provider || !receiver)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "long text needs both a provider and a receiver");
        return false;
    }

    *slot = (LongText){ .key = key, .cap = cap, .provider = provider, .receiver = receiver };
    return true;
}

bool long_text_fits(uint32_t text_bytes, uint32_t reply_bytes, uint32_t outbox_max, uint32_t inbox_room)
{
    return reply_bytes + text_bytes <= outbox_max && text_bytes <= inbox_room;
}

void long_text_held(const LongText *slot, char *out)
{
    // the last byte is set after the provider runs, so a provider that fills the buffer to the brim
    // still leaves an ended string
    out[0] = '\0';
    slot->provider(out, slot->cap);
    out[slot->cap - 1] = '\0';
}

bool long_text_arrived(const LongText *slot, const char *text)
{
    if (slot->cap == 0)
    {
        return false;
    }

    // the face's text is rebuilt into a stack buffer of the cap's size for the compare, which
    // long_text_set holds to LONG_TEXT_CAP_MAX
    char held[slot->cap];
    long_text_held(slot, held);

    if (strncmp(text, held, (size_t)slot->cap - 1) == 0)
    {
        return false;
    }

    slot->receiver(text);
    return true;
}
