import type { TimeRange } from "./types";

/** Display labels for the (future) range selector — Stage 1 defines these alongside the type so UI/service never invent their own copy independently. */
export const TIME_RANGE_LABELS: Readonly<Record<TimeRange, string>> = {
  today: "Today",
  last7Days: "Last 7 days",
  last30Days: "Last 30 days",
  last90Days: "Last 90 days",
  allTime: "All time",
};

export const DEFAULT_TIME_RANGE: TimeRange = "last30Days";

/**
 * Growth metrics (queries/growth-metrics.ts) need a genuine "previous
 * equal-length period" to compare against — `allTime` has no such period
 * (there is no "before all time"). Growth for `allTime` is computed as
 * if `DEFAULT_GROWTH_TIME_RANGE` had been requested instead; every other
 * metric in the snapshot still honors `allTime` literally.
 */
export const DEFAULT_GROWTH_TIME_RANGE: TimeRange = "last30Days";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const TIME_RANGE_DAYS: Readonly<Partial<Record<TimeRange, number>>> = {
  today: 1,
  last7Days: 7,
  last30Days: 30,
  last90Days: 90,
};
