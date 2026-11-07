import { describe, expect, it } from "vitest";
import {
  computeCls,
  computeInp,
  createReporter,
  type MetricName,
  type QueuedMetric,
  type ReporterPayload,
  rate,
  THRESHOLDS,
  type VitalEntry,
} from "../src/core.js";

describe("Web Vitals Core", () => {
  it("rate() satisfies acceptance criteria for LCP, CLS, and INP thresholds", () => {
    expect(rate("LCP", 2500)).toBe("good");
    expect(rate("LCP", 2501)).toBe("needs-improvement");
    expect(rate("LCP", 4001)).toBe("poor");
    expect(rate("CLS", 0.1)).toBe("good");
    expect(rate("INP", 500)).toBe("needs-improvement");
  });

  it("rate() handles boundaries for all metrics", () => {
    expect(rate("FCP", 1800)).toBe("good");
    expect(rate("FCP", 1801)).toBe("needs-improvement");
    expect(rate("FCP", 3000)).toBe("needs-improvement");
    expect(rate("FCP", 3001)).toBe("poor");

    expect(rate("TTFB", 800)).toBe("good");
    expect(rate("TTFB", 801)).toBe("needs-improvement");
    expect(rate("TTFB", 1800)).toBe("needs-improvement");
    expect(rate("TTFB", 1801)).toBe("poor");

    expect(rate("CLS", 0.25)).toBe("needs-improvement");
    expect(rate("CLS", 0.2501)).toBe("poor");

    expect(rate("INP", 200)).toBe("good");
    expect(rate("INP", 201)).toBe("needs-improvement");
    expect(rate("INP", 501)).toBe("poor");

    expect(THRESHOLDS.LCP).toEqual([2500, 4000]);
    expect(() => rate("UNKNOWN" as unknown as MetricName, 100)).toThrow(TypeError);
  });

  it("computeCls() satisfies acceptance criteria for session windows", () => {
    const shifts = [
      { value: 0.05, startTime: 0 },
      { value: 0.05, startTime: 500 },
      { value: 0.2, startTime: 2000 },
      { value: 0.5, startTime: 2100, hadRecentInput: true },
    ];
    expect(computeCls(shifts)).toBe(0.2);

    const sevenShifts = Array.from({ length: 7 }, (_, i) => ({
      value: 0.01,
      startTime: i * 900,
    }));
    // Shifts at 0, 900, 1800, 2700, 3600, 4500 (6 shifts <= 4500 ms span), 5400 (starts new window)
    // Max window has 6 shifts of 0.01 = 0.06
    expect(computeCls(sevenShifts)).toBeCloseTo(0.06, 12);
  });

  it("computeCls() handles edge cases: empty shifts, non-finite values, and negative times", () => {
    expect(computeCls([])).toBe(0);
    expect(
      computeCls([
        { value: Number.NaN, startTime: 100 },
        { value: 0.1, startTime: -10 },
        { value: Number.POSITIVE_INFINITY, startTime: 50 },
      ]),
    ).toBe(0);

    // Test window gap >= 1000ms splitting windows
    const gapShifts = [
      { value: 0.1, startTime: 1000 },
      { value: 0.3, startTime: 2500 }, // gap is 1500ms > 1000ms
    ];
    expect(computeCls(gapShifts)).toBe(0.3);
  });

  it("computeInp() satisfies acceptance criteria", () => {
    expect(computeInp([120, 80, 300], 3)).toBe(300);

    const durations120 = Array.from({ length: 120 }, (_, i) => i + 1);
    // durations sorted descending: 120, 119, 118, 117 ...
    // index = Math.min(119, Math.floor(120 / 50)) = 2
    // 120 - 2 = 118
    expect(computeInp(durations120, 120)).toBe(118);

    expect(computeInp([], 0)).toBeNull();
  });

  it("computeInp() handles non-finite values and negative counts", () => {
    expect(computeInp([Number.NaN, -5, Number.POSITIVE_INFINITY], 10)).toBeNull();
    expect(computeInp([100], -5)).toBe(100);
  });

  it("Feeding lcp entries at 1200 and 2100, then input, then lcp 3000 reports LCP 2100", () => {
    const recorded: string[] = [];
    let idCount = 0;
    const reporter = createReporter({
      page: "/test",
      newId: () => `id-${++idCount}`,
      transport: (body) => {
        recorded.push(body);
        return true;
      },
    });

    reporter.observe({ type: "lcp", startTime: 1200 });
    reporter.observe({ type: "lcp", startTime: 2100 });
    reporter.observe({ type: "input" });
    reporter.observe({ type: "lcp", startTime: 3000 });
    reporter.onHidden();

    void reporter.flush();
    expect(recorded.length).toBe(1);
    const recordedBody = recorded[0] ?? "";
    const parsed = JSON.parse(recordedBody) as ReporterPayload;
    const lcp = parsed.metrics.find((m: QueuedMetric) => m.name === "LCP");
    expect(lcp).toBeDefined();
    expect(lcp?.value).toBe(2100);
  });

  it("Event entries with interactionId 0 are ignored, and sharing interactionId counts once with max duration", async () => {
    const recorded: string[] = [];
    const reporter = createReporter({
      page: "/inp-test",
      newId: () => "id-1",
      transport: (body) => {
        recorded.push(body);
        return true;
      },
    });

    reporter.observe({ type: "event", duration: 400, interactionId: 0 }); // ignored
    reporter.observe({ type: "event", duration: 150, interactionId: 1 });
    reporter.observe({ type: "event", duration: 250, interactionId: 1 }); // max 250
    reporter.observe({ type: "event", duration: 50, interactionId: 2 });

    reporter.onHidden();
    await reporter.flush();

    expect(recorded.length).toBe(1);
    const recordedBody = recorded[0] ?? "";
    const parsed = JSON.parse(recordedBody) as ReporterPayload;
    const inp = parsed.metrics.find((m: QueuedMetric) => m.name === "INP");
    expect(inp).toBeDefined();
    expect(inp?.value).toBe(250);
  });

  it("After navigation responseStart 300 and FCP paint 900, flush calls transport with exact payload", async () => {
    const recorded: string[] = [];
    let counter = 0;
    const reporter = createReporter({
      page: "/home",
      newId: () => `v1-${++counter}`,
      transport: (body) => {
        recorded.push(body);
        return true;
      },
    });

    reporter.observe({ type: "navigation", responseStart: 300 });
    reporter.observe({ type: "paint", name: "first-contentful-paint", startTime: 900 });

    await reporter.flush();
    expect(recorded.length).toBe(1);
    expect(recorded[0]).toBe(
      '{"page":"/home","metrics":[{"name":"TTFB","value":300,"rating":"good","id":"v1-1"},{"name":"FCP","value":900,"rating":"good","id":"v1-2"}]}',
    );
  });

  it("A transport returning false keeps metrics queued; maxQueue 50 drops oldest on 51st; onHidden twice only reports once", async () => {
    let transportResult: boolean | Promise<boolean> = false;
    const calls: string[] = [];
    let id = 0;
    const reporter = createReporter({
      page: "/overflow",
      maxQueue: 50,
      newId: () => `m-${++id}`,
      transport: (body) => {
        calls.push(body);
        return transportResult;
      },
    });

    // Feed 51 entries (TTFB)
    for (let i = 1; i <= 51; i++) {
      reporter.observe({ type: "navigation", responseStart: i * 10 });
    }

    const s1 = reporter.stats();
    expect(s1.dropped).toBe(1);
    expect(s1.queued).toBe(50);
    expect(s1.sent).toBe(0);

    // Flush fails
    await reporter.flush();
    expect(calls.length).toBe(1);
    expect(reporter.stats().queued).toBe(50);

    // Now flush succeeds
    transportResult = true;
    await reporter.flush();
    expect(calls.length).toBe(2);
    expect(reporter.stats().queued).toBe(0);
    expect(reporter.stats().sent).toBe(50);

    // onHidden called twice
    reporter.onHidden();
    reporter.onHidden();
    // Should report CLS = 0 (and no LCP or INP)
    expect(reporter.stats().queued).toBe(1);
    await reporter.flush();
    const thirdCall = calls[2] ?? "";
    const parsed = JSON.parse(thirdCall) as ReporterPayload;
    expect(parsed.metrics.length).toBe(1);
    expect(parsed.metrics[0]?.name).toBe("CLS");
    expect(parsed.metrics[0]?.value).toBe(0);
    expect(parsed.metrics[0]?.rating).toBe("good");
  });

  it("flush with empty queue does not call transport", async () => {
    let called = false;
    const reporter = createReporter({
      page: "/empty",
      newId: () => "1",
      transport: () => {
        called = true;
        return true;
      },
    });

    await reporter.flush();
    expect(called).toBe(false);
  });

  it("transport throwing exception counts as false", async () => {
    const reporter = createReporter({
      page: "/err",
      newId: () => "1",
      transport: () => {
        throw new Error("Network failure");
      },
    });

    reporter.observe({ type: "navigation", responseStart: 100 });
    await reporter.flush();
    expect(reporter.stats().queued).toBe(1);
    expect(reporter.stats().sent).toBe(0);
  });

  it("createReporter validates constructor options", () => {
    expect(() => createReporter(null as unknown as Parameters<typeof createReporter>[0])).toThrow(
      TypeError,
    );
    expect(() => createReporter({} as unknown as Parameters<typeof createReporter>[0])).toThrow(
      TypeError,
    );
    expect(() =>
      createReporter({
        transport: "not-a-fn" as unknown as (body: string) => boolean,
        page: "/",
        newId: () => "1",
      }),
    ).toThrow(TypeError);
    expect(() =>
      createReporter({
        transport: () => true,
        page: "  ",
        newId: () => "1",
      }),
    ).toThrow(TypeError);
    expect(() =>
      createReporter({
        transport: () => true,
        page: "/",
        newId: null as unknown as () => string,
      }),
    ).toThrow(TypeError);
    expect(() =>
      createReporter({
        transport: () => true,
        page: "/",
        newId: () => "1",
        maxQueue: 0,
      }),
    ).toThrow(TypeError);
  });

  it("observe ignores invalid and negative values", () => {
    const reporter = createReporter({
      page: "/test",
      newId: () => "1",
      transport: () => true,
    });

    reporter.observe(null as unknown as VitalEntry);
    reporter.observe({} as unknown as VitalEntry);
    reporter.observe({ type: "navigation", responseStart: -100 });
    reporter.observe({ type: "paint", name: "other-paint", startTime: 50 });
    reporter.observe({ type: "paint", name: "first-contentful-paint", startTime: -1 });
    reporter.observe({ type: "layout-shift", value: -1, startTime: 10 });
    reporter.observe({ type: "lcp", startTime: -1 });
    reporter.observe({ type: "event", duration: -10, interactionId: 1 });

    expect(reporter.stats().queued).toBe(0);
  });
});
