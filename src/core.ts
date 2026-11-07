/**
 * Core domain types, thresholds, calculations, and reporter for Web Vitals.
 *
 * Zero DOM dependencies; fully deterministic and unit testable.
 */

/**
 * Metric names supported by the library.
 */
export type MetricName = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";

/**
 * Metric rating according to web.dev standards.
 */
export type Rating = "good" | "needs-improvement" | "poor";

/**
 * Published thresholds for Web Vitals (checked web.dev).
 * Formatted as [goodBoundary, poorBoundary]:
 * - good: value <= goodBoundary
 * - needs-improvement: goodBoundary < value <= poorBoundary
 * - poor: value > poorBoundary
 */
export const THRESHOLDS: Record<MetricName, readonly [number, number]> = Object.freeze({
  LCP: [2500, 4000] as const,
  INP: [200, 500] as const,
  CLS: [0.1, 0.25] as const,
  FCP: [1800, 3000] as const,
  TTFB: [800, 1800] as const,
});

/**
 * Normalized performance entry fed into the reporter.
 */
export type VitalEntry =
  | {
      readonly type: "layout-shift";
      readonly value: number;
      readonly startTime: number;
      readonly hadRecentInput?: boolean;
    }
  | { readonly type: "lcp"; readonly startTime: number }
  | { readonly type: "event"; readonly duration: number; readonly interactionId: number }
  | { readonly type: "paint"; readonly name: string; readonly startTime: number }
  | { readonly type: "navigation"; readonly responseStart: number }
  | { readonly type: "input" };

/**
 * Individual layout shift entry input to computeCls.
 */
export interface ShiftEntry {
  readonly value: number;
  readonly startTime: number;
  readonly hadRecentInput?: boolean;
}

/**
 * Emitted metric payload sent over the wire.
 */
export interface QueuedMetric {
  readonly name: MetricName;
  readonly value: number;
  readonly rating: Rating;
  readonly id: string;
}

/**
 * Payload serialized for the transport function.
 */
export interface ReporterPayload {
  readonly page: string;
  readonly metrics: QueuedMetric[];
}

/**
 * Statistics tracking queued, dropped, and successfully sent metrics.
 */
export interface ReporterStats {
  queued: number;
  dropped: number;
  sent: number;
}

/**
 * Reporter interface for observing vitals entries and flushing payloads.
 */
export interface Reporter {
  observe(entry: VitalEntry): void;
  onHidden(): void;
  flush(): Promise<void>;
  stats(): ReporterStats;
}

/**
 * Configuration options for createReporter.
 */
export interface CreateReporterOptions {
  readonly transport: (body: string) => boolean | Promise<boolean>;
  readonly page: string;
  readonly newId: () => string;
  readonly maxQueue?: number;
}

/**
 * Rates a metric value against standard web.dev thresholds.
 *
 * @param name - The metric name.
 * @param value - The measured value.
 * @returns Rating category: "good", "needs-improvement", or "poor".
 */
export function rate(name: MetricName, value: number): Rating {
  const thresholds = THRESHOLDS[name];
  if (!thresholds) {
    throw new TypeError(`Unknown metric name: ${String(name)}`);
  }
  const [good, poor] = thresholds;
  if (value <= good) {
    return "good";
  }
  if (value <= poor) {
    return "needs-improvement";
  }
  return "poor";
}

/**
 * Computes Cumulative Layout Shift (CLS) over session windows.
 * Session windows continue while gap < 1000ms and span < 5000ms.
 * Returns the maximum window sum rounded to 4 decimal places.
 *
 * @param shifts - List of shift entries.
 */
export function computeCls(shifts: readonly ShiftEntry[]): number {
  const validShifts = shifts.filter(
    (s) =>
      !s.hadRecentInput &&
      typeof s.value === "number" &&
      Number.isFinite(s.value) &&
      s.value >= 0 &&
      typeof s.startTime === "number" &&
      Number.isFinite(s.startTime) &&
      s.startTime >= 0,
  );

  if (validShifts.length === 0) {
    return 0;
  }

  // Sort chronologically by startTime
  const sorted = [...validShifts].sort((a, b) => a.startTime - b.startTime);

  let maxCls = 0;
  let currentCls = 0;
  let windowStart = sorted[0]?.startTime ?? 0;
  let prevShiftTime = windowStart;

  for (const shift of sorted) {
    if (shift.startTime - prevShiftTime < 1000 && shift.startTime - windowStart < 5000) {
      currentCls += shift.value;
    } else {
      if (currentCls > maxCls) {
        maxCls = currentCls;
      }
      windowStart = shift.startTime;
      currentCls = shift.value;
    }
    prevShiftTime = shift.startTime;
  }

  if (currentCls > maxCls) {
    maxCls = currentCls;
  }

  return Math.round(maxCls * 10000) / 10000;
}

/**
 * Computes Interaction to Next Paint (INP) from interaction durations.
 * Durations are sorted descending; returns duration at index Math.min(len - 1, Math.floor(interactionCount / 50)).
 * Returns null if durations array is empty.
 *
 * @param durations - Durations of unique interactions.
 * @param interactionCount - Total interaction count on the page.
 */
export function computeInp(durations: readonly number[], interactionCount: number): number | null {
  const valid = durations.filter((d) => typeof d === "number" && Number.isFinite(d) && d >= 0);
  if (valid.length === 0) {
    return null;
  }
  const sorted = [...valid].sort((a, b) => b - a);
  const safeInteractionCount = Math.max(0, interactionCount);
  const index = Math.min(sorted.length - 1, Math.floor(safeInteractionCount / 50));
  const value = sorted[index];
  return value !== undefined ? Math.round(value) : null;
}

