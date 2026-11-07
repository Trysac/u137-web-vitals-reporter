# Decouple Web Vitals Calculation Core from Browser DOM

Status: accepted (generated, pending human review)

## Context

Traditional client-side Web Vitals libraries directly attach to browser globals, making automated testing difficult, introducing flaky timing issues, and preventing usage in worker or simulated environments.

## Decision

Implement all session-windowing algorithms, percentile calculations, and queue management inside a pure core module (`src/core.ts`) without DOM references, while providing an optional browser adapter (`src/browser.ts`) for browser attachment.

## Consequences

Tests are 100% deterministic, runtime dependencies remain zero, and consumers can run identical calculation logic in any JavaScript runtime.
