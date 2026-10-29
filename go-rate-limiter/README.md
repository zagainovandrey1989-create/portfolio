# Go Rate Limiter

A small HTTP service in Go with a concurrency-safe, per-key **token bucket** rate limiter.
Standard library only — no third-party dependencies.

Built with modern AI coding tools; every change reviewed and tested by me.

## Features

- Per-key token buckets (key = `X-API-Key` header, or client IP as a fallback)
- All-or-nothing `AllowN`, exact `Retry-After` computation
- Standard headers: `RateLimit-Limit`, `RateLimit-Remaining`, `Retry-After`; JSON `429` body
- Idle-key eviction so memory stays bounded under many clients
- Injectable clock → fully deterministic tests
- Graceful shutdown, structured JSON logging (`log/slog`), sane server timeouts
- `/healthz` is never rate limited

## Run

```bash
go run ./cmd/server                      # :8080, 5 req/s, burst 10
RATE_PER_SEC=1 BURST=3 PORT=9000 go run ./cmd/server
```

```bash
curl -i localhost:8080/api/time
curl -i -H 'X-API-Key: alice' localhost:8080/api/time
curl -i -X POST localhost:8080/api/echo -d '{"hello":"world"}'
```

Docker:

```bash
docker build -t go-rate-limiter .
docker run -p 8080:8080 go-rate-limiter
```

## Test

```bash
go vet ./...
go test -race ./...
go test -bench . ./internal/ratelimit
```

Tests cover burst/deny, refill over time, refill cap, independent keys, all-or-nothing `AllowN`,
idle eviction, a race test proving the burst is never exceeded under 200 concurrent goroutines,
and HTTP-level behaviour (429 + headers, per-API-key buckets, unlimited health check, JSON validation).

## Design notes

- **One mutex, map of buckets.** Simple and correct; at this scale lock contention is negligible
  (see the benchmark). Sharding the map would be the next step for very high request rates.
- **Lazy refill.** Tokens are recalculated on access from elapsed time — no background ticker per key.
- **Requests larger than the burst** can never succeed, so they return `RetryAfter = -1` instead of a misleading wait.
- In a multi-instance deployment the same interface can be backed by Redis (`INCR` + TTL or a Lua token bucket).

Author: Andrei Zagainov
