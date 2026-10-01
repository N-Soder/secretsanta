Many thanks to [Maël Nison](https://github.com/arcanis) for the original [Secret Santa project](https://github.com/arcanis/secretsanta), which this project is based on. The original MIT license is included below.

# Secret Santa

A Secret Santa draw that runs at [secretsanta.soderholm.app](https://secretsanta.soderholm.app).
An organiser adds people, rules and optional details (message, budget, event date, email
addresses), and each person gets a private short link showing only who they are buying for.

- **Short links**: `/s/<code>` for each participant, `/manage/<code>` for the organiser.
- **Safe edits after the draw**: names, hints, emails and details save straight away. Changing
  people or rules needs a redraw, which is free until someone opens their link and guarded by a
  warning after that.
- **Wishlists**: each person can leave one note that only their Santa sees.
- **Optional email** through Resend: links, "your match changed", opt-in reminders 7 days and 1
  day before the event, and organiser link recovery (`/recover`).
- **Automatic deletion** on the first 1 February at least 14 days after the later of the creation
  date and the event date, or straight away with "Delete now".
- **Files**: links CSV, a full history CSV (with pairings, for avoiding repeats next year) and a
  JSON setup export/import.
- `/s/demo` shows a sample card. `/privacy` is the privacy notice.

## How it works

- React SPA (Vite, Tailwind, react-router) served by Cloudflare Pages.
- Pages Functions under `functions/api/*` over one D1 database (binding `DB`). Shared logic lives
  in `functions/_shared/*`. The draw runs on the server with `src/utils/generatePairs.ts`, so the
  browser never holds the full pairing list.
- A separate cron Worker (`workers/sweeper`) deletes expired groups and sends due reminders.
- Turnstile protects the endpoints that create groups or send email.

### Privacy and security rules

- The manage token is stored only as a SHA-256 hash. Participant tokens are stored as a hash plus
  an AES-GCM seal under `LINK_KEY`.
- Organiser responses never include pairings or wishlists. The history CSV export is the only
  exception.
- Every API response sends `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; token
  pages use no-referrer too (`public/_headers`). Every write rejects a missing or foreign
  `Origin`. Bodies over 64 KiB get 413. Unknown `/api/*` paths and methods get JSON 404/405.
- No email contains the receiver's name. Logs never contain tokens, addresses, wishlists,
  pairings or provider bodies.
- The browser keeps only a sanitised setup draft (no email addresses) and one organiser
  continuation token in `localStorage`. Group, reveal and wishlist data stay in memory.

## API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/config` | – | `{ emailEnabled, turnstileSiteKey }` |
| `POST /api/groups` | Turnstile | Create a group and run the draw. Returns the manage token and participant links. |
| `GET / PATCH / DELETE /api/manage/:token` | manage token | Read, safely edit (needs the current `revision`; conflicts return 409) or delete. |
| `POST /api/manage/:token/redraw` | manage token | Replace people and rules and redraw. Needs the current `drawVersion`, and `confirm: true` once anyone has opened their link. |
| `POST /api/manage/:token/send` | manage token + Turnstile | `kind: link \| match_changed`, optional `participantIds`. Returns per-recipient success. |
| `GET /api/manage/:token/export?format=history\|links\|json` | manage token | Authenticated download. |
| `GET /api/s/:token` | participant token | The participant's match, the receiver's hint and wishlist, their own wishlist and the group details. The first read sets `first_viewed_at`. |
| `PUT /api/s/:token/wishlist` | participant token | Save the participant's wishlist. |
| `POST /api/recover` | Turnstile | Email a new organiser link for each group with that address. Always `202 {accepted: true}`. |

Impossible draws return 422 with the stuck givers. Unknown or deleted tokens return 404.

### Files

- **History CSV v2** has participant emails, explicit rules, actual pairings, message, budget,
  currency and event date. It has no links or wishlists. Importing it can add the pairings as
  this year's avoid-repeat rules. CSV v1 is rejected.
- **Links CSV** has `name,email,link` columns, using the group's original site URL.
- **JSON** has the setup, organiser email and every active exclusion, with name-based rules. It
  has no pairings, links, tokens or wishlists.

File budgets use major units (`29.95`); the API and database use integer cents. CSV values are
protected against spreadsheet formula injection.

### Email delivery

Sends go through a durable, encrypted outbox (`email_operations`, migration 0003):

- Each operation has its own Resend idempotency key, a sealed payload, an attempt count and a
  60-second lease.
- On success, `send_log` is written and the payload erased in one transaction. Operation state
  cascades when a group is deleted or expires, or when a person is removed.
- A failed send is retried with its original payload and key, even after content edits, so a lost
  provider reply is never duplicated. If the recipient's address changes, the old operation is
  replaced.
- After 23 hours (just inside Resend's 24-hour idempotency window) an unresolved operation is
  quarantined as `uncertain` and never replayed. Default and reminder sends skip it; an explicit
  per-person resend replaces it.
- Recovery creates a pending replacement link. The existing organiser link keeps working until
  delivery succeeds, then it's rotated. Concurrent requests share one pending replacement. A
  quarantined recovery, or one addressed to a since-changed organiser email, is replaced by the
  next request. Delivery finishes after the 202 reply (`waitUntil`), so timing doesn't reveal
  whether an address has groups.

### Hourly sweeper

`workers/sweeper` runs at `0 * * * *`:

1. It deletes expired groups.
2. It scans opted-in groups in pages of 20. Each reminder is due from 09:00 until the end of its
   own day (7 days and 1 day before the event) in the group's IANA timezone. A late "in 7 days"
   is never sent, and nothing is sent on or after the event date.
3. Each (participant, kind, draw version) is sent at most once.

With no email configuration, the sweeper only deletes. Logs contain aggregate counts only.

## Development

Use Node 22 and Yarn 4.5.1.

```sh
yarn install --immutable --mode skip-build
cp .dev.vars.example .dev.vars        # Turnstile test keys and a test LINK_KEY
yarn wrangler d1 migrations apply secretsanta --local
yarn build
yarn dev:pages                        # http://127.0.0.1:8788
```

Checks:

```sh
yarn test            # unit and function tests (node:sqlite stands in for D1)
yarn typecheck
yarn build
yarn wrangler pages functions build --outdir .wrangler/function-build
yarn test:local-api  # against the running local Pages/D1 server
yarn test:local-email  # actual local D1 with a fake email provider
```

`test:local-api` checks the real Pages routes and D1 transactions: concurrent redraws, wishlist
preservation, stale edits, downloads and cascading deletion. It creates and deletes its own test
group, sends no email and refuses a remote URL (`LOCAL_API_ORIGIN` can pick another localhost
port).

To run the sweeper locally with email disabled:

```sh
yarn wrangler d1 migrations apply secretsanta-preview --local --config workers/sweeper/wrangler.toml --env preview
yarn wrangler dev --config workers/sweeper/wrangler.toml --env preview --test-scheduled --ip 127.0.0.1 --port 8790 --var RESEND_API_KEY:
# then request http://127.0.0.1:8790/__scheduled
```

`/tests/browser/turnstile.html` is a Vite-only Turnstile fixture (`yarn vite --host 127.0.0.1`).
With `?fake`, `window.runTurnstileChecks()` runs deterministic lifecycle checks.

`.dev.vars` and `.wrangler/` are ignored by git.

## Deployment

Cloudflare Pages project `secretsanta` builds from GitHub and deploys `main` to production.
Other branches get preview deployments. `wrangler.toml` is the source of truth for bindings and
plain variables.

| | Production | Preview |
|---|---|---|
| D1 | `secretsanta` | `secretsanta-preview` |
| Sweeper Worker | `secretsanta-sweeper` | `secretsanta-sweeper-preview` (`--env preview`) |

Secrets are set separately for each environment and are never committed:

- **Pages** (each environment): `LINK_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`.
- **Sweeper Workers**: `LINK_KEY` (the same value as the matching Pages environment) and
  `RESEND_API_KEY`.

`LINK_KEY` is 32 random bytes in base64 (`openssl rand -base64 32`). Never change it once
groups exist: stored links and pending emails depend on it. Pipe secrets in rather than passing
them as arguments:

```sh
openssl rand -base64 32 | yarn wrangler pages secret put LINK_KEY --project-name secretsanta --env preview
```

Migrations and the sweeper:

```sh
yarn wrangler d1 migrations apply secretsanta-preview --remote --env preview
yarn wrangler d1 migrations apply secretsanta --remote
yarn wrangler deploy --config workers/sweeper/wrangler.toml --env preview
yarn wrangler deploy --config workers/sweeper/wrangler.toml --env ''
```

Apply migrations before merging code that needs them. Email is sent from
`Secret Santa <santa@updates.soderholm.app>` (`EMAIL_FROM`). Without `RESEND_API_KEY`,
`/api/config` reports `emailEnabled: false` and the UI hides email controls.

## Upstream project

<img align="right" height="160" src="https://user-images.githubusercontent.com/1037931/87014534-92e21280-c1cc-11ea-9675-5f2c0f3c287f.png"/>

Check it live on [mael.dev/secretsanta/](https://mael.dev/secretsanta/) 🎄

Should you appreciate this tool so much that you'd like to thank me, you can either drop a friendly note in this repository's issues, or be a [one-time sponsor](https://github.com/sponsors/arcanis?frequency=one-time&sponsor=arcanis). Either would make my day 😊

<br/>

## License (MIT)

> **Copyright © 2015 Maël Nison**
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
