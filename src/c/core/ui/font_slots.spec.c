/**
 * @file font_slots.spec.c
 * @brief Host tests for the font registry's decisions about owning and freeing fonts.
 *
 * Every mistake here is a memory one that the screen hides. Freeing a font another slot still
 * draws with is a crash or garbage text later, freeing a system font faults at teardown, and a
 * swap that frees nothing leaks a font every time the wearer changes the pick. The cases worth
 * pinning are the ones a refactor could break without any text changing: a swap that has nothing
 * to do, a handle in several slots, a system font, a failed load, and a freed address that comes
 * back for a different font.
 *
 * The load and unload calls are fakes that hand out addresses from a small pool and count what
 * they were asked to do, so each test can say exactly which fonts were loaded and freed.
 */
#include "unity.h"

#include <stddef.h>
#include <stdint.h>

#include "ui/font_slots.h"

#define SLOT_COUNT 4 ///< Slots in the test tables
#define POOL_SIZE 8  ///< Fake fonts the loader can hand out

/// Resource ids the tests load, which mean nothing beyond being different
#define RES_TEKO 101
#define RES_GOTHIC 102

static void *s_handles[SLOT_COUNT];
static uint8_t s_states[SLOT_COUNT];
static uint32_t s_resources[SLOT_COUNT];
static const FontSlots s_slots = {.handles = s_handles, .states = s_states, .count = SLOT_COUNT};

static int s_pool[POOL_SIZE];             ///< The fake fonts, whose addresses are the handles
static int s_next;                        ///< The pool entry the next load hands out
static bool s_fail_next;                  ///< Set to make the next load fail
static int s_loads;                       ///< How many loads were asked for
static uint32_t s_last_resource;          ///< The resource the last load asked for
static int s_unloads[POOL_SIZE];          ///< How many times each fake font was freed
static int s_unload_total;                ///< How many frees there were in all
static int s_system;                      ///< Stands in for a system font, at an address outside the pool
static void *s_system_font = &s_system;   ///< The system font's handle

/** @brief Hands out the next fake font, or NULL when the test asked for a failure. */
static void *fake_load(uint32_t resource)
{
    s_loads++;
    s_last_resource = resource;
    if (s_fail_next)
    {
        s_fail_next = false;
        return NULL;
    }

    return &s_pool[s_next++];
}

/** @brief Counts a free against the fake font it was for. */
static void fake_unload(void *handle)
{
    s_unload_total++;
    for (int i = 0; i < POOL_SIZE; i++)
    {
        if (handle == &s_pool[i])
        {
            s_unloads[i]++;
        }
    }
}

void setUp(void)
{
    for (int i = 0; i < SLOT_COUNT; i++)
    {
        s_handles[i] = NULL;
        s_states[i] = FONT_SLOT_UNOWNED;
        s_resources[i] = 0;
    }
    for (int i = 0; i < POOL_SIZE; i++)
    {
        s_unloads[i] = 0;
    }
    s_next = 0;
    s_fail_next = false;
    s_loads = 0;
    s_last_resource = 0;
    s_unload_total = 0;
}

void tearDown(void) {}

/** @brief A swap on an empty slot loads and frees nothing, since there is nothing to free. */
void test_swap_on_an_empty_slot_just_loads(void)
{
    bool result = font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_PTR(&s_pool[0], s_handles[0]);
    TEST_ASSERT_EQUAL_INT(RES_TEKO, s_last_resource);
    TEST_ASSERT_EQUAL_INT(0, s_unload_total);
}

/** @brief A settings save with the same pick must not free and reload the font every time. */
void test_swap_to_the_same_resource_does_nothing(void)
{
    font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    bool result = font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_INT(1, s_loads);
    TEST_ASSERT_EQUAL_INT(0, s_unload_total);
}

/** @brief The first swap after start-up's load of the same font does nothing, rather than a free and a reload. */
void test_swap_after_a_load_of_the_same_resource_does_nothing(void)
{
    font_slots_load(&s_slots, s_resources, 0, RES_TEKO, fake_load);

    bool result = font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_INT(1, s_loads);
    TEST_ASSERT_EQUAL_INT(0, s_unload_total);
}

