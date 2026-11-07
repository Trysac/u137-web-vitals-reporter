# Project Record

## Objective
Provide an enterprise-ready Core Web Vitals computation and telemetry reporting utility with exact web.dev standards compliance, deterministic queueing, and zero runtime dependencies.

## Scope
- Pure logic for computing LCP, INP, CLS, FCP, and TTFB.
- Bounded queue for metric storage and retry logic on transport failure.
- Standardized rating system based on web.dev thresholds.
- Adapter for attaching to browser `PerformanceObserver` and `visibilitychange` events.

## Out of Scope
- Soft navigation tracking.
- Attribution data.
- BFCache restore reporting.
- Prometheus wire format support.
- Collecting entries in tests via a real browser; unit tests use mocks.

## Factory run u137 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | gemini-3.8-flash | yes | 4463 | 11700 | 0 | 0 | 0.0236 |
| fix-1 | gemini-3.8-flash | no | 26458 | 6719 | 0 | 66538 | 0.0500 |
| fix-2 | gemini-3.8-flash | no | 28888 | 1224 | 0 | 81330 | 0.0324 |
| fix-3 | gemini-3.8-flash | no | 14573 | 172 | 0 | 10291 | 0.0123 |
| audit | gemini-3.1-flash-lite | no | 34155 | 643 | 0 | 30395 | 0.0103 |
| docs | gemini-3.1-flash-lite | no | 13625 | 1126 | 0 | 0 | 0.0051 |

Total: $0.1337. Prices: Anthropic list prices.
