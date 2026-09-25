/**
 * @file calendar_store.c
 * @brief The active calendar store: holds the agenda, owns the appmessage calendar channel, and
 * asks the phone for more whenever its turn on the face's cadence finds a poll due.
 *
 * @ingroup lib_stores
 */
#include "io/stores/calendar_store.h"

#include <time.h>

#include "io/appmessage/appmessage.h"
#include "io/stores/store_cadence.h"
#include "io/stores/store_persist.h"
#include "io/stores/store_poll.h"

/**
 * @brief Delay before the first fetch after launch, in ms.
 *
 * It fires from the event loop so appmessage is open by then, and lands a touch after the weather
 * and stock first fetches so they are not fighting over the outbox at boot. The recurring poll then
 * runs at the configured interval.
 */
#define CALENDAR_FIRST_POLL_MS 1100

/**
 * @var s_state
 * @brief The agenda the store holds right now.
 */
static struct
{
    CalendarStrip strip;     ///< The agenda as the phone last sent it
    time_t        last_sync; ///< When that agenda arrived
} s_state;

/**
 * @brief How many events the saved snapshot keeps.
 *
 * The full strip of 6 events is too big to persist. It blows past the 256 byte persist key ceiling
 * and the save just fails. A relaunch saves the first few events plus the sync time instead, which
 * is enough to paint the agenda straight away before the first poll after launch refreshes the full
 * strip.
 */
#define CALENDAR_PERSIST_SLOTS 4

/**
 * @brief The trimmed snapshot saved to flash. Holds only the first few events, not the whole strip.
 */
typedef struct
{
    uint8_t       tag;   ///< STORE_TAG_CALENDAR, so a restore can tell this blob from another shape
    uint8_t       count; ///< How many of the event slots hold a real event
    CalendarEvent event[CALENDAR_PERSIST_SLOTS]; ///< The first few events off the full strip
    time_t        last_sync; ///< When the saved snapshot was fetched
} CalendarPersist;
_Static_assert(sizeof(CalendarPersist) <= PERSIST_DATA_MAX_LENGTH, "calendar snapshot must fit one persist key");

static void (*s_cb)(void);     ///< Called whenever the agenda changes, so the face can redraw
static AppTimer *s_timer;      ///< The catch-up fetch only. The recurring poll rides the cadence
static StorePoll s_poll;     ///< The interval, whether the store is live, and when it is next due
static uint32_t s_persist_key; ///< The persist slot the face handed us for the saved strip
static uint32_t s_saved_sum;   ///< Sum of the reading last written, so a reply that changes nothing is not written again

// --- state writers (internal: only the channel handler + the seed touch these) ---

/**
 * @brief Clear the agenda back to empty.
 */
static void reset_state(void)
{
    s_state.strip.count = 0;
    s_state.last_sync = 0;
}

/**
 * @brief Stash a trimmed snapshot so a relaunch can restore it. Only a live face writes.
 */
static void persist_save(void)
{
    if (!s_poll.live)
    {
        return;
    }

    // keep only the first few events. the rest stay zeroed so the saved bytes are deterministic
    CalendarPersist snap = {0};
    snap.count = s_state.strip.count < CALENDAR_PERSIST_SLOTS ? s_state.strip.count : CALENDAR_PERSIST_SLOTS;
    for (uint8_t i = 0; i < snap.count; i++)
    {
        snap.event[i] = s_state.strip.event[i];
    }
    snap.last_sync = s_state.last_sync;
    store_save_changed(s_persist_key, &snap, sizeof(snap), STORE_READING_SIZE(snap, last_sync),
                       STORE_TAG_CALENDAR, &s_saved_sum);
}

/**
 * @brief Prefill the store from a seed, for dev builds and screenshots.
 *
 * `s_cb` is still NULL at the point init calls this, so no redraw fires here.
 *
 * @param seed The prefill to apply.
 */
static void apply_seed(const CalendarSeed *seed)
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
 * @brief Calendar channel. Takes the agenda the reader unpacked and puts it away.
 *
 * A message that does not read clean leaves the last good agenda where it is, so a bad one can
 * never blank the panel.
 *
 * @param buf The raw wire bytes.
 * @param len How many bytes there are.
 */
