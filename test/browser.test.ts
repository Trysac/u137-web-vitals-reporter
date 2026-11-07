import { describe, expect, it, vi } from "vitest";
import { attachToBrowser, type PerformanceObserverEntryListLike } from "../src/browser.js";
import { createReporter } from "../src/core.js";

describe("attachToBrowser adapter", () => {
  it("attaches to document visibilitychange and cleans up", () => {
    const onHidden = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const mockReporter = {
      observe: vi.fn(),
      onHidden,
      flush,
      stats: vi.fn(),
    };

    const listeners: Record<string, () => void> = {};
    const mockDoc = {
      visibilityState: "hidden",
      addEventListener: vi.fn((type: string, listener: () => void) => {
        listeners[type] = listener;
      }),
      removeEventListener: vi.fn((type: string) => {
        delete listeners[type];
      }),
    };

    const cleanup = attachToBrowser(mockReporter, {
      document: mockDoc,
    });

    expect(mockDoc.addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    listeners.visibilitychange?.();
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);

    cleanup();
    expect(mockDoc.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });

  it("attaches to window pagehide event", () => {
    const onHidden = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const mockReporter = {
      observe: vi.fn(),
      onHidden,
      flush,
      stats: vi.fn(),
    };

    const listeners: Record<string, () => void> = {};
    const mockWin = {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        listeners[type] = listener;
      }),
      removeEventListener: vi.fn((type: string) => {
        delete listeners[type];
      }),
    };

    const cleanup = attachToBrowser(mockReporter, mockWin);
    listeners.pagehide?.();
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);

    cleanup();
    expect(mockWin.removeEventListener).toHaveBeenCalled();
  });

  it("attaches to PerformanceObserver and processes supported entry types", () => {
    const reporter = createReporter({
      page: "/browser-test",
      newId: () => "id-1",
      transport: () => true,
    });

    type Callback = (list: PerformanceObserverEntryListLike) => void;
    const observers: Array<{ type: string; cb: Callback; disconnected: boolean }> = [];

    class MockPO {
      static supportedEntryTypes = [
        "paint",
        "navigation",
        "largest-contentful-paint",
        "layout-shift",
        "first-input",
        "event",
      ];
      private cb: Callback;
      constructor(cb: Callback) {
        this.cb = cb;
      }
      observe(options: { type: string }) {
        observers.push({ type: options.type, cb: this.cb, disconnected: false });
      }
      disconnect() {
        const current = observers.find((o) => o.cb === this.cb);
        if (current) current.disconnected = true;
      }
    }

    const cleanup = attachToBrowser(reporter, {
      PerformanceObserver: MockPO,
    });

    expect(observers.length).toBe(6);

    // Trigger paint
    const paintObs = observers.find((o) => o.type === "paint");
    paintObs?.cb({
      getEntries: () => [
        {
          entryType: "paint",
          name: "first-contentful-paint",
          startTime: 850,
        },
      ],
    });

    // Trigger navigation
    const navObs = observers.find((o) => o.type === "navigation");
    navObs?.cb({
      getEntries: () => [
        {
          entryType: "navigation",
          responseStart: 320,
        },
      ],
    });

    // Trigger lcp
    const lcpObs = observers.find((o) => o.type === "largest-contentful-paint");
    lcpObs?.cb({
      getEntries: () => [
        {
          entryType: "largest-contentful-paint",
          startTime: 1400,
        },
      ],
    });

    // Trigger layout-shift
    const clsObs = observers.find((o) => o.type === "layout-shift");
    clsObs?.cb({
      getEntries: () => [
        {
          entryType: "layout-shift",
          value: 0.05,
          startTime: 400,
        },
      ],
    });

    // Trigger first-input
    const inputObs = observers.find((o) => o.type === "first-input");
    inputObs?.cb({
      getEntries: () => [{ entryType: "first-input" }],
    });

    // Trigger event
    const eventObs = observers.find((o) => o.type === "event");
    eventObs?.cb({
      getEntries: () => [
        {
          entryType: "event",
          interactionId: 10,
          duration: 80,
        },
      ],
    });

    expect(reporter.stats().queued).toBe(2); // FCP and TTFB queued immediately

    reporter.onHidden();
    // Now CLS, LCP, INP are queued
    expect(reporter.stats().queued).toBe(5);

    cleanup();
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });
});
