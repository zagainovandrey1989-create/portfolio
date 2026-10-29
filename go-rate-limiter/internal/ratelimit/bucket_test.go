package ratelimit

import (
	"sync"
	"testing"
	"time"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

func newTestLimiter(t *testing.T, cfg Config) (*Limiter, *fakeClock) {
	t.Helper()
	clk := &fakeClock{now: time.Unix(1_700_000_000, 0)}
	l, err := NewWithClock(cfg, clk)
	if err != nil {
		t.Fatalf("NewWithClock: %v", err)
	}
	return l, clk
}

func TestConfigValidate(t *testing.T) {
	cases := []struct {
		name string
		cfg  Config
		ok   bool
	}{
		{"valid", Config{Rate: 1, Burst: 1}, true},
		{"zero rate", Config{Rate: 0, Burst: 1}, false},
		{"zero burst", Config{Rate: 1, Burst: 0}, false},
		{"negative ttl", Config{Rate: 1, Burst: 1, IdleTTL: -time.Second}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.cfg.Validate()
			if (err == nil) != tc.ok {
				t.Fatalf("Validate() err=%v, want ok=%v", err, tc.ok)
			}
		})
	}
}

func TestBurstThenDeny(t *testing.T) {
	l, _ := newTestLimiter(t, Config{Rate: 1, Burst: 3})
	for i := 0; i < 3; i++ {
		if d := l.Allow("a"); !d.Allowed {
			t.Fatalf("request %d denied, want allowed", i)
		}
	}
	d := l.Allow("a")
	if d.Allowed {
		t.Fatal("4th request allowed, want denied")
	}
	if d.RetryAfter != time.Second {
		t.Fatalf("RetryAfter = %v, want 1s", d.RetryAfter)
	}
}

func TestRefillOverTime(t *testing.T) {
	l, clk := newTestLimiter(t, Config{Rate: 2, Burst: 2})
	l.Allow("a")
	l.Allow("a")
	if l.Allow("a").Allowed {
		t.Fatal("expected bucket to be empty")
	}
	clk.Advance(500 * time.Millisecond) // +1 token at 2 tokens/s
	if !l.Allow("a").Allowed {
		t.Fatal("expected one token after 500ms")
	}
	clk.Advance(10 * time.Second) // refill is capped at Burst
	d := l.Allow("a")
	if !d.Allowed || d.Remaining != 1 {
		t.Fatalf("got %+v, want allowed with 1 remaining", d)
	}
}

func TestKeysAreIndependent(t *testing.T) {
	l, _ := newTestLimiter(t, Config{Rate: 1, Burst: 1})
	if !l.Allow("a").Allowed || !l.Allow("b").Allowed {
		t.Fatal("first request per key must be allowed")
	}
	if l.Allow("a").Allowed {
		t.Fatal("second request for a must be denied")
	}
}

func TestAllowNAllOrNothing(t *testing.T) {
	l, _ := newTestLimiter(t, Config{Rate: 1, Burst: 5})
	if !l.AllowN("a", 4).Allowed {
		t.Fatal("AllowN(4) should succeed on a full bucket")
	}
	d := l.AllowN("a", 2)
	if d.Allowed || d.Remaining != 1 {
		t.Fatalf("got %+v, want denied with 1 remaining (no partial consumption)", d)
	}
	if d := l.AllowN("a", 6); d.Allowed || d.RetryAfter != -1 {
		t.Fatalf("request larger than burst must never succeed, got %+v", d)
	}
}

func TestEvictIdleKeys(t *testing.T) {
	l, clk := newTestLimiter(t, Config{Rate: 1, Burst: 1, IdleTTL: time.Minute})
	l.Allow("old")
	clk.Advance(2 * time.Minute)
	l.Allow("fresh")
	if n := l.Evict(); n != 1 {
		t.Fatalf("Evict() = %d, want 1", n)
	}
	if l.Len() != 1 {
		t.Fatalf("Len() = %d, want 1", l.Len())
	}
}

func TestConcurrentAllowNeverExceedsBurst(t *testing.T) {
	l, _ := newTestLimiter(t, Config{Rate: 1, Burst: 50})
	var wg sync.WaitGroup
	var mu sync.Mutex
	allowed := 0
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if l.Allow("shared").Allowed {
				mu.Lock()
				allowed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if allowed != 50 {
		t.Fatalf("allowed = %d, want exactly 50 (clock frozen)", allowed)
	}
}

func BenchmarkAllowSingleKey(b *testing.B) {
	l, _ := New(Config{Rate: 1e9, Burst: 1 << 30})
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		l.Allow("k")
	}
}
