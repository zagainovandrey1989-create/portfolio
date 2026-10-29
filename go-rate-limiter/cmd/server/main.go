// Command server runs the rate-limited HTTP API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/zagainovandrey1989-create/portfolio/go-rate-limiter/internal/httpapi"
	"github.com/zagainovandrey1989-create/portfolio/go-rate-limiter/internal/ratelimit"
)

func envFloat(name string, def float64) float64 {
	if v, err := strconv.ParseFloat(os.Getenv(name), 64); err == nil {
		return v
	}
	return def
}

func envInt(name string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(name)); err == nil {
		return v
	}
	return def
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	limiter, err := ratelimit.New(ratelimit.Config{
		Rate:    envFloat("RATE_PER_SEC", 5),
		Burst:   envInt("BURST", 10),
		IdleTTL: 10 * time.Minute,
	})
	if err != nil {
		log.Error("invalid limiter config", "err", err)
		os.Exit(1)
	}

	addr := ":" + strconv.Itoa(envInt("PORT", 8080))
	srv := &http.Server{
		Addr:              addr,
		Handler:           httpapi.NewRouter(limiter, log),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Periodically drop idle buckets so memory stays bounded.
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if n := limiter.Evict(); n > 0 {
					log.Info("evicted idle buckets", "count", n)
				}
			}
		}
	}()

	go func() {
		log.Info("listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server error", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("graceful shutdown failed", "err", err)
	}
	log.Info("stopped")
}
