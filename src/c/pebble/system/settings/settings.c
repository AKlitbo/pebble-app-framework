/**
 * @file settings.c
 * @brief The persist API implementation.
 *
 * @ingroup lib_settings
 */
#include "system/settings/settings.h"
#include "system/settings/plugin_source.h"
#include "system/settings/settings_chain.h"

#include "io/tuple_read.h"
#include "text/cstring_fit.h"

#include <stdio.h>
#include <string.h>

/// The face's first schema, registered by settings_init. The walk goes through its companions and then the framework's schema
static const SettingsSchema *s_primary;
/**
 * @brief True when any schema in the chain had no saved blob at init, or one was reset for a blob it
 * could not read, and no settings page message has landed since.
 *
 * Either way some settings are on their defaults, after a fresh install, an update, or a blob this
 * build cannot read. It tells the phone to push its own config back rather than the watch seeding
 * from defaults. It clears once the settings page's save or restore has landed and been saved.
 */
static bool s_was_fresh;
/// Known fields indexed by id for typed reads, drawn from every schema in the chain
static const SettingField *s_by_id[SETTING_COUNT];
/// The schema that owns each indexed field, so a typed read hits the right blob
static const SettingsSchema *s_owner_by_id[SETTING_COUNT];

#if PLUGIN_SOURCE_KEEPS_ANY
/// The weather and calendar source choice, kept for the phone and never read on the watch
static PluginSourceSettings s_plugin_source;

/// The fields of the framework's own schema, one for each kind whose choice the watch keeps
static const SettingField s_plugin_source_fields[] = { PLUGIN_SOURCE_FIELDS };

/// The framework's own schema, which the walk puts after the face's last one
static const SettingsSchema s_plugin_source_schema = {
    .key = SETTINGS_PLUGIN_SOURCE_KEY,
    .version = PLUGIN_SOURCE_VERSION,
    SETTINGS_BLOB(s_plugin_source, PLUGIN_SOURCE_FIRST_SIZE),
    .fields = s_plugin_source_fields,
    .field_count = sizeof(s_plugin_source_fields) / sizeof(s_plugin_source_fields[0]),
};

/// The framework's schema once settings_init takes it on, or NULL before that or when a face schema holds its key
static const SettingsSchema *s_tail;
/// The choices as they were last loaded or written, so a save that changes nothing skips the write
static PluginSourceSettings s_plugin_source_on_flash;
/// Whether s_plugin_source_on_flash is really what the key holds
static bool s_plugin_source_on_flash_known;
#endif

/// The framework's schema for the walk, or NULL on a face that keeps no source choice
#if PLUGIN_SOURCE_KEEPS_ANY
#define SCHEMA_TAIL s_tail
#else
#define SCHEMA_TAIL NULL
#endif

/// Walks the face's schemas and then the framework's, for a `for` loop's header
#define EACH_SCHEMA(schema) SETTINGS_CHAIN_EACH(schema, s_primary, SCHEMA_TAIL)

/**
 * @brief A pointer to a field's storage inside its owning schema's blob.
 *
 * @param schema The schema that owns the field.
 * @param field The setting field to get the pointer for.
 * @return A pointer to the field's storage.
 */
static void *field_ptr(const SettingsSchema *schema, const SettingField *field)
{
    return (uint8_t *)schema->blob + field->offset;
}

/**
 * @brief The version byte lives at the head of every schema's struct.
 *
 * @param schema The schema to read the version from.
 * @return The version byte from the schema's struct.
 */
static uint8_t get_version(const SettingsSchema *schema)
{
    return *(uint8_t *)schema->blob;
}

/**
 * @brief Set the version byte at the head of a schema's struct.
 *
 * @param schema The schema to write the version into.
 * @param version The version byte to set.
 */
static void set_version(const SettingsSchema *schema, uint8_t version)
{
    *(uint8_t *)schema->blob = version;
}

