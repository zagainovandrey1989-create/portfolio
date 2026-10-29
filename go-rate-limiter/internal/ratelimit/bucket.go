// Package ratelimit implements a concurrency-safe, per-key token bucket
// rate limiter with idle-key eviction.
package ratelimit

import (
	"errors"
	"sync"
	"time"
)

// Clock abstracts time so tests can be deterministic.
type Clock interface {
	Now() time.Time
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

// Config describes a limiter: Rate tokens are added per second up to Burst.
type Config struct {
	Rate    float64       // tokens per second, > 0
	Burst   int           // bucket capacity, >= 1
	IdleTTL time.Duration // buckets unused for this long are evicted (0 = never)
}

// Validate reports whether the configuration is usable.
func (c Config) Validate() error {
	switch {
	case c.Rate <= 0:
		return errors.New("ratelimit: Rate must be > 0")
	case c.Burst < 1:
		return errors.New("ratelimit: Burst must be >= 1")
	case c.IdleTTL < 0:
		return errors.New("ratelimit: IdleTTL must be >= 0")
	}
	return nil
}

// Decision is the result of an Allow call.
type Decision struct {
	Allowed    bool
	Remaining  int           // whole tokens left after this call
	RetryAfter time.Duration // how long until one token is available (0 if allowed)
}

type bucket struct {
	tokens   float64
	updated  time.Time
	lastSeen time.Time
}

// Limiter is a per-key token bucket limiter. The zero value is not usable;
// create one with New.
type Limiter struct {
	cfg     Config
	clock   Clock
	mu      sync.Mutex
	buckets map[string]*bucket
}

// New returns a Limiter using the real clock.
func New(cfg Config) (*Limiter, error) {
	return NewWithClock(cfg, realClock{})
}

// NewWithClock returns a Limiter using the given clock.
func NewWithClock(cfg Config, clock Clock) (*Limiter, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if clock == nil {
		clock = realClock{}
	}
	return &Limiter{cfg: cfg, clock: clock, buckets: make(map[string]*bucket)}, nil
}

// Allow consumes one token for key if available.
func (l *Limiter) Allow(key string) Decision {
	return l.AllowN(key, 1)
}

// AllowN consumes n tokens for key if all are available (all-or-nothing).
func (l *Limiter) AllowN(key string, n int) Decision {
	if n < 1 {
		n = 1
	}
	now := l.clock.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: float64(l.cfg.Burst), updated: now}
		l.buckets[key] = b
	}
	l.refill(b, now)
	b.lastSeen = now

	if n > l.cfg.Burst {
		return Decision{Allowed: false, Remaining: int(b.tokens), RetryAfter: -1}
	}
	if b.tokens >= float64(n) {
		b.tokens -= float64(n)
		return Decision{Allowed: true, Remaining: int(b.tokens)}
	}
	missing := float64(n) - b.tokens
	wait := time.Duration(missing / l.cfg.Rate * float64(time.Second))
	return Decision{Allowed: false, Remaining: int(b.tokens), RetryAfter: wait}
}

func (l *Limiter) refill(b *bucket, now time.Time) {
	elapsed := now.Sub(b.updated).Seconds()
	if elapsed <= 0 {
		return
	}
	b.tokens += elapsed * l.cfg.Rate
	if max := float64(l.cfg.Burst); b.tokens > max {
		b.tokens = max
	}
	b.updated = now
}

// Evict removes buckets idle for longer than IdleTTL and returns how many
// were removed. It is a no-op when IdleTTL is 0.
func (l *Limiter) Evict() int {
	if l.cfg.IdleTTL == 0 {
		return 0
	}
	now := l.clock.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	removed := 0
	for k, b := range l.buckets {
		if now.Sub(b.lastSeen) > l.cfg.IdleTTL {
			delete(l.buckets, k)
			removed++
		}
	}
	return removed
}

// Len returns the number of tracked keys.
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

// Config returns the limiter configuration.
func (l *Limiter) Config() Config { return l.cfg }
