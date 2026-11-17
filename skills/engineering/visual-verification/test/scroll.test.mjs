import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { serve, shotSession, topLeftPixel } from './helpers.mjs';

const prose = `<p>${'Words that wrap onto many more lines on a phone than on a desktop. '.repeat(6)}</p>`.repeat(60);
const PAGE = `<!doctype html><style>
body { margin: 0; font: 16px/1.5 sans-serif; } footer { height: 2000px; background: rgb(0, 255, 0); }
.box { overflow: auto; height: 100vh; } .box div { height: 3000px; background: rgb(255, 0, 0); } .box div + div { background: rgb(0, 255, 0); }
</style><script>setInterval(() => document.body.offsetHeight, 50);</script>`;

let server;
let session;
before(async () => {
  server = await serve({
    '/text': `${PAGE}${prose}<footer>End</footer>`,
    '/smooth': `${PAGE}<style>html { scroll-behavior: smooth; }</style>${prose}<footer>End</footer>`,
    '/nested': `${PAGE}<main class="box"><div></div><div>Inner end</div></main>`,
    '/breakpoint': `${PAGE}<div id="app"></div><script>
      const render = () => (app.innerHTML = \`${prose}\`.repeat(innerWidth < 600 ? 1 : 0) + '<footer>End</footer>');
      render();
      addEventListener('resize', render);
    </script>`,
  });
  session = await shotSession(server.base);
});
after(async () => {
  await session.stop();
  await server.close();
});

async function scrollThenShoot(pagePath, scrollArgs, openArgs = []) {
  assert.equal((await session.shot('open', pagePath, ...openArgs)).ok, true);
  const scrolled = await session.shot('scroll', ...scrollArgs);
  const file = path.join(session.dir, `${pagePath.slice(1)}-${scrollArgs.join('')}-${openArgs.join('')}.png`);
  await session.shot('screenshot', file, '--full-res');
  const { r, g, b } = topLeftPixel(file);
  return { scrolled, pixel: [r, g, b] };
}

test('a mobile screenshot keeps the scroll position the scroll command reached', async () => {
  const { scrolled, pixel } = await scrollThenShoot('/text', ['--by', '99999'], ['--mobile']);
  assert.equal(scrolled.scrollY, scrolled.scrollHeight - 844, 'scrolled to the bottom');
  assert.deepEqual(pixel, [0, 255, 0], 'the screenshot shows the green footer, not the text above it');
});

test('a page that re-renders at a JS breakpoint keeps its scroll position between commands', async () => {
  const { scrolled, pixel } = await scrollThenShoot('/breakpoint', ['--by', '99999'], ['--mobile']);
  assert.equal(scrolled.scrollY, scrolled.scrollHeight - 844);
  assert.deepEqual(pixel, [0, 255, 0], 'the screenshot shows the green footer');
});

test('scroll --to waits for a smooth scroll before reporting', async () => {
  const { scrolled, pixel } = await scrollThenShoot('/smooth', ['--to', 'End'], ['--mobile']);
  assert.equal(scrolled.inView, true);
  assert.deepEqual(pixel, [0, 255, 0]);
});

test('scroll --by reports and waits on the nested scroller it moved', async () => {
  const { scrolled, pixel } = await scrollThenShoot('/nested', ['--by', '4000']);
  assert.equal(scrolled.scrollY, 4000, 'reports the scroller that moved, not window.scrollY');
  assert.deepEqual(pixel, [0, 255, 0]);
});
