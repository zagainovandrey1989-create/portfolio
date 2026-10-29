package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zagainovandrey1989-create/portfolio/go-rate-limiter/internal/ratelimit"
)

func newServer(t *testing.T, burst int) *httptest.Server {
	t.Helper()
	l, err := ratelimit.New(ratelimit.Config{Rate: 0.001, Burst: burst})
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := httptest.NewServer(NewRouter(l, log))
	t.Cleanup(srv.Close)
	return srv
}

func get(t *testing.T, url, apiKey string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func TestRateLimitReturns429WithHeaders(t *testing.T) {
	srv := newServer(t, 2)
	for i := 0; i < 2; i++ {
		if resp := get(t, srv.URL+"/api/time", ""); resp.StatusCode != http.StatusOK {
			t.Fatalf("request %d: status %d, want 200", i, resp.StatusCode)
		}
	}
	resp := get(t, srv.URL+"/api/time", "")
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status %d, want 429", resp.StatusCode)
	}
	if resp.Header.Get("Retry-After") == "" {
		t.Fatal("missing Retry-After header")
	}
	if got := resp.Header.Get("RateLimit-Limit"); got != "2" {
		t.Fatalf("RateLimit-Limit = %q, want 2", got)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "rate_limited") {
		t.Fatalf("unexpected body %s", body)
	}
}

func TestAPIKeysHaveSeparateBuckets(t *testing.T) {
	srv := newServer(t, 1)
	if get(t, srv.URL+"/api/time", "alice").StatusCode != http.StatusOK {
		t.Fatal("alice first request should pass")
	}
	if get(t, srv.URL+"/api/time", "bob").StatusCode != http.StatusOK {
		t.Fatal("bob first request should pass")
	}
	if get(t, srv.URL+"/api/time", "alice").StatusCode != http.StatusTooManyRequests {
		t.Fatal("alice second request should be limited")
	}
}

func TestHealthzIsNotRateLimited(t *testing.T) {
	srv := newServer(t, 1)
	for i := 0; i < 5; i++ {
		if resp := get(t, srv.URL+"/healthz", ""); resp.StatusCode != http.StatusOK {
			t.Fatalf("healthz status %d", resp.StatusCode)
		}
	}
}

func TestEchoValidatesJSON(t *testing.T) {
	srv := newServer(t, 10)
	resp, err := http.Post(srv.URL+"/api/echo", "application/json", strings.NewReader("{bad"))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", resp.StatusCode)
	}
	resp2, err := http.Post(srv.URL+"/api/echo", "application/json", strings.NewReader(`{"a":1}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("status %d, want 200", resp2.StatusCode)
	}
}

func TestKeyByAPIKeyOrIP(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "10.0.0.7:5555"
	if got := KeyByAPIKeyOrIP(r); got != "ip:10.0.0.7" {
		t.Fatalf("got %q", got)
	}
	r.Header.Set("X-API-Key", " k1 ")
	if got := KeyByAPIKeyOrIP(r); got != "key:k1" {
		t.Fatalf("got %q", got)
	}
}