/**
 * @brief Index every schema's known fields by id, remembering the owning schema.
 *
 * So a shared read is a direct lookup. Face-only fields (id >= SETTING_COUNT)
 * are skipped. The face reads those off its own struct. The whole chain is
 * indexed, so a shared field may live in any schema (primary or companion) and
 * the owner table keeps the typed read pointed at the right blob.
 */
static void build_index(void)
{
    memset(s_by_id, 0, sizeof(s_by_id));
    memset(s_owner_by_id, 0, sizeof(s_owner_by_id));

    EACH_SCHEMA(schema)
    {
        for (uint8_t i = 0; i < schema->field_count; i++)
        {
            const SettingField *field = &schema->fields[i];
            if (field->id < SETTING_COUNT)
            {
                s_by_id[field->id] = field;
                s_owner_by_id[field->id] = schema;
            }
        }
    }
}

/**
 * @brief One 0..255 colour byte down to the two bits a GColor channel holds.
 *
 * The phone picks from the watch's own palette, so the byte is already one of 0, 85, 170
 * or 255. Rounding rather than dividing keeps anything slightly off landing on the nearest.
 *
 * @param byte The channel byte.
 * @return 0 to 3.
 */
static uint8_t color_channel(uint32_t byte)
{
    uint32_t level = (byte + 42) / 85;

    return (uint8_t)(level > 3 ? 3 : level);
}

/**
 * @brief A 0xRRGGBB number as one opaque GColor byte.
 *
 * @param hex The colour the phone sent.
 * @return The argb byte.
 */
static uint8_t color_from_hex(uint32_t hex)
{
    uint8_t red = color_channel((hex >> 16) & 0xFF);
    uint8_t green = color_channel((hex >> 8) & 0xFF);
    uint8_t blue = color_channel(hex & 0xFF);

    // an opaque GColor is 0b11rrggbb
    return (uint8_t)(0xC0 | (red << 4) | (green << 2) | blue);
}

/**
 * @brief A GColor byte back to the 0xRRGGBB number the config page reads.
 *
 * @param argb The stored byte.
 * @return The colour as 0xRRGGBB.
 */
static uint32_t color_to_hex(uint8_t argb)
{
    uint32_t red = ((argb >> 4) & 3) * 85;
    uint32_t green = ((argb >> 2) & 3) * 85;
    uint32_t blue = (argb & 3) * 85;

    return (red << 16) | (green << 8) | blue;
}

/**
 * @brief Seed every field of one schema with its fresh-install default.
 *
 * The whole blob is zeroed first, so a schema that declares no fields (one the face fills in
 * itself rather than through the table) still resets to a known state instead of keeping
 * whatever a rejected blob left behind. Zero is the empty string for a cstring and 0 for a
 * number, which is what every field default then writes over.
 *
 * @param schema The schema to seed.
 */
static void apply_defaults(const SettingsSchema *schema)
{
    memset(schema->blob, 0, schema->blob_size);

    for (uint8_t i = 0; i < schema->field_count; i++)
    {
        const SettingField *field = &schema->fields[i];
        void *ptr = field_ptr(schema, field);

        switch (field->type)
        {
            case SETTING_BOOL:
                *(bool *)ptr = (field->default_num != 0);
                break;

            case SETTING_ENUM_U8:
                *(uint8_t *)ptr = (uint8_t)field->default_num;
                break;

            case SETTING_CSTRING:
                cstring_fit((char *)ptr, field->default_str, field->size);
                break;

            case SETTING_COLOR:
                *(uint8_t *)ptr = color_from_hex(field->default_num);
                break;
        }
    }
}

/**
 * @brief Clamp a damaged cstring back to its default.
 *
 * Valid means NUL-terminated within the buffer, free of control bytes, and non-empty unless the
 * field's own default is empty. A place name can arrive as UTF-8, so anything from 0x20 up counts
 * as text and is left alone.
 *
 * @param schema The schema that owns the field.
 * @param field The setting field to sanitize.
 * @return true if the string was corrected, false otherwise.
 */
