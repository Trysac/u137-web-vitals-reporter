/**
 * Optional browser adapter for attaching Reporter to PerformanceObserver
 * and visibilitychange events.
 */

import type { Reporter } from "./core.js";

/**
 * Minimal browser window abstraction to avoid depending on DOM typings in core.
 */
export interface MinimalBrowserWindow {
  readonly document?: {
    readonly visibilityState?: string;
    addEventListener?: (
      type: string,
      listener: () => void,
      options?: boolean | AddEventListenerOptions,
    ) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };
  readonly addEventListener?: (
    type: string,
    listener: () => void,
    options?: boolean | AddEventListenerOptions,
  ) => void;
  readonly removeEventListener?: (type: string, listener: () => void) => void;
  readonly PerformanceObserver?: {
    readonly supportedEntryTypes?: readonly string[];
    new (callback: (list: PerformanceObserverEntryListLike) => void): PerformanceObserverLike;
  };
}

export interface PerformanceObserverEntryListLike {
  getEntries(): readonly PerformanceEntryLike[];
}

export interface PerformanceEntryLike {
  readonly entryType: string;
  readonly name?: string;
  readonly startTime?: number;
  readonly duration?: number;
  readonly value?: number;
  readonly hadRecentInput?: boolean;
  readonly interactionId?: number;
  readonly responseStart?: number;
}

export interface PerformanceObserverLike {
  observe(options: { type?: string; entryTypes?: readonly string[]; buffered?: boolean }): void;
  disconnect(): void;
}

/**
 * Attaches a Reporter to browser PerformanceObserver instances and page visibility listeners.
 *
 * @param reporter - The initialized reporter.
 * @param win - The browser window context.
 * @returns Cleanup function to disconnect observers and remove listeners.
 */
export function attachToBrowser(reporter: Reporter, win: MinimalBrowserWindow): () => void {
  const cleanups: Array<() => void> = [];

  const handleVisibilityChange = (): void => {
    if (win.document?.visibilityState === "hidden") {
      reporter.onHidden();
      void reporter.flush();
    }
  };

  if (win.document?.addEventListener) {
    win.document.addEventListener("visibilitychange", handleVisibilityChange);
    cleanups.push(() => {
      win.document?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    });
  }

  if (win.addEventListener) {
    const handlePageHide = (): void => {
      reporter.onHidden();
      void reporter.flush();
    };
    win.addEventListener("pagehide", handlePageHide);
    cleanups.push(() => {
      win.removeEventListener?.("pagehide", handlePageHide);
    });
  }

  const PO = win.PerformanceObserver;
  if (PO) {
    const supported = PO.supportedEntryTypes ?? [];
    const observeType = (type: string, handle: (entry: PerformanceEntryLike) => void): void => {
      if (supported.length > 0 && !supported.includes(type)) {
        return;
      }
      try {
        const observer = new PO((list) => {
          for (const entry of list.getEntries()) {
            handle(entry);
          }
        });
        observer.observe({ type, buffered: true });
        cleanups.push(() => observer.disconnect());
      } catch {
        // Browser may reject observation of certain types
      }
    };

    observeType("paint", (entry) => {
      if (entry.name && typeof entry.startTime === "number") {
        reporter.observe({
          type: "paint",
          name: entry.name,
          startTime: entry.startTime,
        });
      }
    });

    observeType("navigation", (entry) => {
      if (typeof entry.responseStart === "number") {
        reporter.observe({
          type: "navigation",
          responseStart: entry.responseStart,
        });
      }
    });

    observeType("largest-contentful-paint", (entry) => {
      if (typeof entry.startTime === "number") {
        reporter.observe({
          type: "lcp",
          startTime: entry.startTime,
        });
      }
    });

    observeType("layout-shift", (entry) => {
      if (typeof entry.value === "number" && typeof entry.startTime === "number") {
        reporter.observe({
          type: "layout-shift",
          value: entry.value,
          startTime: entry.startTime,
          ...(entry.hadRecentInput !== undefined ? { hadRecentInput: entry.hadRecentInput } : {}),
        });
      }
    });

    observeType("first-input", () => {
      reporter.observe({ type: "input" });
    });

    observeType("event", (entry) => {
      if (typeof entry.duration === "number" && typeof entry.interactionId === "number") {
        reporter.observe({
          type: "event",
          duration: entry.duration,
          interactionId: entry.interactionId,
        });
      }
    });
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
