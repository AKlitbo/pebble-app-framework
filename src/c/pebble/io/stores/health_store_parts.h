/**
 * @file health_store_parts.h
 * @brief What the health store shares with its optional parts, the heart rate graph, the hourly
 * steps, and the heart rate day. A face never includes this. It names a part in its HealthConfig.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_stores
 * @{
 */

/**
 * @brief Asks the face to redraw, for a part whose own timer changed what it holds.
 */
void health_store_redraw(void);

/**
 * @brief When a local hour of today starts.
 *
 * Counted on the wall clock rather than as hours since midnight, because on the days the clocks
 * change the two part ways by an hour. An hour past the end of the day rolls onto the next
 * midnight, and the hour a spring change skips starts where the one after it does.
 *
 * @param today Today's local time, broken apart.
 * @param hour The hour of the day, 0 to 24.
 * @return The epoch the hour starts at.
 */
time_t health_hour_start(const struct tm *today, int hour);

#if defined(PBL_HEALTH)
/**
 * @brief Whether the watch actually has a reading for a metric over a time span.
 *
 * @param metric The health metric to check.
 * @param start Start of the span to check.
 * @param end End of the span to check.
 * @return True when the watch reports the metric available over that span.
 */
bool health_metric_available(HealthMetric metric, time_t start, time_t end);

/**
 * @brief Allocate scratch room for a minute-history read, off the heap for the length of the
 * read rather than sitting in the app's fixed footprint.
 *
 * What a Pebble app runs out of first is its image, and the heap does not count towards that.
 *
 * @param records How many minute records to make room for.
 * @return The scratch buffer, or NULL if the allocation failed.
 */
HealthMinuteData *health_scratch_take(int records);

/**
 * @brief Called for each good record a walk of the minute log finds.
 *
 * @param hour The hour of today the record falls in.
 * @param record The record.
 * @param context What the caller handed the walk.
 */
typedef void (*MinuteRecordFn)(int hour, const HealthMinuteData *record, void *context);

/**
 * @brief Walks the watch's minute log over today's hours and hands each good record, with the hour
 * it falls in, to the `each` callback.
 *
 * The records come into a buffer borrowed from the heap, so the hours go STEP_CATCHUP_HOURS (six)
 * at a time to keep that buffer a few KB. Each read blocks on a scan of the watch's whole minute
 * log, and costs the same whatever window it asks for, so a batch that size takes a day in four
 * reads. Each hour is the wall clock's own, so on a clock change day a record lands in the hour the
 * chart labels.
 *
 * @param local Today's local time, broken apart.
 * @param first_hour The first hour to read.
 * @param end_hour The hour to stop before.
 * @param until The time to stop at, for a walk that ends partway through its last hour. One that ends
 * on an hour passes that hour's start.
 * @param each Called for each good record.
 * @param context Handed to each.
 * @return False when there was no room for the records, so nothing was read.
 */
bool health_walk_minute_log(const struct tm *local, int first_hour, int end_hour, time_t until,
                            MinuteRecordFn each, void *context);
#endif

/** @} */