static bool sanitize_cstring(const SettingsSchema *schema, const SettingField *field)
{
    char *str = (char *)field_ptr(schema, field);

    if (cstring_setting_is_clean(str, field->size, field->default_str))
    {
        return false;
    }

    cstring_fit(str, field->default_str, field->size);
    return true;
}

/**
 * @brief Clamp every field of one schema to a legal value.
 *
 * Ensures a damaged blob never renders as garbage.
 *
 * @param schema The schema to sanitize.
 * @return true if anything was corrected so the caller can re-save.
 */
static bool sanitize(const SettingsSchema *schema)
{
    bool changed = false;

    for (uint8_t i = 0; i < schema->field_count; i++)
    {
        const SettingField *field = &schema->fields[i];
        uint8_t *byte = (uint8_t *)field_ptr(schema, field);

        switch (field->type)
        {
            case SETTING_BOOL:
                // a corrupt blob can leave a byte outside 0/1 so reset to the default
                if (*byte > 1)
                {
                    *byte = (uint8_t)(field->default_num != 0);
                    changed = true;
                }
                break;

            case SETTING_ENUM_U8:
                if (*byte >= field->enum_count)
                {
                    *byte = (uint8_t)field->default_num;
                    changed = true;
                }
                break;

            case SETTING_CSTRING:
                changed |= sanitize_cstring(schema, field);
                break;

            case SETTING_COLOR:
                // every colour the watch can paint is opaque, so a byte without both alpha
                // bits set came from a damaged blob rather than a picker
                if ((*byte & 0xC0) != 0xC0)
                {
                    *byte = color_from_hex(field->default_num);
                    changed = true;
                }
                break;
        }
    }

    return changed;
}

/**
 * @brief Persist one schema's struct under its key, logging an error when the whole struct did not
 * reach flash.
 *
 * @param schema The schema to save.
 */
static void save_schema(const SettingsSchema *schema)
{
#if PLUGIN_SOURCE_KEEPS_ANY
    // every save writes every schema, and the choices rarely move, so an unchanged one costs no write
    if (schema == &s_plugin_source_schema &&
        !plugin_source_write_needed(&s_plugin_source, &s_plugin_source_on_flash, s_plugin_source_on_flash_known))
    {
        return;
    }
#endif

    // a failed write is logged and not tried again
    // a write falls short when the struct is over the 256 bytes a key holds, when the app's storage is
    // full, or when the watch cannot rewrite its settings file. none of those clears on its own, so a
    // retry would cost bytes and never land
    // the framework's schema is tried again on the next save, since its copy of flash only moves when
    // a write lands whole. that costs one write per face save until the key takes it
    if (persist_write_data(schema->key, schema->blob, schema->blob_size) != (int)schema->blob_size)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "settings: key %lu not saved whole", (unsigned long)schema->key);
        return;
    }

#if PLUGIN_SOURCE_KEEPS_ANY
    if (schema == &s_plugin_source_schema)
    {
        s_plugin_source_on_flash = s_plugin_source;
        s_plugin_source_on_flash_known = true;
    }
#endif
}

/**
 * @brief Load one schema from its key, applying defaults first and re-saving when needed.
 *
 * @param schema The schema to load.
 */
