# Task Board – Playwright E2E Suite

End-to-end tests for the [Task Board](../fullstack-task-board) app, written with
**Playwright Test** and **TypeScript**. The suite builds and starts the real application
(API + web app in one Node.js process, in-memory SQLite), seeds data through the REST API
and drives the UI in headless Chromium.

Author: **Andrei Zagainov**

Built with modern AI coding tools; every change reviewed and tested by me.

## What is covered

| Area | Spec | Scenarios |
|------|------|-----------|
| Create task | `tests/ui/create-task.spec.ts` | all fields, create in another column + reload, append order, cancel |
| Edit task | `tests/ui/edit-task.spec.ts` | update fields, clear assignee, change status via form, Escape discards |
| Move task | `tests/ui/move-task.spec.ts` | todo → in progress → done → back, append order, edge buttons, API-side move |
| Delete task | `tests/ui/delete-task.spec.ts` | confirm, cancel, empty column state |
| Validation | `tests/ui/validation.spec.ts` | empty / blank title (no request sent), server-side length error, recovery, edit form |
| Filter | `tests/ui/filter.spec.ts` | options list, filter across columns, switch / clear, create while filtered |
| API | `tests/api/*.spec.ts` | task lifecycle, filtering, positions, validation and 404 error shapes, boards CRUD + cascade, malformed JSON |

## Stack

- `@playwright/test` with TypeScript (strict)
- Page Object Model in `pages/`
- Custom fixtures in `fixtures/test.ts`
- Typed API client in `helpers/api-client.ts` for seeding and assertions
- HTML reporter, traces on first retry, screenshots and video on failure

## Project layout

```
playwright-e2e-suite/
├── playwright.config.ts     # webServer, chromium project, reporters, retries, traces
├── fixtures/
│   └── test.ts              # `api`, `board`, `boardPage` fixtures
├── helpers/
│   ├── api-client.ts        # TaskBoardApi: typed REST helpers used for seeding
│   ├── data.ts              # unique, collision-free names
│   └── types.ts             # API types shared by tests
├── pages/
│   ├── BoardPage.ts         # toolbar, filter, columns
│   ├── BoardColumn.ts       # one column: cards, count, ordered titles
│   ├── TaskCard.ts          # one card: move / edit / delete actions
│   └── TaskDialog.ts        # create / edit modal
└── tests/
    ├── ui/                  # browser tests
    └── api/                 # request-context tests
```

## Running

Requirements: Node.js 22.12+. The app lives in the sibling folder `../fullstack-task-board`
and must have its dependencies installed.

```bash
# once
(cd ../fullstack-task-board && npm install)
npm install
npx playwright install --with-deps chromium   # skip if Chromium is already installed

# run everything (builds and starts the app on port 4173 automatically)
npm test

npm run test:ui        # browser tests only
npm run test:api       # API tests only
npm run test:headed    # watch the browser
npm run report         # open the last HTML report
```

### Configuration

| Variable       | Default | Description |
|----------------|---------|-------------|
| `E2E_PORT`     | `4173`  | Port used for the app started by `webServer` |
| `E2E_BASE_URL` | unset   | Run against an already running instance instead of starting one |
| `CI`           | unset   | Enables retries (2), `forbidOnly`, 2 workers and the GitHub reporter |

Locally an already running server on the same port is reused, which keeps the
edit-run loop fast; on CI a fresh server is always started.

## Design notes

- **Isolation without resets.** The `board` fixture creates a brand-new board through the
  API for every test and deletes it afterwards (tasks cascade). Tests never share data, so
  the suite runs fully parallel and is safe to retry; there is no "reset database" endpoint
  in the app just for testing.
- **Seed through the API, assert through the UI (and back).** Set-up that is not under test
  (existing tasks, statuses, assignees) is created with `TaskBoardApi`; key UI actions are
  then verified both on screen and through the API, so a test fails if the UI only *looks*
  right.
- **Accessible locators first.** Page objects prefer roles and labels (`getByRole('region',
  { name: 'Done' })`, `getByRole('article', { name: title })`, `getByLabel('Title')`), which
  also checks that the markup is accessible. `data-testid` is used for elements without a
  meaningful accessible name (counts, error slots, action buttons inside a card).
- **Web-first assertions only.** No fixed sleeps; every check uses Playwright's
  auto-retrying `expect`, and column contents are asserted as exact ordered lists.
- **Stability check.** The suite was run with `--repeat-each=3 --workers=4` without retries
  to make sure there are no flaky tests.

## License

MIT
