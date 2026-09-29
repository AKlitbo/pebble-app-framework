/**
 * @file callback_list.c
 * @brief Adding to and running a callback list.
 *
 * @ingroup lib_core
 */
#include "io/callback_list.h"

#include <stddef.h>

bool callback_list_add(CallbackList *list, CallbackListFn cb)
{
    if (!cb)
    {
        return true;
    }

    for (int i = 0; i < list->count; i++)
    {
        if (list->entries[i] == cb)
        {
            return true;
        }
    }

    if (list->count >= list->max)
    {
        return false;
    }

    list->entries[list->count++] = cb;
    return true;
}

void callback_list_fire(const CallbackList *list)
{
    for (int i = 0; i < list->count; i++)
    {
        list->entries[i]();
    }
}
