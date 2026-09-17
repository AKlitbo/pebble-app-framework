/**
 * @file settings.c
 * @brief The persist API implementation.
 *
 * @ingroup lib_settings
 */
#include "system/settings/settings.h"

#include "io/tuple_read.h"
#include "text/number_format.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/// Head of the schema chain registered by settings_init, the primary plus any companions
static const SettingsSchema *s_primary;
/**
 * @brief True when the primary key had no saved blob at init.
 *
 * That means storage was wiped by a fresh install or an update. It tells the phone to push its own
 * config back rather than the watch seeding from defaults.
 */
static bool s_was_fresh;
/// Known fields indexed by id for typed reads, drawn from every schema in the chain
static const SettingField *s_by_id[SETTING_COUNT];
/// The schema that owns each indexed field, so a typed read hits the right blob
static const SettingsSchema *s_owner_by_id[SETTING_COUNT];

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

    for (const SettingsSchema *schema = s_primary; schema; schema = schema->companion)
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
 * @brief Copy a cstring into a fixed buffer, NUL-terminating within size.
 *
 * A NULL src yields an empty string. Shared by the defaults, the sanitize
 * repair, and the inbound copy so the bounded-copy idiom lives in one place.
 *
 * @param dst The destination buffer.
 * @param src The source string, or NULL for empty.
 * @param size The size of the destination buffer.
 */
static void set_cstring(char *dst, const char *src, uint16_t size)
{
    if (src)
    {
        strncpy(dst, src, size - 1);
        dst[size - 1] = '\0';
    }
    else
    {
        dst[0] = '\0';
    }
}

/**
 * @brief Whether a string would land in a field's buffer exactly as the buffer already reads.
 *
 * set_cstring keeps only what fits, so the incoming string is measured the same way. Comparing it
 * in full would call a value too long for the field a change on every save.
 *
 * @param current What the field holds now.
 * @param value The string the phone sent.
 * @param size The field's buffer size, terminator included.
 * @return True when storing the string would leave the field reading the same.
 */
