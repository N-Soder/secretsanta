// Run against `yarn wrangler pages dev dist` with local D1 and Turnstile test keys.
// No real emails are sent; working tokens are held in memory and never printed.
import assert from 'node:assert/strict';

const origin = process.env.LOCAL_API_ORIGIN ?? 'http://127.0.0.1:8788';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Local checks must target localhost');
async function call(path, method = 'GET', body) {
  return fetch(`${origin}${path}`, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const settings = {
  message: 'Integration fixture', budgetAmount: 3000, budgetCurrency: 'AUD', eventDate: null,
  timezone: 'Australia/Sydney', remindersEnabled: false, organiserEmail: null,
};
const people = ['Ann', 'Bob', 'Cat'].map(name => ({ id: name.toLowerCase(), name, hint: '', email: null, rules: [] }));
let manageToken;
try {
  const missing = await call('/api/unknown-route');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('Cache-Control'), 'no-store');
  assert.equal((await missing.json()).error, 'notFound');
  const wrongMethod = await call('/api/groups');
  assert.equal(wrongMethod.status, 405);
  const created = await call('/api/groups', 'POST', { settings, participants: people, turnstileToken: 'test-token' });
  assert.equal(created.status, 201, `Creation failed: ${await created.clone().text()}`);
  assert.equal(created.headers.get('Cache-Control'), 'no-store');
  const data = await created.json();
  manageToken = data.manageToken;
  const path = `/api/manage/${manageToken}`;
  const managed = await call(path);
  assert.equal(managed.status, 200, 'Dynamic manage route failed');
  let view = await managed.json();
  assert.equal(view.participants.length, 3);
  assert(!/wishlist|pairings|receiver/.test(JSON.stringify(view)), 'Organiser response disclosed secret content');
  const participant = view.participants[0];
  const token = new URL(participant.link).pathname.split('/').pop();
  let response = await call(`/api/s/${token}/wishlist`, 'PUT', { wishlist: 'Tea please' });
  assert.equal(response.status, 200);
  response = await call(`/api/s/${token}`);
  assert.equal(response.status, 200, 'Participant dynamic route failed');
  assert.equal((await response.json()).ownWishlist, 'Tea please');
  view = await (await call(path)).json();
  assert.equal(view.participants[0].opened, true);
  const participants = view.participants.map(({ id, name, hint, email, rules }) => ({ id, name, hint, email, rules }));
  response = await call(`${path}/redraw`, 'POST', { participants, drawVersion: view.drawVersion, confirm: false });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'needsConfirm');
  const redraw = { participants, drawVersion: view.drawVersion, confirm: true };
  const concurrent = await Promise.all([call(`${path}/redraw`, 'POST', redraw), call(`${path}/redraw`, 'POST', redraw)]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409], 'D1 failed to serialise redraws');
  view = await (await call(path)).json();
  assert.equal(view.drawVersion, 2);
  assert.equal(view.participants[0].link, participant.link);
  response = await call(`/api/s/${token}`);
  assert.equal((await response.json()).ownWishlist, 'Tea please');
  response = await call(path, 'PATCH', { revision: view.revision, settings: { message: 'Edited fixture' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).settings.message, 'Edited fixture');
  response = await call(path, 'PATCH', { revision: view.revision, settings: { message: 'Stale' } });
  assert.equal(response.status, 409);
  for (const format of ['history', 'links', 'json']) {
    const exported = await call(`${path}/export?format=${format}`);
    assert.equal(exported.status, 200, `${format} export route failed`);
    assert.equal(exported.headers.get('Cache-Control'), 'no-store');
    assert.equal(exported.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(exported.headers.get('X-Content-Type-Options'), 'nosniff');
    assert(exported.headers.get('Content-Disposition').includes(`secret-santa-${format}-`));
    const bytes = new Uint8Array(await exported.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    assert(!text.includes('Tea please'), 'Export disclosed wishlist');
    if (format === 'json') {
      const body = JSON.parse(text);
      assert.equal(body.message, 'Edited fixture');
      assert.equal(body.budget, 30);
      assert.equal(body.participants.length, 3);
      assert(!/pairing|receiver|token|link|wishlist/.test(text), 'JSON disclosed secret content');
    } else {
      assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'CSV missing UTF-8 BOM');
      if (format === 'history') {
        assert(text.includes('secret-santa-history/2'));
        assert(text.startsWith('format_version,exported_at,participant_id,name,email,'));
        assert(!text.includes(token), 'History disclosed access token');
        const lines = text.trim().split('\r\n');
        const ids = new Set(lines.slice(1).map(line => line.split(',')[2]));
        assert.equal(ids.size, 3);
        for (const line of lines.slice(1)) assert(ids.has(line.split(',')[8]), 'Export mixed draw generations');
      } else {
        assert(text.startsWith('name,email,link\r\n'));
        assert(text.includes(participant.link), 'Links export failed to preserve link');
      }
    }
  }
  assert.equal((await call(`${path}/export?format=json`, 'POST')).status, 405);
  assert.equal((await call(`${path}/export?format=unknown`)).status, 400);
  assert.equal((await call(`/api/manage/${token}/export?format=json`)).status, 404);
  response = await call(path, 'DELETE');
  assert.equal(response.status, 204);
  assert.equal((await call(`/api/s/${token}`)).status, 404);
  assert.equal((await call(path)).status, 404);
  assert.equal((await call(`${path}/export?format=json`)).status, 404);
  console.log('Local Pages/D1 checks passed: authenticated exports, create, manage, wishlist, opening guard, concurrent redraw, preserved link/wishlist, edit conflict and cascade delete.');
} finally {
  if (manageToken) await call(`/api/manage/${manageToken}`, 'DELETE');
}
