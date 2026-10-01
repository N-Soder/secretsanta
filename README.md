# Secret Santa

## Stored groups development

The `feat/stored-groups` branch adds Cloudflare Pages Functions and D1 behind the
existing React app. The stored-group API is implemented; the browser integration,
exports, stored-group email/recovery and reminder Worker are still in progress.
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
```

This checks the actual Pages dynamic routes and D1 transaction behaviour, including
concurrent redraws, wishlist preservation, stale edits and cascading deletion. It
creates and deletes an isolated test group and sends no emails. It refuses a remote
URL; `LOCAL_API_ORIGIN` can select another localhost port. Run unit checks with
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
