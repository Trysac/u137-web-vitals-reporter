# @trysac/web-vitals-reporter

Teams want field Web Vitals in their own metrics backend, but the browser APIs are event streams with subtle rules: CLS uses session windows, LCP stops at the first input, and INP ignores outliers on busy pages. Reimplementations get these rules wrong and lose data when the page is hidden. This TypeScript library keeps the rules in a pure, testable core fed by normalized entries and flushes batched metrics through an injected transport.

## Installation

```bash
npm install @trysac/web-vitals-reporter
```

## Usage

```ts
import { createReporter, attachToBrowser } from "@trysac/web-vitals-reporter";
let id = 0;
const reporter = createReporter({
  page: window.location.pathname,
  newId: () => `vital-${++id}`,
  transport: (body) => navigator.sendBeacon("/api/vitals", body),
});
attachToBrowser(reporter, window);
```

## API Summary

- `createReporter(opts)`: Initializes a reporter with a `transport` function, `page` string, and `newId` generator. Defaults `maxQueue` to 50.
- `observe(entry)`: Feeds normalized performance entries into the reporter.
- `onHidden()`: Computes final metrics (CLS, LCP, INP) based on page state transition.
- `flush()`: Attempts to send queued metrics. Retains metrics if transport fails.
- `rate(name, value)`: Returns "good", "needs-improvement", or "poor" based on web.dev thresholds.
- `computeCls(shifts)`: Calculates Cumulative Layout Shift using session window logic.
- `computeInp(durations, count)`: Calculates Interaction to Next Paint including outlier exclusion.

### Why not `web-vitals` package?

Unlike the official `web-vitals` package, this library is a pure, zero-dependency core that provides deterministic, unit-testable calculations and a bounded FIFO queue, ensuring control over data delivery and retention without browser-side side effects.

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the threat model and input validation limits.