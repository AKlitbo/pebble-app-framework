/**
 * @file settings_chain.h
 * @brief The walk over a face's settings schemas, and the checks a launch makes over them.
 *
 * Every load, save, read, and write walks the face's chain through each schema's companion, and then
 * the framework's own schema, when it keeps one. The walk is one helper, so no loop can leave the
 * framework's schema out. It touches no SDK call, which is what lets the host specs walk it.
 *
 * @ingroup lib_settings
 */
#pragma once
#include "system/settings/settings.h"

/**
 * @addtogroup lib_settings
 * @{
 */

/**
 * @brief Where the walk starts.
 *
 * @param head The face's first schema, or NULL for a face with no settings of its own.
 * @param tail The framework's schema, or NULL when it keeps none.
 * @return The first schema, or NULL when there is nothing to walk.
 */
static inline const SettingsSchema *settings_chain_first(const SettingsSchema *head, const SettingsSchema *tail)
{
    return head ? head : tail;
}

/**
 * @brief The schema after this one in the walk.
 *
 * That is the face's own companion. After the face's last schema it is the framework's, and the walk
 * ends there.
 *
 * @param schema The schema the walk is on.
 * @param tail The framework's schema, or NULL when it keeps none.
 * @return The next schema, or NULL at the end.
 */
static inline const SettingsSchema *settings_chain_next(const SettingsSchema *schema, const SettingsSchema *tail)
{
    if (schema == tail)
    {
        return NULL;
    }

    return schema->companion ? schema->companion : tail;
}

/**
 * @brief Walks the face's schemas and then the framework's, for a `for` loop's header.
 *
 * @param schema The name the loop's schema goes by.
 * @param head The face's first schema, or NULL for a face with no settings of its own.
 * @param tail The framework's schema, or NULL when it keeps none.
 */
#define SETTINGS_CHAIN_EACH(schema, head, tail) \
    for (const SettingsSchema *schema = settings_chain_first((head), (tail)); schema; \
         schema = settings_chain_next(schema, (tail)))

/**
 * @brief Whether a schema in the face's own chain has a field on a message key.
 *
 * Only the face's chain is walked, not the framework's schema.
 *
 * @param head The face's first schema, or NULL.
 * @param message_key The `MESSAGE_KEY_*` to look for, by address.
 * @return True when a face field rides on it.
 */
static inline bool settings_chain_has_field(const SettingsSchema *head, const uint32_t *message_key)
{
    for (const SettingsSchema *schema = head; schema; schema = schema->companion)
    {
        for (uint8_t i = 0; i < schema->field_count; i++)
        {
            if (schema->fields[i].message_key == message_key)
            {
                return true;
            }
        }
    }

    return false;
}

/**
 * @brief Whether a schema in the face's own chain is saved under a persist key.
 *
 * Only the face's chain is walked, not the framework's schema.
 *
 * @param head The face's first schema, or NULL.
 * @param key The persist key to look for.
 * @return True when a face schema uses it.
 */
static inline bool settings_chain_has_key(const SettingsSchema *head, uint32_t key)
{
    for (const SettingsSchema *schema = head; schema; schema = schema->companion)
    {
        if (schema->key == key)
        {
            return true;
        }
    }

    return false;
}

/** @} */
