/**
 * @file stock_store.c
 * @brief The active stock store: holds the quotes, owns the appmessage stock channel, and
 * asks the phone for more whenever its turn on the face's cadence finds a poll due.
 *
 * @ingroup lib_stores
 */
#include "io/stores/stock_store.h"

#include <time.h>

#include "io/appmessage/appmessage.h"
#include "io/stores/store_cadence.h"
#include "io/stores/store_persist.h"
#include "io/stores/store_poll.h"

/**
 * @brief Delay before the first fetch after launch, in ms.
 *
 * It fires from the event loop so appmessage is open by then. The recurring poll then runs at the
 * configured interval.
 */
#define STOCK_FIRST_POLL_MS 700

/**
 * @var s_state
 * @brief The quotes the store holds, laid out as the blob that gets persisted.
 */
static struct
{
    uint8_t    tag;       ///< STORE_TAG_STOCK, so a restore can tell this blob from another shape
    StockStrip strip;     ///< The quotes as the phone last sent them
    time_t     last_sync; ///< When those quotes arrived
} s_state;
_Static_assert(sizeof(s_state) <= PERSIST_DATA_MAX_LENGTH, "stock state must fit one persist key");

static void (*s_cb)(void);     ///< Called whenever the quotes change, so the face can redraw
static AppTimer *s_timer;      ///< The catch-up fetch only. The recurring poll rides the cadence
static StorePoll s_poll;     ///< The interval, whether the store is live, and when it is next due
static uint32_t s_persist_key; ///< The persist slot the face handed us for the saved strip
static uint32_t s_saved_sum;   ///< Sum of the reading last written, so a reply that changes nothing is not written again

// --- state writers (internal: only the channel handler + the seed touch these) ---

/**
 * @brief Clear the watchlist back to empty.
 */
static void reset_state(void)
{
    s_state.strip.count = 0;
    s_state.last_sync = 0;
}

/**
 * @brief Stash the whole state so a relaunch can restore it. Only a live face writes.
 */
static void persist_save(void)
{
    if (s_poll.live)
    {
        store_save_changed(s_persist_key, &s_state, sizeof(s_state), STORE_READING_SIZE(s_state, last_sync),
                           STORE_TAG_STOCK, &s_saved_sum);
    }
}

/**
 * @brief Prefill the store from a seed, for dev builds and screenshots.
 *
 * `s_cb` is still NULL at the point init calls this, so no redraw fires here.
 *
 * @param seed The prefill to apply.
 */
static void apply_seed(const StockSeed *seed)
{
    if (seed->strip)
    {
        s_state.strip = *seed->strip;
    }
    s_state.last_sync = time(NULL);
    if (s_cb) s_cb();
}

// --- appmessage channel handler (the store owns its own wiring) ---

/**
 * @brief Stock channel. Takes the watchlist the reader unpacked and puts it away.
 *
 * A message that does not read clean leaves the last good quotes where they are, so a bad one can
 * never blank the watchlist.
 *
 * @param buf The raw wire bytes.
 * @param len How many bytes there are.
 */
static void on_stock_strip(const uint8_t *buf, uint16_t len)
{
    StockStrip built;
    if (!stock_wire_decode(buf, len, &built))
    {
        return;
    }

    s_state.strip = built;
    s_state.last_sync = time(NULL);
    persist_save();
    if (s_cb) s_cb();
}

// --- polling ---

/**
 * @brief The one-shot catch-up fetch, used at launch and when the panel turns up empty.
 *
 * @param data The timer context (unused).
 */
static void catch_up_fire(void *data)
{
    s_timer = NULL;
    appmessage_request_stock();
}

/**
 * @brief Cancel the catch-up fetch timer, if one is armed.
 */
static void stop_polling(void)
{
    if (s_timer)
    {
        app_timer_cancel(s_timer);
        s_timer = NULL;
    }
}

/**
 * @brief The store's turn on the face's cadence: poll when the deadline has come round.
 */
static void cadence_poll(void)
{
    if (store_poll_turn(&s_poll, time(NULL)))
    {
        appmessage_request_stock();
    }
}

// --- public API ---

void stock_store_subscribe(void (*cb)(void))
{
    s_cb = cb;
}

void stock_store_init(StockConfig cfg, const StockSeed *seed)
{
    s_poll.live = false; // only a live store goes live, see store_poll_set below
    s_persist_key = cfg.persist_key;
    reset_state();
    // the live flag is the gate the cadence turn reads, so registering here is harmless either way
    store_cadence_register(cadence_poll);

    if (cfg.live)
    {
        // the store owns the stock channel and claims it here, so a face that turns polling on later
        // through reconfigure still gets the reply to its poll. a face seeding fixtures passes
        // live = false and stays unsubscribed, so a real push cannot overwrite what it pinned
        appmessage_on_stock_strip(on_stock_strip);
    }

    if (seed)
    {
        apply_seed(seed); // s_cb is NULL until the face subscribes so no redraw yet
    }
    else if (cfg.live)
    {
        // restore the last good strip so a relaunch shows it right away. the first poll
        // then refreshes it in the background
        if (store_restore_reading(s_persist_key, &s_state, sizeof(s_state), STORE_READING_SIZE(s_state, last_sync),
                                  STORE_TAG_STOCK, &s_saved_sum))
        {
            // stock_store_slot bounds an index against this count, so pin it to what the slot
            // array actually holds before anything can ask for a slot past the end
            if (s_state.strip.count > STOCK_MAX_SLOTS)
            {
                s_state.strip.count = 0;
            }

            // the symbols come back off flash too, so each gets an end of its own before it is printed
            for (uint8_t i = 0; i < STOCK_MAX_SLOTS; i++)
            {
                s_state.strip.slot[i].symbol[STOCK_SYMBOL_LEN - 1] = '\0';
            }
        }
    }

    bool polling = store_poll_set(&s_poll, cfg.poll_min, cfg.live, time(NULL));
    if (cfg.live)
    {
        // one fetch shortly after launch so the strip is not left on -- while the first deadline
        // is still coming. poll_min 0 disables polling, matching reconfigure
        stop_polling();
        if (polling)
        {
            s_timer = app_timer_register(STOCK_FIRST_POLL_MS, catch_up_fire, NULL);
        }
    }
}

void stock_store_reconfigure(StockConfig cfg)
{
    // switching the store off clears the live flag, which stops the cadence turn too, and drops any
    // fetch still waiting. a store that keeps polling keeps its launch fetch, since a settings push
    // that lands in the first second would otherwise cancel it and leave restored quotes stale
    // until the next deadline
    if (!store_poll_set(&s_poll, cfg.poll_min, cfg.live, time(NULL)))
    {
        stop_polling();
        return;
    }

    // an empty store has nothing but -- to draw, so catch up right away. one that already
    // holds quotes waits for its deadline, so a save that only touched colours does not
    // fetch on the spot and spend a metered provider's quota. that deadline is a wall
    // clock boundary, so a save can bring it nearer but never past the interval's rate
    if (!s_timer && s_state.strip.count == 0)
    {
        s_timer = app_timer_register(STOCK_FIRST_POLL_MS, catch_up_fire, NULL);
    }
}

const StockStrip *stock_store_strip(void)
{
    return &s_state.strip;
}

const StockSlot *stock_store_slot(uint8_t index)
{
    if (index >= s_state.strip.count)
    {
        return NULL;
    }
    return &s_state.strip.slot[index];
}

int stock_store_age_s(void)
{
    return s_state.last_sync ? (int)(time(NULL) - s_state.last_sync) : -1;
}
