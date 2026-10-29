# Task Board

A small, production-style kanban board written in TypeScript end to end:
a REST API (Express + SQLite) and a React single-page app with three columns
(**To do**, **In progress**, **Done**). In production a single Node.js process
serves both the API and the built web app.

Author: **Andrei Zagainov**

Built with modern AI coding tools; every change reviewed and tested by me.

## Features

- Multiple boards; the selected board is kept in the URL (`/?board=3`)
- Create, edit and delete tasks (title, description, assignee, status)
- Move tasks between columns (ordering is kept consistent server-side)
- Filter tasks by assignee
- Client-side and server-side validation, with errors shown next to the field
- Accessible markup: labelled form controls, `role="dialog"` modal, labelled
  column regions, descriptive button labels; stable `data-testid` hooks for e2e tests

## Stack

| Layer   | Tools |
|---------|-------|
| API     | Node.js 22, Express 5, TypeScript, zod (validation), better-sqlite3 (SQLite), pino / pino-http (structured JSON logs) |
| Web     | React 19, TypeScript, Vite 7, plain CSS (light and dark themes) |
| Tests   | vitest, supertest (API), @testing-library/react + user-event + jsdom (components) |
| Tooling | npm workspaces, concurrently |

The database is real SQLite through `better-sqlite3` (no in-memory fallback is needed);
tests use SQLite's `:memory:` mode.

## Project layout

```
fullstack-task-board/
├── package.json          # workspace root: dev / build / start / test scripts
├── server/
│   ├── src/
│   │   ├── index.ts      # entry point: config, DB, HTTP server, graceful shutdown
│   │   ├── app.ts        # Express app factory (used by tests and index.ts)
│   │   ├── config.ts     # environment configuration
│   │   ├── db.ts         # SQLite connection + migrations
│   │   ├── repository.ts # data access for boards and tasks
│   │   ├── schemas.ts    # zod request schemas
│   │   ├── errors.ts     # HttpError types + error middleware
│   │   ├── logger.ts     # pino logger
│   │   └── routes/       # boards.ts, tasks.ts
│   └── tests/            # vitest + supertest
└── web/
    ├── src/
    │   ├── App.tsx       # board selection, empty state
    │   ├── api.ts        # typed fetch client + ApiError
    │   ├── components/   # BoardView, Column, TaskCard, TaskDialog, FilterBar, NewBoardForm
    │   └── __tests__/    # component tests
    └── vite.config.ts    # dev proxy /api -> :3001, test config
```

## Getting started

Requirements: Node.js 22.12+ and npm.

```bash
npm install          # installs server and web (npm workspaces)
npm run dev          # API on http://localhost:3001, web on http://localhost:5173 (proxied /api)
```

Production mode (one process):

```bash
npm run build        # builds web (vite) and server (tsc)
npm start            # serves API + web app on http://localhost:3001
```

### Configuration

| Variable        | Default                       | Description |
|-----------------|-------------------------------|-------------|
| `PORT`          | `3001`                        | HTTP port |
| `HOST`          | `0.0.0.0`                     | Bind address |
| `DATABASE_PATH` | `server/data/task-board.db`   | SQLite file; use `:memory:` for an ephemeral DB |
| `LOG_LEVEL`     | `info`                        | pino level (`debug`, `info`, `warn`, `error`, `silent`) |
| `STATIC_DIR`    | `web/dist`                    | Directory with the built web app |
| `SERVE_STATIC`  | `true`                        | Set to `false` to run the API only |

## Testing

```bash
npm test             # server (vitest + supertest) and web (vitest + Testing Library)
npm run typecheck    # strict TypeScript checks for both packages
```

End-to-end tests live in the sibling project
[`playwright-e2e-suite`](../playwright-e2e-suite), which starts this app and drives it in Chromium.

## API

All responses are JSON. Successful responses use `{ "data": ... }`; errors use
`{ "error": { "code", "message", "details?" } }`.

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/health` | Health check |
| GET    | `/api/boards` | List boards |
| POST   | `/api/boards` | Create board `{ name }` |
| GET    | `/api/boards/:id` | Get board |
| PATCH  | `/api/boards/:id` | Rename board `{ name }` |
| DELETE | `/api/boards/:id` | Delete board (cascades to its tasks) |
| GET    | `/api/boards/:id/tasks?assignee=&status=` | List tasks, optionally filtered |
| POST   | `/api/boards/:id/tasks` | Create task `{ title, description?, assignee?, status? }` |
| GET    | `/api/boards/:id/assignees` | Distinct assignees on the board |
| GET    | `/api/tasks/:id` | Get task |
| PATCH  | `/api/tasks/:id` | Update any of `title`, `description`, `assignee`, `status` |
| POST   | `/api/tasks/:id/move` | Move task `{ status, position? }` |
| DELETE | `/api/tasks/:id` | Delete task |

Error codes: `VALIDATION_ERROR` (400), `INVALID_JSON` (400), `NOT_FOUND` (404),
`PAYLOAD_TOO_LARGE` (413), `INTERNAL_ERROR` (500).

## Design notes

- **App factory.** `createApp()` receives its dependencies (repository, logger, static dir),
  so tests build an isolated app with an in-memory SQLite database per test, without
  starting a network server.
- **Validation at the edge.** Every body, path parameter and query string goes through a zod
  schema. Objects are strict (unknown fields are rejected), strings are trimmed, a blank
  assignee becomes `null`. The error middleware turns zod issues into a stable
  `details: [{ path, message }]` list, which the UI maps back onto form fields.
- **Consistent ordering.** Each column keeps dense, zero-based `position` values. Moving,
  re-ordering and deleting run inside SQLite transactions that close and open gaps, so the
  board never ends up with duplicate or missing positions.
- **Observability.** pino writes JSON logs; every request gets an `X-Request-Id`
  (incoming header is reused when present) that appears on all log lines for that request.
- **One-process production.** After `npm run build`, the Express server serves `web/dist`
  with an SPA fallback, while unknown `/api/*` routes still return JSON 404s.
- **UI state.** The web app re-fetches from the API after each mutation instead of
  maintaining a parallel client cache: the server stays the single source of truth, which
  keeps the code small and the behaviour predictable for e2e tests.

## License

MIT