/**
 * Creates a Web Vitals reporter instance.
 *
 * @param opts - Reporter configuration.
 * @returns A Reporter instance.
 */
export function createReporter(opts: CreateReporterOptions): Reporter {
  if (typeof opts !== "object" || opts === null) {
    throw new TypeError("options must be an object");
  }
  if (typeof opts.transport !== "function") {
    throw new TypeError("transport must be a function");
  }
  if (typeof opts.page !== "string" || opts.page.trim() === "") {
    throw new TypeError("page must be a non-empty string");
  }
  if (typeof opts.newId !== "function") {
    throw new TypeError("newId must be a function");
  }
  const maxQueue = opts.maxQueue ?? 50;
  if (typeof maxQueue !== "number" || !Number.isFinite(maxQueue) || maxQueue < 1) {
    throw new TypeError("maxQueue must be a positive number (>= 1)");
  }

  const page = opts.page;
  const transport = opts.transport;
  const newId = opts.newId;

  let queue: QueuedMetric[] = [];
  let droppedCount = 0;
  let sentCount = 0;

  // Internal metric trackers
  let lastLcpCandidate: number | null = null;
  let hadInput = false;
  let hasHidden = false;

  const shifts: ShiftEntry[] = [];
  const interactionDurations = new Map<number, number>();
  let interactionCount = 0;

  function enqueue(name: MetricName, rawValue: number): void {
    const value = name === "CLS" ? Math.round(rawValue * 10000) / 10000 : Math.round(rawValue);
    const rating = rate(name, value);
    const item: QueuedMetric = {
      name,
      value,
      rating,
      id: newId(),
    };

    if (queue.length >= maxQueue) {
      queue.shift();
      droppedCount++;
    }
    queue.push(item);
  }

  return {
    observe(entry: VitalEntry): void {
      if (!entry || typeof entry !== "object" || typeof entry.type !== "string") {
        return;
      }

      switch (entry.type) {
        case "navigation": {
          if (
            typeof entry.responseStart === "number" &&
            Number.isFinite(entry.responseStart) &&
            entry.responseStart >= 0
          ) {
            enqueue("TTFB", entry.responseStart);
          }
          break;
        }
        case "paint": {
          if (
            entry.name === "first-contentful-paint" &&
            typeof entry.startTime === "number" &&
            Number.isFinite(entry.startTime) &&
            entry.startTime >= 0
          ) {
            enqueue("FCP", entry.startTime);
          }
          break;
        }
        case "layout-shift": {
          if (
            typeof entry.value === "number" &&
            Number.isFinite(entry.value) &&
            entry.value >= 0 &&
            typeof entry.startTime === "number" &&
            Number.isFinite(entry.startTime) &&
            entry.startTime >= 0
          ) {
            shifts.push({
              value: entry.value,
              startTime: entry.startTime,
              ...(entry.hadRecentInput !== undefined
                ? { hadRecentInput: entry.hadRecentInput }
                : {}),
            });
          }
          break;
        }
        case "input": {
          hadInput = true;
          break;
        }
        case "lcp": {
          if (
            !hadInput &&
            !hasHidden &&
            typeof entry.startTime === "number" &&
            Number.isFinite(entry.startTime) &&
            entry.startTime >= 0
          ) {
            lastLcpCandidate = entry.startTime;
          }
          break;
        }
        case "event": {
          if (
            typeof entry.interactionId === "number" &&
            Number.isFinite(entry.interactionId) &&
            entry.interactionId > 0 &&
            typeof entry.duration === "number" &&
            Number.isFinite(entry.duration) &&
            entry.duration >= 0
          ) {
            const existing = interactionDurations.get(entry.interactionId);
            if (existing === undefined) {
              interactionDurations.set(entry.interactionId, entry.duration);
              interactionCount++;
            } else if (entry.duration > existing) {
              interactionDurations.set(entry.interactionId, entry.duration);
            }
          }
          break;
        }
      }
    },

    onHidden(): void {
      if (hasHidden) {
        return;
      }
      hasHidden = true;

      // CLS is always reported (0 if no shifts)
      const cls = computeCls(shifts);
      enqueue("CLS", cls);

      // LCP reported only if a candidate was seen
      if (lastLcpCandidate !== null) {
        enqueue("LCP", lastLcpCandidate);
      }

      // INP reported only if interactions occurred
      const inp = computeInp(Array.from(interactionDurations.values()), interactionCount);
      if (inp !== null) {
        enqueue("INP", inp);
      }
    },

    async flush(): Promise<void> {
      if (queue.length === 0) {
        return;
      }
      const metricsToSend = [...queue];
      // Explicitly serialize with keys in order: name, value, rating, id
      const metricsJson = metricsToSend.map(
        (m) =>
          `{"name":${JSON.stringify(m.name)},"value":${m.value},"rating":${JSON.stringify(m.rating)},"id":${JSON.stringify(m.id)}}`,
      );
      const body = `{"page":${JSON.stringify(page)},"metrics":[${metricsJson.join(",")}]}`;

      let success = false;
      try {
        const res = await transport(body);
        success = res === true;
      } catch {
        success = false;
      }

      if (success) {
        // Only remove the metrics that were successfully sent
        queue = queue.slice(metricsToSend.length);
        sentCount += metricsToSend.length;
      }
    },

    stats(): ReporterStats {
      return {
        queued: queue.length,
        dropped: droppedCount,
        sent: sentCount,
      };
    },
  };
}
