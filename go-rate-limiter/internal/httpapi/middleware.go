// Package httpapi wires the rate limiter into an HTTP service.
package httpapi

import (
	"encoding/json"
	"log/slog"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/zagainovandrey1989-create/portfolio/go-rate-limiter/internal/ratelimit"
)

// KeyFunc extracts the rate-limit key from a request.
type KeyFunc func(*http.Request) string

// KeyByAPIKeyOrIP uses the X-API-Key header when present, otherwise the
// client IP (RemoteAddr, without the port).
func KeyByAPIKeyOrIP(r *http.Request) string {
	if k := strings.TrimSpace(r.Header.Get("X-API-Key")); k != "" {
		return "key:" + k
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return "ip:" + host
}

// RateLimit returns middleware that rejects requests over the limit with
// 429 and standard RateLimit-* / Retry-After headers.
func RateLimit(l *ratelimit.Limiter, key KeyFunc, log *slog.Logger) func(http.Handler) http.Handler {
	burst := strconv.Itoa(l.Config().Burst)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			k := key(r)
			d := l.Allow(k)
			w.Header().Set("RateLimit-Limit", burst)
			w.Header().Set("RateLimit-Remaining", strconv.Itoa(d.Remaining))
			if !d.Allowed {
				secs := int(math.Ceil(d.RetryAfter.Seconds()))
				if secs < 1 {
					secs = 1
				}
				w.Header().Set("Retry-After", strconv.Itoa(secs))
				log.Info("rate limited", "key", k, "path", r.URL.Path, "retry_after_s", secs)
				writeJSON(w, http.StatusTooManyRequests, map[string]any{
					"error":            "rate_limited",
					"retry_after_secs": secs,
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// NewRouter builds the service routes.
func NewRouter(l *ratelimit.Limiter, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	api := http.NewServeMux()
	api.HandleFunc("GET /api/time", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"now": time.Now().UTC().Format(time.RFC3339)})
	})
	api.HandleFunc("POST /api/echo", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"echo": body})
	})

	mux.Handle("/api/", RateLimit(l, KeyByAPIKeyOrIP, log)(api))
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