static void load_schema(const SettingsSchema *schema)
{
    apply_defaults(schema);
    set_version(schema, schema->version);

    if (!persist_exists(schema->key))
    {
        return;  // first run keeps the defaults
    }

    int stored = persist_get_size(schema->key);

    // let the face lift a legacy (pre-versioning) blob it recognizes by size then
    // re-save versioned. a schema with no legacy history passes migrate = NULL
    if (schema->migrate && schema->migrate(stored))
    {
        sanitize(schema);
        set_version(schema, schema->version);
        save_schema(schema);
        return;
    }

    // versioned blob: at least the size the struct first shipped at (smaller would shift
    // fields) and no bigger than the current struct. a short read upgrades an older
    // shorter version and the trailing fields keep their just-applied defaults
    if (stored >= schema->first_size && stored <= schema->blob_size)
    {
        persist_read_data(schema->key, schema->blob, schema->blob_size);

        uint8_t version = get_version(schema);
        if (version >= 1 && version <= schema->version)
        {
            // TODO: non-append schema changes (reorder/remove/retype) need a per-version fixup here
            bool healed = sanitize(schema);

            // re-save if we upgraded an older version or had to repair a damaged field
            if (version < schema->version || healed)
            {
                set_version(schema, schema->version);
                save_schema(schema);
            }
#if PLUGIN_SOURCE_KEEPS_ANY
            // read back clean and not saved again, so memory holds exactly what the key does. a re-save
            // above sets the copy itself, and only when the write lands whole
            else if (schema == &s_plugin_source_schema)
            {
                s_plugin_source_on_flash = s_plugin_source;
                s_plugin_source_on_flash_known = true;
            }
#endif

            return;
        }
    }

    // unrecognized size or bad version: reset (the bad read may have clobbered the blob). the saved
    // settings are gone just as a wipe leaves them, such as after going back to an older build, so
    // the watch counts as fresh and the phone restores it. the key is removed rather than written
    // with the defaults, so a relaunch before the restore lands still boots fresh and asks again
    apply_defaults(schema);
    set_version(schema, schema->version);
    persist_delete(schema->key);
    s_was_fresh = true;
}

#if PLUGIN_SOURCE_KEEPS_ANY
/**
 * @brief Takes the framework's schema on, unless a face schema already holds its key, and logs a face
 * field that doubles one the framework keeps.
 *
 * A face schema on the framework's key would have the two overwrite each other on every save, so the
 * face's settings win and the choice is not kept. A doubled field still works, since both copies take
 * every save, but the watch then sends the key twice. The framework cannot see the keys a face hands
 * its stores, so a store on the same key goes unnoticed here.
 *
 * @param head The face's first schema, or NULL.
 */
static void take_plugin_source(const SettingsSchema *head)
{
    s_tail = &s_plugin_source_schema;
    // nothing is known about flash until the load below reads the key back clean or a write lands, so
    // an empty key, a dropped blob, or a failed re-save all leave the next save to write
    s_plugin_source_on_flash_known = false;

    if (settings_chain_has_key(head, SETTINGS_PLUGIN_SOURCE_KEY))
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "settings: key %d is the framework's plugin source key, so the source choice is not kept. Move the face's schema to another key",
                SETTINGS_PLUGIN_SOURCE_KEY);
        s_tail = NULL;
    }

#if PLUGIN_SOURCE_KEEPS_WEATHER
    if (settings_chain_has_field(head, &MESSAGE_KEY_WEATHER_PROVIDER))
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "settings: the framework keeps WEATHER_PROVIDER, so take the face's own field on it out");
    }
#endif

#if PLUGIN_SOURCE_KEEPS_CALENDAR
    if (settings_chain_has_field(head, &MESSAGE_KEY_CALENDAR_SOURCE))
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "settings: the framework keeps CALENDAR_SOURCE, so take the face's own field on it out");
    }
#endif
}
#endif

void settings_init(const SettingsSchema *head)
{
#if PLUGIN_SOURCE_KEEPS_ANY
    take_plugin_source(head);
#endif

    s_primary = head;
    build_index();

    // a wipe clears every key, and a reset removes the blob it could not read, so any schema in the
    // chain with no saved blob means some settings are on their defaults and the phone should restore
    // them. a companion a new build adds counts too, which costs one restore of what the phone holds
    s_was_fresh = false;

    // load every schema in the chain, the primary, any companions, and the framework's own last
    SETTINGS_CHAIN_EACH(schema, head, SCHEMA_TAIL)
    {
        // a struct over what one key holds is only ever saved in part, so its tail comes back as the
        // defaults on every launch. SETTINGS_BLOB stops the build for it, and this catches a face
        // that fills in blob_size by hand with plain sizeof
        if (schema->blob_size > PERSIST_DATA_MAX_LENGTH)
        {
            APP_LOG(APP_LOG_LEVEL_ERROR, "settings: key %lu is over %d bytes", (unsigned long)schema->key,
                    PERSIST_DATA_MAX_LENGTH);
        }

        if (!persist_exists(schema->key))
        {
            s_was_fresh = true;
        }
        load_schema(schema);
    }
}