/** @brief A new pick frees the old font once, or every change of pick leaks a font. */
void test_swap_to_a_new_resource_frees_the_old_font(void)
{
    font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    bool result = font_slots_swap(&s_slots, s_resources, 0, RES_GOTHIC, fake_load, fake_unload);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_INT(1, s_unloads[0]);
    TEST_ASSERT_EQUAL_PTR(&s_pool[1], s_handles[0]);
}

/** @brief A font another owned slot still draws with stays loaded, and the end frees it once. */
void test_swap_keeps_a_font_another_owned_slot_holds(void)
{
    font_slots_load(&s_slots, s_resources, 0, RES_TEKO, fake_load);
    font_slots_put(&s_slots, 1, s_handles[0], true);

    font_slots_swap(&s_slots, s_resources, 0, RES_GOTHIC, fake_load, fake_unload);
    int during = s_unloads[0];
    font_slots_unload_all(&s_slots, fake_unload);

    TEST_ASSERT_EQUAL_INT(0, during);
    TEST_ASSERT_EQUAL_INT(1, s_unloads[0]);
    TEST_ASSERT_EQUAL_INT(1, s_unloads[1]);
}

/**
 * @brief A font whose only other slot holds it as a system font is neither freed nor leaked.
 *
 * Freeing it would leave that slot drawing with memory that is gone. Leaving it with no owner
 * would mean nothing frees it at the end. So that slot takes over owning it.
 */
void test_swap_hands_a_font_to_a_slot_holding_it_as_a_system_font(void)
{
    font_slots_load(&s_slots, s_resources, 0, RES_TEKO, fake_load);
    font_slots_put(&s_slots, 1, s_handles[0], false);

    font_slots_swap(&s_slots, s_resources, 0, RES_GOTHIC, fake_load, fake_unload);
    int during = s_unloads[0];
    uint8_t heir = s_states[1];
    font_slots_unload_all(&s_slots, fake_unload);

    TEST_ASSERT_EQUAL_INT(0, during);
    TEST_ASSERT_EQUAL_INT(FONT_SLOT_OWNED, heir);
    TEST_ASSERT_EQUAL_INT(1, s_unloads[0]);
}

/** @brief The firmware owns a system font, and freeing one faults. */
void test_swap_never_frees_a_system_font(void)
{
    font_slots_put(&s_slots, 0, s_system_font, false);

    font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_EQUAL_INT(0, s_unload_total);
    TEST_ASSERT_EQUAL_PTR(&s_pool[0], s_handles[0]);
}

/** @brief A load that fails leaves an empty slot, so the system font draws rather than a freed one. */
void test_swap_with_a_failed_load_leaves_the_slot_empty(void)
{
    font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);
    s_fail_next = true;

    bool result = font_slots_swap(&s_slots, s_resources, 0, RES_GOTHIC, fake_load, fake_unload);

    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_NULL(s_handles[0]);
    TEST_ASSERT_EQUAL_INT(FONT_SLOT_UNOWNED, s_states[0]);
    TEST_ASSERT_EQUAL_INT(1, s_unloads[0]);
}

/** @brief After a failed load the same pick tries again, since the heap may have room by then. */
void test_swap_after_a_failed_load_tries_again(void)
{
    s_fail_next = true;
    font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    bool result = font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_INT(2, s_loads);
}

/**
 * @brief A freed font whose address comes back for a different font still counts as a change.
 *
 * The font is freed outside the swap, and the next font the face registers lands at the same
 * address. Trusting the address would skip the swap and leave the wrong typeface in the slot.
 */
void test_swap_is_not_fooled_by_a_reused_address(void)
{
    font_slots_load(&s_slots, s_resources, 0, RES_TEKO, fake_load);
    font_slots_unload_all(&s_slots, fake_unload);
    font_slots_put(&s_slots, 0, &s_pool[0], true);

    font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_EQUAL_INT(2, s_loads);
    TEST_ASSERT_EQUAL_INT(2, s_unloads[0]);
    TEST_ASSERT_EQUAL_PTR(&s_pool[1], s_handles[0]);
}

