# Testing Strategy

- **`test/core.test.ts`**: Covers core algorithms, including threshold ratings, CLS session window algorithms (handling gaps and spans), INP percentile calculation, pre-input LCP stopping rules, interactionId deduplication, transport output formatting, and queue overflow behaviors. Tests also cover edge cases like non-finite values, negative inputs, and empty arrays.
- **`test/browser.test.ts`**: Verifies the `attachToBrowser` adapter logic, ensuring it correctly attaches to `visibilitychange` and `pagehide` events, and that the `PerformanceObserver` properly processes and maps browser entries to `VitalEntry` objects. It also checks that cleanup functions correctly disconnect observers.
- **`test/index.test.ts`**: Verifies the public API surface area.