/**
 * @file long_text.h
 * @brief One text setting too long for the settings blob, which rides its own message key and the
 * face's own storage.
 *
 * A settings field lives in a blob of at most 256 bytes, so a face with a text setting that can run
 * longer, such as a packed list of colours, keeps it itself, split however it likes. The phone sends
 * it on its own key with every save, and the watch sends it back in the settings reply. The face names
 * the key and the most bytes the text can take, and hands over a provider that writes the text it
 * holds and a receiver that stores a new one.
 *
 * The deciding needs nothing from the SDK beyond a log line. The transport owns one of these, reads and writes the key, and asks
 * here whether the setting can be taken, whether it fits the buffers, whether an arrival changed
 * anything, and what text the reply carries, which keeps the deciding testable on the host.
 *
 * @ingroup lib_io
 */
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/**
 * @addtogroup lib_io
 * @{
 */

/// The most bytes a long text can take, its end included. Its buffer sits on the stack for one send or compare
#define LONG_TEXT_CAP_MAX 1024

/**
 * @brief Called with a long text setting the phone sent, for the face to store.
 *
 * The text is read straight off the inbox, so it only lives for this call.
 *
 * @param text The text as the phone sent it, ended.
 */
typedef void (*LongTextReceiver)(const char *text);

/**
 * @brief Called to write the long text setting the face holds, for the settings reply and to tell a
 * save that changed it from one that did not.
 *
 * @param[out] out The buffer to fill. Write the text ended, cut short to fit.
 * @param size The size of @p out, which is the cap the face gave.
 */
typedef void (*LongTextProvider)(char *out, size_t size);

/**
 * @brief The face's long text setting: its key, its cap, and the provider and receiver.
 *
 * A zeroed one holds no setting, which is how the transport starts.
 */
typedef struct
{
    uint32_t key;               ///< The `MESSAGE_KEY_*` value the text rides on
    uint16_t cap;               ///< The most bytes the text takes, its end included. 0 means no setting
    LongTextProvider provider;  ///< Writes the text the face holds
    LongTextReceiver receiver;  ///< Stores a text that arrived
} LongText;

/**
 * @brief Sets up the face's long text setting, replacing one set before.
 *
 * It has to come before the transport opens, since the outbox is sized then and has to hold the text
 * at its cap. It needs both a provider and a receiver, since without the provider every save would
 * count as a change, and without the receiver nothing would keep what the page sends. A set after the
 * transport opened, one with a cap of 0 or past LONG_TEXT_CAP_MAX, or one missing either function is
 * logged and refused, and whatever was set before stays.
 *
 * @param slot The setting to fill.
 * @param key The `MESSAGE_KEY_*` value the text rides on.
 * @param cap The most bytes the text takes, its end included.
 * @param provider Writes the text the face holds.
 * @param receiver Stores a text that arrived.
 * @param opened Whether the transport has opened already.
 * @return True when the setting was taken.
 */
bool long_text_set(LongText *slot, uint32_t key, uint16_t cap, LongTextProvider provider,
                   LongTextReceiver receiver, bool opened);

/**
 * @brief Whether the text at its cap fits both buffers: the outbox beside the rest of the settings
 * reply, and the inbox on its own.
 *
 * A settings reply that does not fit the outbox goes out empty every time, and a save holding a text
 * the inbox cannot take is dropped whole, so a cap either buffer cannot hold would lose every reply or
 * every save.
 *
 * @param text_bytes What the text takes in a message at its cap, its header included.
 * @param reply_bytes What the settings reply takes without the text, the dictionary's header included.
 * @param outbox_max The most the outbox can open at.
 * @param inbox_room What the inbox holds past the dictionary's own header.
 * @return True when both hold it.
 */
bool long_text_fits(uint32_t text_bytes, uint32_t reply_bytes, uint32_t outbox_max, uint32_t inbox_room);

/**
 * @brief Writes the text the face holds, as its provider writes it, ended inside the cap.
 *
 * @param slot The setting, which has to hold one.
 * @param[out] out A buffer of the cap's size.
 */
void long_text_held(const LongText *slot, char *out);

/**
 * @brief Hands a text that arrived to the receiver when it differs from the one the face holds.
 *
 * The phone sends the text with every save, so taking each arrival as a change would make every save
 * rebuild the face and refetch whatever follows a settings change. Only as much as the cap holds is
 * compared, so a longer text whose held part matches does not count as a change on every save.
 *
 * @param slot The setting.
 * @param text The text the message carries, ended.
 * @return True when it went to the receiver, so the save changed something.
 */
bool long_text_arrived(const LongText *slot, const char *text);

/** @} */
