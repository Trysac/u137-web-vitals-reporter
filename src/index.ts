/**
 * Public entry point of @trysac/web-vitals-reporter.
 */

export {
  attachToBrowser,
  type MinimalBrowserWindow,
  type PerformanceEntryLike,
  type PerformanceObserverEntryListLike,
  type PerformanceObserverLike,
} from "./browser.js";
export {
  type CreateReporterOptions,
  computeCls,
  computeInp,
  createReporter,
  type MetricName,
  type QueuedMetric,
  type Rating,
  type Reporter,
  type ReporterPayload,
  type ReporterStats,
  rate,
  type ShiftEntry,
  THRESHOLDS,
  type VitalEntry,
} from "./core.js";