static bool cstring_same(const char *current, const char *value, uint16_t size)
{
    if (size == 0)
    {
        return true;  // nowhere to put it, so nothing about the field can move
    }

    size_t room = (size_t)size - 1;
    size_t incoming = strlen(value);
    if (incoming > room)
    {
        incoming = room;
    }

    return strlen(current) == incoming && strncmp(current, value, incoming) == 0;
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
                set_cstring((char *)ptr, field->default_str, field->size);
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
 * Valid means NUL-terminated within the buffer, non-empty, and free of control bytes. A place
 * name can arrive as UTF-8, so anything from 0x20 up counts as text and is left alone.
 *
 * @param schema The schema that owns the field.
 * @param field The setting field to sanitize.
 * @return true if the string was corrected, false otherwise.
 */
static bool sanitize_cstring(const SettingsSchema *schema, const SettingField *field)
{
    char *str = (char *)field_ptr(schema, field);

    if (cstring_is_clean(str, field->size))
    {
        return false;
    }

    set_cstring(str, field->default_str, field->size);
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
 * @brief Persist one schema's struct under its key.
 *
 * @param schema The schema to save.
 */
static void save_schema(const SettingsSchema *schema)
{
    persist_write_data(schema->key, schema->blob, schema->blob_size);
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

    // let the face lift a legacy (pre-versioning) blob it recognises by size then
    // re-save versioned. a schema with no legacy history passes migrate = NULL
    if (schema->migrate && schema->migrate(stored))
    {
        sanitize(schema);
        set_version(schema, schema->version);
        save_schema(schema);
        return;
    }

    // versioned blob: at least this schema's frozen v1 size (smaller would shift
    // fields) and no bigger than the current struct. a short read upgrades an older
    // shorter version and the trailing fields keep their just-applied defaults
    if (stored >= schema->min_versioned_size && stored <= schema->blob_size)
    {
        persist_read_data(schema->key, schema->blob, schema->blob_size);

        uint8_t version = get_version(schema);
        if (version >= 1 && version <= schema->version)
        {
            // NOTE: non-append schema changes (reorder/remove/retype) need a per-version fixup here
            bool healed = sanitize(schema);

            // re-save if we upgraded an older version or had to repair a damaged field
            if (version < schema->version || healed)
            {
                set_version(schema, schema->version);
                save_schema(schema);
            }

            return;
        }
    }

    // unrecognized size or bad version: reset (the bad read may have clobbered the blob)
    apply_defaults(schema);
    set_version(schema, schema->version);
    save_schema(schema);
}

void settings_init(const SettingsSchema *head)
{
    s_primary = head;
    build_index();

    // a wipe clears every key, so the primary being absent means we booted with no saved settings
    s_was_fresh = !persist_exists(head->key);

    // load every schema in the chain (the primary plus any companions)
    for (const SettingsSchema *schema = head; schema; schema = schema->companion)
    {
        load_schema(schema);
    }
}

bool settings_was_fresh(void)
{
    return s_was_fresh;
}

void settings_save(void)
{
    for (const SettingsSchema *schema = s_primary; schema; schema = schema->companion)
    {
        save_schema(schema);
    }
}

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
 * @brief How many bytes one field's value takes on the wire, written the way settings_serialize writes it.
 *
 * @param schema The schema the field belongs to.
 * @param field The field to measure.
 * @return The value's size, without its tuple header.
 */
static uint32_t field_value_size(const SettingsSchema *schema, const SettingField *field)
{
    uint8_t *byte = (uint8_t *)field_ptr(schema, field);

    switch (field->type)
    {
        case SETTING_BOOL:
            return sizeof(uint8_t);

        case SETTING_ENUM_U8:
        {
            char buf[4];
            enum_text(*byte, buf, sizeof(buf));
            return strlen(buf) + 1;
        }

        case SETTING_CSTRING:
            return strlen((char *)byte) + 1;

        case SETTING_COLOR:
            return sizeof(uint32_t);
    }

    return 0;
}

uint32_t settings_serialized_size(void)
{
    uint32_t size = 0;
    for (const SettingsSchema *schema = s_primary; schema; schema = schema->companion)
    {
        for (uint8_t i = 0; i < schema->field_count; i++)
        {
            // the SDK's own formula for one tuple, less the one byte header that belongs to the
            // whole dictionary rather than to any field
            uint32_t value_size = field_value_size(schema, &schema->fields[i]);
            size += dict_calc_buffer_size(1, value_size) - dict_calc_buffer_size(0);
        }
    }
    return size;
}

bool settings_serialize(DictionaryIterator *iter)
{
    for (const SettingsSchema *schema = s_primary; schema; schema = schema->companion)
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

    for (const SettingsSchema *schema = s_primary; schema; schema = schema->companion)
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
                    // -1 is a value the phone never sends for a bool so it doubles as the
                    // "wrong wire type" signal and the field keeps whatever it already held
                    int32_t on = tuple_int_or(tuple, -1);
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

                case SETTING_ENUM_U8:  // arrives as a cstring so atoi it
                {
                    // atoi reads until it finds a terminator, so it has to be handed a string that
                    // has one inside itself. a raw tuple is only the phone's word for that
                    const char *digits = tuple_str_or(tuple, NULL);
                    if (!digits)
                    {
                        continue;
                    }

                    int value = atoi(digits);
                    if (value < 0 || value >= field->enum_count)
                    {
                        value = (int)field->default_num;  // out-of-range from the phone so clamp to default
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
                    const char *value = tuple_str_or(tuple, NULL);
                    if (!value || value[0] == '\0')
                    {
                        continue;  // nothing to store, so don't flag a change
                    }

                    if (cstring_same((const char *)ptr, value, field->size))
                    {
                        continue;
                    }

                    set_cstring((char *)ptr, value, field->size);
                    break;
                }

                case SETTING_COLOR:
                {
                    // -1 is outside the 0xRRGGBB range the picker sends, so it doubles as the
                    // "wrong wire type" signal and the field keeps whatever it already held
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
