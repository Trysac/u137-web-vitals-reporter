# Architecture

`@trysac/web-vitals-reporter` separates the calculation logic and queue orchestration from browser APIs.

## Modules

1. **`src/core.ts`**:
   - Contains pure algorithms for calculating Cumulative Layout Shift (`computeCls`), Interaction to Next Paint (`computeInp`), and threshold evaluations (`rate`).
   - Defines the `createReporter` factory that manages a FIFO bounded queue, deduplicates interaction IDs, tracks the pre-input LCP candidate, and formats the output payload for transport.
   - Contains no `document`, `window`, or Node-specific dependencies.

2. **`src/browser.ts`**:
   - Thin adapter providing `attachToBrowser`.
   - Hooks into `PerformanceObserver` entry streams (`paint`, `navigation`, `largest-contentful-paint`, `layout-shift`, `first-input`, `event`) and maps them into normalized `VitalEntry` objects.
   - Listens to `visibilitychange` and `pagehide` to trigger `onHidden()` and `flush()`.

3. **`src/index.ts`**:
   - Re-exports the public interface.
