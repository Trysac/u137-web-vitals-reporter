# Security Policy

## Threat Model

### Defended
- **Resource Exhaustion**: Memory exhaustion via unbounded queues is prevented by a mandatory FIFO cap (`maxQueue`, default 50).
- **Invalid Input**: The `observe` function filters out entries that are not finite numbers or have negative timestamps, preventing corrupted metric calculations.
- **Serialization**: Output is JSON-serialized to prevent injection in the transport layer.

### Not Defended
- **Transport Security**: The library relies on the provided `transport` function to handle authentication and secure transmission (e.g., HTTPS).
- **Runtime Tampering**: No protections against external scripts modifying the `window` or `PerformanceObserver` global state are implemented.