static void on_calendar_strip(const uint8_t *buf, uint16_t len)
{
    CalendarStrip built;
    if (!calendar_wire_decode(buf, len, &built))
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
 * @brief The one-shot catch-up fetch, used at launch and after a settings save.
 *
 * @param data The timer context (unused).
 */
static void catch_up_fire(void *data)
{
    s_timer = NULL;
    appmessage_request_calendar();
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
        appmessage_request_calendar();
    }
}

// --- public API ---

void calendar_store_subscribe(void (*cb)(void))
{
    s_cb = cb;
}

void calendar_store_init(CalendarConfig cfg, const CalendarSeed *seed)
{
    s_poll.live = false; // only a live store goes live, see store_poll_set below
    s_persist_key = cfg.persist_key;
    reset_state();
    // the live flag is the gate the cadence turn reads, so registering here is harmless either way
    store_cadence_register(cadence_poll);

    if (cfg.live)
    {
        // the store owns the calendar channel and claims it here, so a face that turns polling on
        // later through reconfigure still gets the reply to its poll. a face seeding fixtures passes
        // live = false and stays unsubscribed, so a real push cannot overwrite what it pinned
        appmessage_on_calendar_strip(on_calendar_strip);
    }

    if (seed)
    {
        apply_seed(seed); // s_cb is NULL until the face subscribes so no redraw yet
    }
    else if (cfg.live)
    {
        // restore the snapshot so a relaunch shows the last agenda right away. the first poll then
        // refreshes the full strip in the background
        CalendarPersist snap;
        if (store_restore_reading(s_persist_key, &snap, sizeof(snap), STORE_READING_SIZE(snap, last_sync),
                                  STORE_TAG_CALENDAR, &s_saved_sum))
        {
            uint8_t n = snap.count < CALENDAR_PERSIST_SLOTS ? snap.count : CALENDAR_PERSIST_SLOTS;
            s_state.strip.count = n;
            for (uint8_t i = 0; i < n; i++)
            {
                s_state.strip.event[i] = snap.event[i];

                // the text comes back off flash too, so each field gets an end of its own before it is printed
                s_state.strip.event[i].title[CAL_TITLE_LEN - 1] = '\0';
                s_state.strip.event[i].location[CAL_LOC_LEN - 1] = '\0';
            }
            s_state.last_sync = snap.last_sync;
        }
    }

    bool polling = store_poll_set(&s_poll, cfg.poll_min, cfg.live, time(NULL));
    if (cfg.live)
    {
        // one fetch shortly after launch so the agenda is not blank while the first deadline is
        // still coming. poll_min 0 disables polling, matching reconfigure
        stop_polling();
        if (polling)
        {
            s_timer = app_timer_register(CALENDAR_FIRST_POLL_MS, catch_up_fire, NULL);
        }
    }
}

void calendar_store_reconfigure(CalendarConfig cfg)
{
    // switching the store off clears the live flag, which stops the cadence turn too, and drops any
    // fetch still waiting. a store that keeps polling keeps its launch fetch, since a settings push
    // that lands in the first second would otherwise cancel it and leave a restored agenda stale
    // until the next deadline
    if (!store_poll_set(&s_poll, cfg.poll_min, cfg.live, time(NULL)))
    {
        stop_polling();
        return;
    }

    // an empty store has nothing to draw, so catch up right away. one that already holds an
    // agenda waits for its deadline, so a save that only touched colours does not refetch
    // the whole feed. the phone refetches on its own when the feed's address changes
    if (!s_timer && s_state.strip.count == 0)
    {
        s_timer = app_timer_register(CALENDAR_FIRST_POLL_MS, catch_up_fire, NULL);
    }
}

const CalendarStrip *calendar_store_strip(void)
{
    return &s_state.strip;
}

const CalendarEvent *calendar_store_event(uint8_t index)
{
    if (index >= s_state.strip.count)
    {
        return NULL;
    }
    return &s_state.strip.event[index];
}

int calendar_store_age_s(void)
{
    return s_state.last_sync ? (int)(time(NULL) - s_state.last_sync) : -1;
}
