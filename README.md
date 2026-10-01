# Secret Santa

## Stored groups development

The `feat/stored-groups` branch adds Cloudflare Pages Functions and D1 behind the
existing React app. The core stored-group API, authenticated exports and durable email/recovery
endpoints and the hourly reminder Worker are implemented; browser integration
is still in progress.
This branch is stacked on `feat/email-links` (PR #8).

Use Node 22 and Yarn 4.5.1. For local development:

```sh
yarn install --immutable --mode skip-build
cp .dev.vars.example .dev.vars
yarn wrangler d1 migrations apply secretsanta --local
yarn build
yarn dev:pages
```

The example variables use Turnstile test keys and a test encryption key. Hosted
environments need their own random `LINK_KEY` and real Turnstile keys. `.dev.vars`
and `.wrangler/` are ignored by git. Local migrations operate on local D1; they do
not modify the hosted databases.

In a second terminal, run:

```sh
yarn test:local-api
yarn test:local-email
```

This checks the actual Pages dynamic routes and D1 transaction behaviour, including
concurrent redraws, wishlist preservation, stale edits, authenticated downloads
and cascading deletion. It
creates and deletes an isolated test group and sends no emails. It refuses a remote
URL; `LOCAL_API_ORIGIN` can select another localhost port. The separate
`test:local-email` command uses ephemeral actual D1 and a fake email provider to
check durable claims, retries, recovery rotation, overlapping sweeps and expiry. It needs no server
and sends no real emails. Run unit checks with
`yarn test` and `yarn typecheck`.

Production and Preview have separate D1 bindings in `wrangler.toml` and separate
Pages secrets. Add `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` and `LINK_KEY` under
Workers & Pages → secretsanta → Settings → Variables and Secrets, selecting the
intended environment. The sender is configured as `EMAIL_FROM` in Wrangler.

The manage PATCH API requires the current `revision` from its GET response;
conflicting edits return 409. Redraw requires the current `drawVersion` and an
explicit confirmation once someone has opened a participant link. Participant
links and wishlists survive redraws for retained people. Organiser responses do
not include pairings or wishlists.

### Downloads and file imports

`GET /api/manage/<token>/export?format=history|links|json` returns an authenticated
attachment, with no-store/no-referrer headers. All export components are read
in one D1 transaction so settings and participants belong to the same draw.

- History CSV v2 carries participant emails, explicit rules, actual pairings,
  message, budget, currency and event date. It excludes access links and wishlists.
  Previous history exclusions are not accumulated in this export; importing can
  add the exported pairings as this year's avoid-repeat rules. CSV v1 is rejected.
- Links CSV has `name,email,link` columns and uses the group's original site URL.
- JSON carries the current setup, organiser email and every active exclusion,
  with name-based rules. It excludes pairings, links, tokens and wishlists.

File budgets use major units (for example `29.95`); API/database amounts use
integer cents. CSV values are protected against spreadsheet formula injection.
The current browser import retains new settings in `secretSantaImportedSettings`
until the stored-group home flow replaces the legacy browser flow. That later
work must remove persistent email/assignment data from localStorage.

### Email operations and recovery

`POST /api/manage/<token>/send` accepts `kind: link|match_changed`, optional
unique `participantIds` belonging to the group, and a fresh Turnstile token.
Default selection skips successful sends only for the current draw. Explicit
ids allow resending after success; targeted retries reuse pending operations.
Responses contain only recipient ids and success flags. Missing email config
returns 503. Stored links are built from the group's original site origin.

Migration `0003_email_operations.sql` adds an encrypted outbox. Each recipient
operation has a unique provider key, immutable sealed request payload, attempt
count and 60-second lease. Bulk SQL keeps a 100-person group within D1's query
budget. Resend rate-limit retries keep the same payload and key. Successful
completion records `send_log` and erases the payload in one transaction.
Operation state cascades on group deletion/expiry or participant removal.

An unresolved attempt becomes `uncertain` after 23 hours, before Resend's
24-hour idempotency retention expires. It is not automatically retried with a
fresh key. Reconcile provider acceptance before changing that state; future UI
must preserve this rule; the sweeper already does. Pending content stays encrypted under
`LINK_KEY`; retain the environment's original key for the lifetime of its groups.
There is no key rotation interface in this branch.

`POST /api/recover` accepts an email and fresh Turnstile token. It always returns
`202 {accepted: true}` for a valid request, regardless of address lookup or
provider delivery outcome. Pending replacement tokens are hashed in D1 and
sealed only inside the email payload. A pending link is usable before delivery
completion is recorded, while the existing manage link remains valid. Successful
delivery atomically rotates the manage hash and records the send. Concurrent
recoveries share the same pending replacement. Changing the organiser email or
successfully rotating again revokes stale pending links. Unresolved recovery
attempts also obey the 23-hour cutoff; existing access survives failure.

### Hourly expiry and reminders

`workers/sweeper/index.ts` runs hourly (`0 * * * *`). It deletes expired groups
before scanning opted-in groups in pages of 20. Reminder timing uses each group's
IANA timezone: 09:00 seven days or one day before the event. The shared timing
helper selects the one-day kind once due and sends nothing on or after the event
in local time. Only participants with email addresses are selected.

The Worker uses the shared encrypted outbox, leases and stable provider keys.
Repeated runs, overlapping runs and date edits do not repeat a successful kind
for the same participant/draw. A new draw has its own reminder slots. Group
failures are isolated and pending delivery can resume next hour within the
23-hour retry window. Missing email configuration disables reminders while
expiry still runs. Stored `site_origin` keeps preview links on the preview site.

The scheduled handler exposes no HTTP handler. Aggregate logs contain deleted
group counts, recipient selections/successes/failures and group failures, with
no addresses, tokens or exception bodies. `reminderAttempts` counts selections,
including blocked leases and uncertain operations; it is not a provider-call
count. A group exception increments `groupFailures` without recipient counts.

`workers/sweeper/wrangler.toml` binds `secretsanta-sweeper` only to live D1 and
`--env preview` selects `secretsanta-sweeper-preview` with only preview D1.
Provision each Worker's own `RESEND_API_KEY` and the exact `LINK_KEY` used by its
corresponding Pages environment before deployment. Pages secrets are not copied
automatically. Deployment and hosted migrations remain a later authorised step.

Verify both bundles without deployment:

```sh
yarn wrangler deploy --config workers/sweeper/wrangler.toml --env '' --dry-run --outdir .wrangler/sweeper-build
yarn wrangler deploy --config workers/sweeper/wrangler.toml --env preview --dry-run --outdir .wrangler/sweeper-preview-build
```

For a local scheduled runtime check with email disabled:

```sh
yarn wrangler d1 migrations apply secretsanta-preview --local --config workers/sweeper/wrangler.toml --env preview
yarn wrangler dev --config workers/sweeper/wrangler.toml --env preview --test-scheduled --ip 127.0.0.1 --port 8790 --var RESEND_API_KEY:
```

In another terminal, request `http://127.0.0.1:8790/__scheduled` with an API client.
Worker local D1 state lives under `workers/sweeper/.wrangler/`; it is separate
from Pages local state. The fake-provider contract in `yarn test:local-email`
checks actual D1 reminder delivery without sending real email.
See Cloudflare's [scheduled handler documentation](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
and [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

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