bool settings_was_fresh(void)
{
    return s_was_fresh;
}

void settings_save(void)
{
    EACH_SCHEMA(schema)
    {
        save_schema(schema);
    }

}

void settings_mark_restored(void)
{
    s_was_fresh = false;
}

// the typed reads index by id with no range check. every shared setting has an id below
// SETTING_COUNT, and a face's own fields, marked SETTING_COUNT, are read from the face's own struct
// rather than through here. a check on every read would cost bytes on every face to guard a call
// none of them makes
uint8_t settings_u8(SettingId id)
{
    const SettingField *field = s_by_id[id];
    return field ? *(uint8_t *)field_ptr(s_owner_by_id[id], field) : 0;
}

const char *settings_str(SettingId id)
{
    const SettingField *field = s_by_id[id];
    return field ? (const char *)field_ptr(s_owner_by_id[id], field) : "";
}

void settings_set_u8(SettingId id, uint8_t value)
{
    const SettingField *field = s_by_id[id];
    if (field)
    {
        *(uint8_t *)field_ptr(s_owner_by_id[id], field) = value;
    }
}

uint8_t settings_enum_count(SettingId id)
{
    const SettingField *field = s_by_id[id];
    return field ? field->enum_count : 0;
}

/**
 * @brief Writes an enum value as the text Clay reads a select back as.
 *
 * @param value The enum value.
 * @param buf Where the text goes. Four bytes holds any uint8_t and its terminator.
 * @param size The size of @p buf.
 */
static void enum_text(uint8_t value, char *buf, size_t size)
{
    snprintf(buf, size, "%d", value);
}

/**
 * @brief The most bytes one field's value could take on the wire, written the way
 * settings_serialize writes it.
 *
 * A string counts as filling its whole buffer, and an enum as the three digits plus terminator any
 * uint8_t fits in.
 *
 * @param field The field to measure.
 * @return The value's size, without its tuple header.
 */
static uint32_t field_value_size_max(const SettingField *field)
{
    switch (field->type)
    {
        case SETTING_BOOL:
            return sizeof(uint8_t);

        case SETTING_ENUM_U8:
            return sizeof("255");

        case SETTING_CSTRING:
            return field->size;

        case SETTING_COLOR:
            return sizeof(uint32_t);
    }

    return 0;
}

uint32_t settings_serialized_size_max(void)
{
    uint32_t size = 0;
    EACH_SCHEMA(schema)
    {
        for (uint8_t i = 0; i < schema->field_count; i++)
        {
            // the SDK's own formula for one tuple, less the one byte header that belongs to the
            // whole dictionary rather than to any field
            uint32_t value_size = field_value_size_max(&schema->fields[i]);
            size += dict_calc_buffer_size(1, value_size) - dict_calc_buffer_size(0);
        }
    }
    return size;
}

bool settings_serialize(DictionaryIterator *iter)
{
    EACH_SCHEMA(schema)
    {
        for (uint8_t i = 0; i < schema->field_count; i++)
        {
            const SettingField *field = &schema->fields[i];
            uint8_t *byte = (uint8_t *)field_ptr(schema, field);

            DictionaryResult result = DICT_OK;

            switch (field->type)
            {
                case SETTING_BOOL:
                    result = dict_write_uint8(iter, *field->message_key, *byte ? 1 : 0);
                    break;

                case SETTING_ENUM_U8:
                {
                    char buf[4];  // enum value as a cstring (Clay reads selects as strings)
                    enum_text(*byte, buf, sizeof(buf));
                    result = dict_write_cstring(iter, *field->message_key, buf);
                    break;
                }

                case SETTING_CSTRING:
                    result = dict_write_cstring(iter, *field->message_key, (char *)byte);
                    break;

                case SETTING_COLOR:
                    // back as the 0xRRGGBB number the config page's picker reads
                    result = dict_write_uint32(iter, *field->message_key, color_to_hex(*byte));
                    break;
            }

            // the outbox ran out of room. stop and say so, so the caller can drop the reply rather
            // than send the phone part of a snapshot
            if (result != DICT_OK)
            {
                APP_LOG(APP_LOG_LEVEL_ERROR, "settings_serialize: outbox full at field %d", (int)i);
                return false;
            }
        }
    }

    return true;
}

