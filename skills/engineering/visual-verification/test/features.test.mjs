import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { serve, shotSession } from './helpers.mjs';

const EMULATION = `<!doctype html><p id="out"></p><script>
out.textContent = [
  innerWidth + 'x' + innerHeight,
  matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  matchMedia('(prefers-reduced-motion: reduce)').matches ? 'still' : 'moving',
].join(' ');
</script>`;

const NETWORK = `<!doctype html><button onclick="load()">Load</button><button onclick="post()">Post</button><ul id="list"></ul><script>
async function load() {
  const { items } = await fetch('/api/items').then((r) => r.json());
  list.innerHTML = items.map((i) => '<li>' + i + '</li>').join('');
  fetch('/api/missing');
}
async function post() {
  list.innerHTML = '<li>' + (await fetch('/api/items', { method: 'POST', body: JSON.stringify({ name: 'new' }) }).then((r) => r.text())) + '</li>';
}
</script>`;

let server;
let session;
before(async () => {
  server = await serve({
    '/emulation': EMULATION,
    '/network': NETWORK,
    '/api/items': { type: 'application/json', body: JSON.stringify({ items: ['from server'] }) },
  });
  session = await shotSession(server.base);
});
after(async () => {
  await session.stop();
  await server.close();
});

test('open --viewport --dark --reduced-motion reach the page, and the next open resets them', async () => {
  const opened = await session.shot('open', '/emulation', '--viewport', '1024x700', '--dark', '--reduced-motion');
  assert.equal(opened.viewport, '1024x700');
  assert.equal((await session.shot('expect', '1024x700 dark still')).ok, true);
  await session.shot('open', '/emulation', '--light');
  assert.equal((await session.shot('expect', '1440x900 light moving')).ok, true, 'viewport and reduced motion reset; --light forces light on a dark-mode OS');
  assert.equal((await session.shot('open', '/emulation', '--viewport', 'wide')).ok, false);
});

test('network lists the requests a click sent, and --failed keeps the errors', async () => {
  await session.shot('open', '/network');
  await session.shot('click', 'Load');
  const { requests } = await session.shot('network');
  assert.deepEqual(
    requests.map((r) => `${r.method} ${new URL(r.url).pathname} ${r.status}`),
    ['GET /network 200', 'GET /api/items 200', 'GET /api/missing 404'],
  );
  const failed = await session.shot('network', '--failed');
  assert.deepEqual(failed.requests.map((r) => new URL(r.url).pathname), ['/api/missing']);
});

test('mock fulfils GETs, lets other methods through, and clears', async () => {
  const set = await session.shot('mock', '**/api/items', '--body', '{"items":["mocked one","mocked two"]}');
  assert.equal(set.mocks[0].contentType, 'application/json');
  await session.shot('open', '/network');
  const clicked = await session.shot('click', 'Load');
  assert.deepEqual(clicked.mocked.map((u) => new URL(u).pathname), ['/api/items']);
  assert.equal((await session.shot('expect', 'mocked two')).ok, true);
  await session.shot('click', 'Post');
  assert.equal((await session.shot('expect', 'from server')).ok, true, 'the POST reached the server');
  const { requests } = await session.shot('network', '--filter', '/api/items');
  assert.deepEqual(requests.map((r) => [r.method, r.postData ?? null]), [['GET', null], ['POST', '{"name":"new"}']]);
  assert.equal((await session.shot('mock', 'clear')).cleared, 1);
  await session.shot('open', '/network');
  await session.shot('click', 'Load');
  assert.equal((await session.shot('expect', 'from server')).ok, true);
});
