# Andrei Zagainov — Portfolio

Five small, production-style projects in different stacks. Each one has tests, a README with
run instructions, and its own CI workflow (GitHub Actions) that runs on every push.

I design the solution, break it into tasks and deliver it with modern AI coding tools.
Every change is reviewed and tested by me before it is merged.

| Project | Stack | What it shows |
|---|---|---|
| [java-orders-api](java-orders-api) | Java 21, Spring Boot 3, JPA, Flyway, H2, springdoc | Layered REST API, validation, RFC 7807 errors, state machine for orders, unit + integration tests |
| [fullstack-task-board](fullstack-task-board) | TypeScript, Node.js, Express, SQLite, React, Vite | Full-stack app: REST API with zod validation, React SPA, unit and component tests |
| [playwright-e2e-suite](playwright-e2e-suite) | Playwright, TypeScript | End-to-end and API tests with Page Objects, fixtures, API-seeded data, CI report |
| [python-ai-agent](python-ai-agent) | Python 3.12+, FastAPI, pydantic, httpx | Tool-calling AI agent with RAG, prompt-injection guardrail, OpenAI-compatible client, runs offline in demo mode |
| [go-rate-limiter](go-rate-limiter) | Go 1.24, standard library | Concurrency-safe token-bucket rate limiter, HTTP middleware, race-tested |

**Main project (private code):** [IVEXA case study](ivexa-case-study) — a self-hosted AI assistant with long-term memory,
an autonomous task engine, Face ID approvals, desktop and iPhone apps, and a proprietary distributed architecture
(1.85× speed-up in a live test, US patent applications filed).

## Quick start

```bash
# Java
cd java-orders-api && mvn verify

# TypeScript full-stack + e2e
cd fullstack-task-board && npm ci && npm test
cd ../playwright-e2e-suite && npm ci && npx playwright install chromium && npx playwright test

# Python AI agent (no API key needed)
cd python-ai-agent && pip install -e ".[dev]" && pytest && python -m support_agent --demo "How long does shipping take?"

# Go
cd go-rate-limiter && go test -race ./...
```

## About me

Israeli citizen, working remotely, 5+ years in software development (since 2020). Builder of
[IVEXA](ivexa-case-study), a private self-hosted AI assistant with a proprietary distributed
architecture (US patent applications filed). Before that I ran my own IT company with a development
team (2020–2023). All my work communication is in writing, and I prefer to show my level through a
real paid test task.

- LinkedIn: https://www.linkedin.com/in/andrei-zagainov-245087362
- Email: zagainov.andrey.1989+jobs@gmail.com

License: MIT