SettingsInbound settings_apply_inbox(DictionaryIterator *iter)
{
    SettingsInbound result = {false, false, false};

    EACH_SCHEMA(schema)
    {
        for (uint8_t i = 0; i < schema->field_count; i++)
        {
            const SettingField *field = &schema->fields[i];

            Tuple *tuple = dict_find(iter, *field->message_key);
            if (!tuple)
            {
                continue;
            }

            void *ptr = field_ptr(schema, field);

            switch (field->type)
            {
                case SETTING_BOOL:
                {
                    // a toggle comes as an int or as digits. -1 is a value the phone never sends
                    // for one, so it doubles as the mark for anything else and the field keeps
                    // whatever it already held
                    int32_t on = tuple_number_or(tuple, -1);
                    if (on < 0)
                    {
                        continue;
                    }

                    bool value = (on == 1);
                    if (*(bool *)ptr == value)
                    {
                        continue;
                    }

                    *(bool *)ptr = value;
                    break;
                }

                case SETTING_ENUM_U8:
                {
                    // a select arrives as text and a face's own component can send an int, and
                    // both read the same. -1 marks anything else, such as an empty select or a
                    // word, and the field keeps what it held rather than taking the first choice.
                    // digits too big for an int32_t read as INT32_MAX and reset to the default below
                    int32_t value = tuple_number_or(tuple, -1);
                    if (value == -1)
                    {
                        continue;
                    }

                    if (value < 0 || value >= field->enum_count)
                    {
                        value = (int32_t)field->default_num;  // out-of-range from the phone so clamp to default
                    }

                    if (*(uint8_t *)ptr == (uint8_t)value)
                    {
                        continue;
                    }

                    *(uint8_t *)ptr = (uint8_t)value;
                    break;
                }

                case SETTING_CSTRING:
                {
                    // an empty save only means "no value" for a field whose default is empty, such as a
                    // picker whose None is "". any other field keeps what it holds rather than blanking
                    const char *value = tuple_str_or(tuple, NULL);
                    bool empty_is_a_value = !field->default_str || field->default_str[0] == '\0';
                    if (!value || (value[0] == '\0' && !empty_is_a_value))
                    {
                        continue;
                    }

                    if (cstring_fit_same((const char *)ptr, value, field->size))
                    {
                        continue;
                    }

                    cstring_fit((char *)ptr, value, field->size);
                    break;
                }

                case SETTING_COLOR:
                {
                    // a colour is read as an int only, since text could be hex such as "FF0000"
                    // and reading it as decimal would land on the wrong colour. -1 is outside the
                    // 0xRRGGBB range the picker sends, so it doubles as the "wrong wire type" signal
                    // and the field keeps whatever it already held
                    int32_t hex = tuple_int_or(tuple, -1);
                    if (hex < 0)
                    {
                        continue;
                    }

                    uint8_t value = color_from_hex((uint32_t)hex);
                    if (*(uint8_t *)ptr == value)
                    {
                        continue;
                    }

                    *(uint8_t *)ptr = value;
                    break;
                }
            }

            // every case above walks on when the field already reads what the phone sent, so these
            // three mark what moved rather than what the save carried. the config page sends the
            // whole page each time, and a fresh weather fetch hangs off weather_changed
            result.changed = true;
            result.layout_changed |= field->affects_layout;
            result.weather_changed |= field->affects_weather;
        }
    }

    return result;
}