/** @brief The loader handing a freed address back for a different resource still leaves the slot to swap. */
void test_swap_is_not_fooled_by_a_reloaded_address(void)
{
    font_slots_load(&s_slots, s_resources, 0, RES_TEKO, fake_load);
    font_slots_unload_all(&s_slots, fake_unload);
    s_next = 0;
    font_slots_load(&s_slots, s_resources, 0, RES_GOTHIC, fake_load);

    font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_EQUAL_INT(3, s_loads);
    TEST_ASSERT_EQUAL_INT(RES_TEKO, s_last_resource);
    TEST_ASSERT_EQUAL_INT(2, s_unloads[0]);
}

/** @brief The end of the session clears the record, so a swap afterwards loads the font again rather than trusting a freed one. */
void test_swap_after_unload_all_loads_again(void)
{
    font_slots_load(&s_slots, s_resources, 0, RES_TEKO, fake_load);
    font_slots_unload_all(&s_slots, fake_unload);

    bool result = font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_INT(2, s_loads);
    TEST_ASSERT_EQUAL_PTR(&s_pool[1], s_handles[0]);
}

/** @brief A plain register over a loaded slot drops its record, so a swap back to the old resource loads it. */
void test_put_over_a_loaded_slot_forgets_its_resource(void)
{
    font_slots_load(&s_slots, s_resources, 0, RES_TEKO, fake_load);
    font_slots_put(&s_slots, 0, &s_pool[5], true);

    font_slots_swap(&s_slots, s_resources, 0, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_EQUAL_INT(2, s_loads);
    TEST_ASSERT_EQUAL_INT(1, s_unloads[5]);
}

/** @brief A font in several slots is freed once, and a system font not at all, or teardown faults. */
void test_unload_all_frees_each_owned_font_once(void)
{
    font_slots_load(&s_slots, s_resources, 0, RES_TEKO, fake_load);
    font_slots_put(&s_slots, 1, s_handles[0], true);
    font_slots_put(&s_slots, 2, s_handles[0], false);
    font_slots_put(&s_slots, 3, s_system_font, false);

    font_slots_unload_all(&s_slots, fake_unload);

    TEST_ASSERT_EQUAL_INT(1, s_unload_total);
    TEST_ASSERT_EQUAL_INT(1, s_unloads[0]);
    for (int i = 0; i < SLOT_COUNT; i++)
    {
        TEST_ASSERT_NULL(s_handles[i]);
        TEST_ASSERT_EQUAL_INT(FONT_SLOT_UNOWNED, s_states[i]);
    }
}

/** @brief A slot past the tables loads nothing, since a font loaded there could never be freed. */
void test_a_slot_past_the_tables_loads_nothing(void)
{
    bool loaded = font_slots_load(&s_slots, s_resources, SLOT_COUNT, RES_TEKO, fake_load);
    bool swapped = font_slots_swap(&s_slots, s_resources, -1, RES_TEKO, fake_load, fake_unload);

    TEST_ASSERT_FALSE(loaded);
    TEST_ASSERT_FALSE(swapped);
    TEST_ASSERT_EQUAL_INT(0, s_loads);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_swap_on_an_empty_slot_just_loads);
    RUN_TEST(test_swap_to_the_same_resource_does_nothing);
    RUN_TEST(test_swap_after_a_load_of_the_same_resource_does_nothing);
    RUN_TEST(test_swap_to_a_new_resource_frees_the_old_font);
    RUN_TEST(test_swap_keeps_a_font_another_owned_slot_holds);
    RUN_TEST(test_swap_hands_a_font_to_a_slot_holding_it_as_a_system_font);
    RUN_TEST(test_swap_never_frees_a_system_font);
    RUN_TEST(test_swap_with_a_failed_load_leaves_the_slot_empty);
    RUN_TEST(test_swap_after_a_failed_load_tries_again);
    RUN_TEST(test_swap_is_not_fooled_by_a_reused_address);
    RUN_TEST(test_swap_is_not_fooled_by_a_reloaded_address);
    RUN_TEST(test_swap_after_unload_all_loads_again);
    RUN_TEST(test_put_over_a_loaded_slot_forgets_its_resource);
    RUN_TEST(test_unload_all_frees_each_owned_font_once);
    RUN_TEST(test_a_slot_past_the_tables_loads_nothing);

    return UNITY_END();
}
